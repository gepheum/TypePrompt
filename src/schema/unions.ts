import { InternalError, InternalErrors, Span } from "../util/shared-types.js";
import { getFirstToken } from "./get-first-token.js";
import {
  Interface,
  ResolvedType,
  SchemaView,
  StringLiteral,
  Union,
  UnionMembers,
} from "./schema-types.js";
import { resolveMaybeInvalidType, resolveType } from "./type-resolver.js";

export function computeUnionMembers(
  type: Union,
  schema: SchemaView,
): UnionMembers | InternalErrors {
  return doGetUnionMembers(type, schema, new Set());
}

function doGetUnionMembers(
  union: Union,
  schema: SchemaView,
  inProgress: Set<string>,
): UnionMembers | InternalErrors {
  const members: Member[] = [];
  const includes: Union[] = [];
  for (const rawMember of union.members) {
    // Take the first token of the raw member and not the resolved type.
    // This way, we report the error on the actual type alias used next to a
    // pipe symbol and not where the resolved type is defined.
    const errorToken = getFirstToken(rawMember);
    const resolvedMember = resolveMaybeInvalidType(rawMember, schema);
    if (!resolvedMember) {
      return EMPTY_ERROR;
    }
    switch (resolvedMember.kind) {
      case "string-literal":
      case "interface": {
        members.push({
          member: resolvedMember,
          direct: true,
          errorToken,
        });
        break;
      }
      case "union": {
        let typeName: string | undefined;
        if (rawMember.kind === "type-name") {
          typeName = rawMember.name.text;
          if (inProgress.has(typeName)) {
            return makeSingletonErrors({
              span: rawMember.name,
              message: `'${typeName}' circularly references itself`,
            });
          }
          inProgress.add(typeName);
        }
        const otherMembers = doGetUnionMembers(
          resolvedMember,
          schema,
          inProgress,
        );
        if (typeName) {
          inProgress.delete(typeName);
        }
        if (otherMembers.kind === "error") {
          /** Do not return `otherMembers` or we'll end up with duplicates. */
          return EMPTY_ERROR;
        }
        members.push(
          ...(otherMembers.kind === "interfaces"
            ? Object.values(otherMembers.members)
            : otherMembers.members
          ).map((m) => ({
            member: m,
            direct: false,
            errorToken,
          })),
        );
        includes.push(resolvedMember);
        includes.push(...otherMembers.includes);
        break;
      }
      case "array":
      case "primitive": {
        return makeSingletonErrors({
          span: errorToken,
          message: "Members of a union must be string literals or interfaces",
        });
      }
      default: {
        const _: never = resolvedMember;
        throw new Error(_);
      }
    }
  }

  const firstMember = members[0]!;
  return firstMember.member.kind === "string-literal"
    ? makeStringLiteralUnionMembers(members, includes)
    : makeInterfaceUnionMembers(members, includes, schema);
}

function makeStringLiteralUnionMembers(
  members: readonly Member[],
  includes: readonly Union[],
): UnionMembers | InternalErrors {
  // "abc" -> ["Abc", ...]
  const lowercaseToNameToken = new Map<string, [string, Span]>();
  for (const member of members) {
    if (member.member.kind === "string-literal") {
      const name = member.member.value;
      const lowercase = name.toLowerCase();
      {
        const otherNameToken = lowercaseToNameToken.get(lowercase);
        if (otherNameToken) {
          const [otherName, otherErrorToken] = otherNameToken;
          const errorTokens = [otherErrorToken, member.errorToken];
          const exactMatch = otherName === name;
          const message = exactMatch
            ? `Duplicate member '${name}'`
            : `'${name}' and '${otherName}' differ only by casing`;
          return {
            kind: "error",
            errors: errorTokens.map((span) => ({ span, message })),
          };
        }
      }
      lowercaseToNameToken.set(lowercase, [name, member.errorToken]);
    } else {
      return makeSingletonErrors({
        span: member.errorToken,
        message:
          "All members of a string-literal union must be string literals",
      });
    }
  }
  const stringLiterals = members.map((m) => m.member as StringLiteral);
  return {
    kind: "strings",
    members: stringLiterals,
    values: new Set(stringLiterals.map((m) => m.value)),
    includes: includes,
  };
}

