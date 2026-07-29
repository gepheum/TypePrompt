import { InternalErrors, Span } from "../util/shared-types.js";
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

export function getUnionMembers(
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
  const includes = new Set<Union>();
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
          const typeName = rawMember.name.text;
          if (inProgress.has(typeName)) {
            return {
              kind: "error",
              errors: [
                {
                  span: rawMember.name,
                  message: `'${typeName}' circularly references itself`,
                },
              ],
            };
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
        includes.add(resolvedMember);
        otherMembers.includes.forEach((u) => includes.add(u));
        break;
      }
      case "array":
      case "primitive": {
        return {
          kind: "error",
          errors: [
            {
              span: errorToken,
              message:
                "Members of a union must be string literals or interfaces",
            },
          ],
        };
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
  includes: Set<Union>,
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
      return {
        kind: "error",
        errors: [
          {
            span: member.errorToken,
            message:
              "All members of a string-literal union must be string literals",
          },
        ],
      };
    }
  }
  const stringLiterals = members.map((m) => m.member as StringLiteral);
  return {
    kind: "strings",
    members: stringLiterals,
    values: new Set(stringLiterals.map((m) => m.value)),
    includes: [...includes],
  };
}

function makeInterfaceUnionMembers(
  members: Member[],
  includes: Set<Union>,
  schema: SchemaView,
): UnionMembers | InternalErrors {
  const first = getDiscriminatorInfo(members[0]!, schema, null);
  if (first.kind === "error") {
    return first;
  }
  const discriminatorInfos: DiscriminatorInfo[] = [first];
  for (const member of members.slice(1)) {
    const info = getDiscriminatorInfo(member, schema, first);
    if (info.kind === "error") {
      return info;
    }
    discriminatorInfos.push(info);
  }
  return {
    kind: "interfaces",
    members: Object.fromEntries(
      discriminatorInfos.map((info) => [
        info.discriminant.value,
        info.member.member as Interface,
      ]),
    ),
    discriminator: first.discriminator,
    discriminants: discriminatorInfos.map((info) => info.discriminant),
    includes: [...includes],
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

type DiscriminatorInfo = {
  readonly kind: "success";
  readonly member: Member;
  /** Name of the discriminator field, e.g. 'kind'. */
  readonly discriminator: string;
  readonly discriminant: StringLiteral;
};

function getDiscriminatorInfo(
  member: Member,
  schema: SchemaView,
  other: DiscriminatorInfo | null,
): DiscriminatorInfo | InternalErrors {
  if (member.member.kind !== "interface") {
    return {
      kind: "error",
      errors: [
        {
          span: member.errorToken,
          message: "All members of an interface union must be interfaces",
        },
      ],
    };
  }
  let discriminatorType: ResolvedType | undefined;
  const {firstField} = member.member;
  if (firstField) {
    discriminatorType = resolveType<never>(firstField.type, schema);
  }
  const discriminator = firstField!.name.text;
  if (discriminatorType?.kind !== "string-literal") {
    return {
      kind: "error",
      errors: [
        {
          span: member.errorToken,
          message: `Field '${discriminator}' is not a string literal`,
          rule: "All interfaces in a union type must have a string literal as the type of their first field",
        },
      ],
    };
  }
  if (other && discriminator !== other.discriminator) {
    return {
      kind: "error",
      errors: [
        {
          span: member.errorToken,
          message: `Discriminator field name '${discriminator}' does not match '${other.discriminator}'`,
          rule: "All interfaces in a union type must have the same discriminator field name",
        },
      ],
    };
  }
  return {
    kind: "success",
    member: member,
    discriminator: discriminator,
    discriminant: discriminatorType,
  };
}
