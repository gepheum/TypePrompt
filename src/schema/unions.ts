import { NullableType } from "../expression/expression-types.js";
import { resolveFieldType } from "../expression/get-field-type.js";
import { makeSingletonErrors } from "../util/errors.js";
import { InternalErrors, Span } from "../util/shared-types.js";
import { getFirstToken } from "./get-first-token.js";
import {
  BooleanLiteral,
  Discriminants,
  DiscriminatedUnionMembers,
  Interface,
  ResolvedType,
  SchemaView,
  StringLiteral,
  SyntheticSchemaField,
  Type,
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
      case "any":
      case "array":
      case "boolean-literal":
      case "primitive":
      case "record": {
        return makeSingletonErrors({
          span: errorToken,
          message: "Expected: string literal or interface",
          rule: "Members of a union must all be string literals or interfaces",
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
        message: "Expected: string literal",
        rule: "All members of a string-literal union must be string literals",
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
): DiscriminatedUnionMembers | InternalErrors {
  const first = getMemberInfo(members[0]!, schema, null);
  if (first.kind === "error") {
    return first;
  }
  const memberInfos: InterfaceMemberInfo[] = [first];
  for (const member of members.slice(1)) {
    const info = getMemberInfo(member, schema, first);
    if (info.kind === "error") {
      return info;
    }
    memberInfos.push(info);
  }

  // Ensure all members have distinct discriminants.
  const lowercaseToInfo = new Map<string, InterfaceMemberInfo>();
  for (const memberInfo of memberInfos) {
    const discriminant: string | boolean = memberInfo.discriminant.value;
    const lowercase = String(discriminant).toLowerCase();
    const otherInfo = lowercaseToInfo.get(lowercase);
    if (otherInfo) {
      const otherDiscriminant: string | boolean = otherInfo.discriminant.value;
      const exact = discriminant === String(otherDiscriminant);
      if (exact) {
        const spans = [otherInfo.errorToken, memberInfo.errorToken];
        return {
          kind: "error",
          errors: spans.map((s) => ({
            span: s,
            message: `Duplicate discriminant '${discriminant}'`,
            rule: "All interfaces in a discriminated union must have distinct discriminants",
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

  const discriminants = ((): Discriminants => {
    switch (first.discriminant.kind) {
      case "string-literal": {
        return {
          type: "string",
          values: memberInfos.map((info) => info.discriminant as StringLiteral),
        };
      }
      case "boolean-literal": {
        return {
          type: "boolean",
          values: memberInfos.map(
            (info) => info.discriminant as BooleanLiteral,
          ),
        };
      }
    }
  })();

  const sharedFields = collectSharedFields(memberInfos, schema);

  return {
    kind: "interfaces",
    members: Object.fromEntries(
      memberInfos.map((info) => [info.discriminant.value, info.member]),
    ),
    discriminator: first.discriminator,
    discriminants,
    includes,
    sharedFields,
  };
}

type Member = {
  readonly member: StringLiteral | BooleanLiteral | Interface;
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

type InterfaceMemberInfo = {
  readonly kind: "success";
  readonly member: Interface;
  readonly errorToken: Span;
  /** Name of the discriminator field, e.g. 'kind'. */
  readonly discriminator: string;
  readonly discriminant: StringLiteral | BooleanLiteral;
};

function getMemberInfo(
  member: Member,
  schema: SchemaView,
  other: InterfaceMemberInfo | null,
): InterfaceMemberInfo | InternalErrors {
  if (member.member.kind !== "interface") {
    return makeSingletonErrors({
      span: member.errorToken,
      message: "All members of a discriminated union must be interfaces",
    });
  }
  const { firstField } = member.member;
  if (!firstField) {
    return makeSingletonErrors({
      span: member.errorToken,
      message: "Can't have an empty interface in a discriminated union",
    });
  }
  if (firstField.optional) {
    return makeSingletonErrors({
      span: member.errorToken,
      message: `Discriminator ('${firstField.name.text}') can't be optional`,
    });
  }
  const discriminant = resolveType(firstField.type, schema);
  const discriminator = firstField.name.text;
  if (
    discriminant.kind !== "string-literal" &&
    discriminant.kind !== "boolean-literal"
  ) {
    return makeSingletonErrors({
      span: member.errorToken,
      message: `Discriminator ('${discriminator}') is not a string/boolean literal`,
      rule: "The discriminator of every interface in a discriminated union must be a string literal or boolean literal.",
    });
  }
  if (other) {
    if (discriminator !== other.discriminator) {
      return makeSingletonErrors({
        span: member.errorToken,
        message: `Discriminator name '${discriminator}' does not match '${other.discriminator}'`,
        rule: "All interfaces in a discriminated union must have the same discriminator name",
      });
    }
    if (discriminant.kind !== other.discriminant.kind) {
      const expected = other.discriminant.kind.replace("-", " ");
      const got = JSON.stringify(discriminant.value satisfies string | boolean);
      return makeSingletonErrors({
        span: member.errorToken,
        message: `Expected: ${expected} discriminant; got: ${got}`,
        rule: "All interfaces in a discriminated union must have the same discriminant type",
      });
    }
  }
  return {
    kind: "success",
    member: member.member,
    errorToken: member.errorToken,
    discriminator: discriminator,
    discriminant: discriminant,
  };
}

function collectSharedFields(
  members: readonly InterfaceMemberInfo[],
  schema: SchemaView,
): { readonly [name: string]: SyntheticSchemaField } {
  const first = members[0]!;
  const result: SyntheticSchemaField[] = [];
  for (const [name, field] of Object.entries(first.member.fields)) {
    const fieldType = resolveFieldType(field, schema);
    if (fieldType.kind === "string-literal") {
      continue;
    }
    const isShared = members.every((m) => {
      const otherField = m.member.fields[name];
      if (!otherField) {
        return false;
      }
      const otherFieldType = resolveFieldType(otherField, schema);
      return areResolvedTypesEqual(fieldType, otherFieldType, schema);
    });
    if (isShared) {
      const docs = new Set(
        members
          .map((m) => m.member.fields[name]!.doc)
          .filter((doc) => doc !== ""),
      );
      const doc = docs.size === 1 ? [...docs][0]! : "";
      result.push({
        name: { text: name },
        optional: field.optional,
        type: field.type,
        doc: doc,
      });
    }
  }
  return Object.fromEntries(result.map((field) => [field.name.text, field]));
}

function areResolvedTypesEqual(
  a: ResolvedType | NullableType,
  b: ResolvedType | NullableType,
  schema: SchemaView,
): boolean {
  switch (a.kind) {
    case "any":
    case "interface":
    case "union": {
      return a === b;
    }
    case "array": {
      return (
        b.kind === "array" &&
        areTypesEqual(a.elementType, b.elementType, schema)
      );
    }
    case "boolean-literal": {
      return b.kind === "boolean-literal" && a.value === b.value;
    }
    case "nullable": {
      return (
        b.kind === "nullable" && areResolvedTypesEqual(a.type, b.type, schema)
      );
    }
    case "primitive": {
      return b.kind === "primitive" && a.primitive === b.primitive;
    }
    case "record": {
      return (
        b.kind === "record" && areTypesEqual(a.valueType, b.valueType, schema)
      );
    }
    case "string-literal": {
      return b.kind === "string-literal" && a.value === b.value;
    }
  }
}

function areTypesEqual(a: Type, b: Type, schema: SchemaView): boolean {
  return areResolvedTypesEqual(
    resolveType(a, schema),
    resolveType(b, schema),
    schema,
  );
}