function makeInterfaceUnionMembers(
  members: Member[],
  includes: readonly Union[],
  schema: SchemaView,
): UnionMembers | InternalErrors {
  const first = getMemberInfos(members[0]!, schema, null);
  if (first.kind === "error") {
    return first;
  }
  const memberInfos: InterfaceMemberInfo[] = [first];
  for (const member of members.slice(1)) {
    const info = getMemberInfos(member, schema, first);
    if (info.kind === "error") {
      return info;
    }
    memberInfos.push(info);
  }
  // Ensure all members have distinct discriminants.
  const lowercaseToInfo = new Map<string, InterfaceMemberInfo>();
  for (const memberInfo of memberInfos) {
    const discriminant = memberInfo.discriminant.value;
    const lowercase = memberInfo.discriminant.value.toLowerCase();
    const otherInfo = lowercaseToInfo.get(lowercase);
    if (otherInfo) {
      const otherDiscriminant = otherInfo.discriminant.value;
      const exact = discriminant === otherDiscriminant;
      if (exact) {
        const spans = [otherInfo.errorToken, memberInfo.errorToken];
        return {
          kind: "error",
          errors: spans.map((s) => ({
            span: s,
            message: `Multiple members have the same discriminant: '${discriminant}'`,
          })),
        };
      } else {
        return makeSingletonErrors({
          span: memberInfo.errorToken,
          message: `'${discriminant}' and '${otherDiscriminant}' differ only by casing`,
          rule: "Discriminants must be case-insensitively unique",
        });
      }
    }
    lowercaseToInfo.set(lowercase, memberInfo);
  }
  return {
    kind: "interfaces",
    members: Object.fromEntries(
      memberInfos.map((info) => [info.discriminant.value, info.member]),
    ),
    discriminator: first.discriminator,
    discriminants: memberInfos.map((info) => info.discriminant),
    includes: includes,
  };
}

type Member = {
  readonly member: StringLiteral | Interface;
  /**
   * True if the member is explicitly listed in the union type.
   * False if the member is included in the union type indirectly through
   * another union.
   */
  readonly direct: boolean;
  /**
   * Refers to a location in the actual union type definition.
   * Multiple members might refer to the same location.
   *
   * Consider:
   * ```
   *   type Abc = "a" | "b" | "c"
   *   type Def = Abc | "d"
   * ```
   * In this example, `Def` has 4 members ("a", "b", "c", "d"), and the first 3
   * members all refer to `Abc` on the line where `Def` is defined.
   */
  readonly errorToken: Span;
};

const EMPTY_ERROR: InternalErrors = { kind: "error", errors: [] } as const;

function makeSingletonErrors(error: InternalError): InternalErrors {
  return { kind: "error", errors: [error] };
}

type InterfaceMemberInfo = {
  readonly kind: "success";
  readonly member: Interface;
  readonly errorToken: Span;
  /** Name of the discriminator field, e.g. 'kind'. */
  readonly discriminator: string;
  readonly discriminant: StringLiteral;
};

function getMemberInfos(
  member: Member,
  schema: SchemaView,
  other: InterfaceMemberInfo | null,
): InterfaceMemberInfo | InternalErrors {
  if (member.member.kind !== "interface") {
    return makeSingletonErrors({
      span: member.errorToken,
      message: "All members of an interface union must be interfaces",
    });
  }
  let discriminatorType: ResolvedType | undefined;
  const { firstField } = member.member;
  if (firstField) {
    discriminatorType = resolveType<never>(firstField.type, schema);
  }
  const discriminator = firstField!.name.text;
  if (discriminatorType?.kind !== "string-literal") {
    return makeSingletonErrors({
      span: member.errorToken,
      message: `Type of '${discriminator}' field is not a string literal`,
      rule: "All interfaces in a union type must have a string literal as the type of their first field",
    });
  }
  if (other && discriminator !== other.discriminator) {
    return makeSingletonErrors({
      span: member.errorToken,
      message: `Discriminator field name '${discriminator}' does not match '${other.discriminator}'`,
      rule: "All interfaces in a union type must have the same discriminator field name",
    });
  }
  return {
    kind: "success",
    member: member.member,
    errorToken: member.errorToken,
    discriminator: discriminator,
    discriminant: discriminatorType,
  };
}
