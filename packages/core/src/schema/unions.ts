import { makeSingletonErrors } from "../util/errors.js";
import { InternalErrors, Span } from "../util/shared-types.js";
import { getFirstToken } from "./get-first-token.js";
import {
  BooleanLiteral,
  CommonField,
  Discriminants,
  DiscriminatedUnionMembers,
  Field,
  FieldType,
  Interface,
  ResolvedFieldType,
  SchemaView,
  StringLiteral,
  Type,
  Union,
  UnionMembers,
  UnionMemberType,
} from "./schema-types.js";
import { isLiteralType } from "./schema-utils.js";
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
    const resolved = resolveMaybeInvalidType(rawMember, schema);
    if (!resolved) {
      return EMPTY_ERROR;
    }
    switch (resolved.kind) {
      case "string-literal":
      case "interface": {
        members.push({
          resolved,
          unresolved: rawMember,
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
        const otherMembers = doGetUnionMembers(resolved, schema, inProgress);
        if (typeName) {
          inProgress.delete(typeName);
        }
        if (otherMembers.kind === "error") {
          /** Do not return `otherMembers` or we'll end up with duplicates. */
          return EMPTY_ERROR;
        }
        if (otherMembers.kind === "interfaces") {
          members.push(
            ...Object.values(otherMembers.members).map((m) => ({
              resolved: m.resolved,
              unresolved: m.unresolved,
              direct: false,
              errorToken,
            })),
          );
        } else {
          members.push(
            ...otherMembers.members.map((m) => ({
              resolved: m,
              unresolved: m,
              direct: false,
              errorToken,
            })),
          );
        }
        includes.push(resolved);
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
        const _: never = resolved;
        throw new Error(_);
      }
    }
  }

  const firstMember = members[0]!;
  return firstMember.resolved.kind === "string-literal"
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
    if (member.resolved.kind === "string-literal") {
      const name = member.resolved.value;
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
  const stringLiterals = members.map((m) => m.resolved as StringLiteral);
  return {
    kind: "strings",
    members: stringLiterals,
    values: Object.fromEntries(stringLiterals.map((s) => [s.value, s])),
    includes: includes,
  };
}

function makeInterfaceUnionMembers(
  members: Member[],
  includes: readonly Union[],
  schema: SchemaView,
): DiscriminatedUnionMembers | InternalErrors {
  const first = getInterfaceMemberInfo(members[0]!, schema, null);
  if (first.kind === "error") {
    return first;
  }
  const memberInfos: InterfaceMemberInfo[] = [first];
  for (const member of members.slice(1)) {
    const info = getInterfaceMemberInfo(member, schema, first);
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

  const commonFields = collectCommonFields(memberInfos, schema);

  return {
    kind: "interfaces",
    members: Object.fromEntries(
      memberInfos.map((info) => [String(info.discriminant.value), info]),
    ),
    first: first.resolved,
    discriminator: first.discriminator,
    discriminants,
    includes,
    commonFields,
  };
}

type Member = {
  readonly unresolved: UnionMemberType;
  readonly resolved: StringLiteral | BooleanLiteral | Interface;
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
  readonly resolved: Interface;
  readonly unresolved: UnionMemberType;
  readonly errorToken: Span;
  /** Name of the discriminator field, e.g. 'kind'. */
  readonly discriminator: string;
  readonly discriminant: StringLiteral | BooleanLiteral;
  readonly isRecursive: boolean;
};

function getInterfaceMemberInfo(
  member: Member,
  schema: SchemaView,
  other: InterfaceMemberInfo | null,
): InterfaceMemberInfo | InternalErrors {
  if (member.resolved.kind !== "interface") {
    return makeSingletonErrors({
      span: member.errorToken,
      message: "All members of a discriminated union must be interfaces",
    });
  }
  const { firstField } = member.resolved;
  if (!firstField) {
    return makeSingletonErrors({
      span: member.errorToken,
      message: "Can't have an empty interface in a discriminated union",
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
  const isRecursive = isInterfaceMemberRecursive(member.resolved, schema);
  return {
    kind: "success",
    resolved: member.resolved,
    unresolved: member.unresolved,
    errorToken: member.errorToken,
    discriminator: discriminator,
    discriminant: discriminant,
    isRecursive,
  };
}

function isInterfaceMemberRecursive(
  member: Interface,
  schema: SchemaView,
): boolean {
  const seenNames = new Set<string>();
  const checkType = (type: FieldType, first?: "first"): boolean => {
    switch (type.kind) {
      case "any":
      case "boolean-literal":
      case "primitive":
      case "string-literal": {
        return false;
      }
      case "array": {
        return checkType(type.elementType);
      }
      case "interface": {
        return (
          (type === member && !first) ||
          Object.values(type.fields).some((field) => checkType(field.type))
        );
      }
      case "union": {
        return type.members.some((member) => checkType(member));
      }
      case "optional": {
        return checkType(type.innerType);
      }
      case "record": {
        return checkType(type.valueType);
      }
      case "shared-type-name": {
        return false;
      }
      case "type-name": {
        if (seenNames.has(type.name.text)) return false;
        seenNames.add(type.name.text);
        const declaration = schema.typeDeclarations[type.name.text];
        if (!declaration) return false;
        return checkType(declaration.valueType);
      }
    }
  };
  return checkType(member, "first");
}

function collectCommonFields(
  members: readonly InterfaceMemberInfo[],
  schema: SchemaView,
): readonly CommonField[] {
  const first = members[0]!;
  const commonFields: CommonField[] = [];
  for (const [name, field] of Object.entries(first.resolved.fields)) {
    const fieldType = resolveType(field.type, schema);
    if (isLiteralType(fieldType)) continue;
    const memberFields = members.map((m) => m.resolved.fields[name]);
    const isShared = memberFields.slice(1).every((m) => {
      if (!m) return false;
      const otherFieldType = resolveType(m.type, schema);
      return areResolvedTypesEqual(fieldType, otherFieldType, schema);
    });
    if (isShared) {
      const docs = new Set(
        members
          .map((m) => m.resolved.fields[name]!.doc)
          .filter((doc) => doc !== ""),
      );
      const doc = docs.size === 1 ? [...docs][0]! : "";
      commonFields.push({
        name,
        type: fieldType,
        doc,
        memberFields: memberFields as readonly Field[],
      });
    }
  }
  return commonFields;
}

function areResolvedTypesEqual(
  a: ResolvedFieldType,
  b: ResolvedFieldType,
  schema: SchemaView,
): boolean {
  switch (a.kind) {
    case "any": {
      return b.kind === "any";
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
    case "interface":
    case "union": {
      return a === b;
    }
    case "optional": {
      return (
        b.kind === "optional" && areTypesEqual(a.innerType, b.innerType, schema)
      );
    }
    case "primitive": {
      return b.kind === "primitive" && a.primitive.text === b.primitive.text;
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
