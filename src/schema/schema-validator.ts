import { checkNoAmbiguity } from "../casing.js";
import type {
  InterfaceDeclaration,
  ResolvedTypeRef,
  SchemaField,
  SchemaParseError,
  SchemaSourceSpan,
  TypeDeclaration,
  TypeRef,
  UnionTypeRef,
} from "./schema-types.js";

export function validateSchema(
  typeDeclarations: TypeDeclaration[],
): SchemaParseError[] {
  const errors: SchemaParseError[] = [];

  errors.push(
    ...checkNoAmbiguity(
      typeDeclarations.map((t) => ({
        name: t.name.text,
        start: t.name.start,
        end: t.name.end,
      })),
    ),
  );

  const types = Object.fromEntries(
    typeDeclarations.map((t) => [t.name.text, t]),
  );

  for (const typeDeclaration of typeDeclarations) {
    validateType(typeDeclaration, types, errors);
    const { name } = typeDeclaration;
    const nameDependencies = new Set<string>();
    collectNameDependencies(
      typeDeclaration.kind === "type"
        ? typeDeclaration.valueType
        : typeDeclaration,
      types,
      nameDependencies,
    );
    if (nameDependencies.has(name.text)) {
      errors.push({
        start: name.start,
        end: name.end,
        message: `Type '${name.text}' circularly references itself`,
      });
    }
  }

  return errors;
}

type UnionKind =
  | "good:strings"
  | "good:interfaces"
  | "bad:array"
  | "bad:primitive"
  | "bad:union"
  | "error";

function getUnionKind(
  type: TypeRef,
  types: { readonly [name: string]: TypeDeclaration },
): UnionKind {
  const resolvedType = resolveTypeRef(type, types, new Set());
  if (!resolvedType) {
    return "error";
  }
  switch (resolvedType.kind) {
    case "array": {
      return "bad:array";
    }
    case "interface": {
      return "good:interfaces";
    }
    case "primitive": {
      return "bad:primitive";
    }
    case "string-literal": {
      return "good:strings";
    }
    case "union": {
      return "bad:union";
    }
  }
}

function getFirstToken(type: TypeRef | InterfaceDeclaration): SchemaSourceSpan {
  switch (type.kind) {
    case "array":
      return getFirstToken(type.elementType);
    case "interface":
      return type.leftCurlyBracket ?? type.name;
    case "string-literal":
      return type.quotedName;
    case "type-name":
      return type.name;
    case "union":
      return getFirstToken(type.members[0]!);
  }
}

function validateType(
  type: TypeRef | TypeDeclaration,
  types: { readonly [name: string]: TypeDeclaration },
  errors: SchemaParseError[],
): null {
  switch (type.kind) {
    case "array": {
      return validateType(type.elementType, types, errors);
    }
    case "interface": {
      if (type.name) {
        validateTypeName(type.name, errors);
      }
      errors.push(
        ...checkNoAmbiguity(
          Object.values(type.fields).map((f) => ({
            name: f.name.text,
            start: f.name.start,
            end: f.name.end,
          })),
        ),
      );
      for (const field of Object.values(type.fields)) {
        if (!/^[a-z][A-Za-z0-9]*$/.test(field.name.text)) {
          errors.push({
            start: field.name.start,
            end: field.name.end,
            message: WORD_MUST_START_WITH_LOWERCASE,
          });
        }
        validateType(field.type, types, errors);
      }
      return null;
    }
    case "string-literal": {
      if (!/^[a-z][A-Za-z0-9]*$/.test(type.value)) {
        errors.push({
          start: type.quotedName.start + 1,
          end: type.quotedName.end - 1,
          message: WORD_MUST_START_WITH_LOWERCASE,
        });
      }
      return null;
    }
    case "type": {
      validateTypeName(type.name, errors);
      return validateType(type.valueType, types, errors);
    }
    case "type-name": {
      const typeName = type.name.text;
      const isPrimitive = !!isPrimitiveType(typeName);
      if (!isPrimitive && !types[typeName]) {
        errors.push({
          start: type.name.start,
          end: type.name.end,
          message: `Unknown type '${typeName}'`,
        });
      }
      return null;
    }
    case "union": {
      validateUnionType(type, types, errors);
      return null;
    }
  }
}

function validateUnionType(
  type: UnionTypeRef,
  types: { readonly [name: string]: TypeDeclaration },
  errors: SchemaParseError[] = [],
): void {
  const pushErrorForBadKind = (
    kind: "bad:array" | "bad:primitive" | "bad:union",
    type: TypeRef,
  ): void => {
    const found = getDescForKind(kind);
    const firstToken = getFirstToken(type);
    errors.push({
      start: firstToken.start,
      end: firstToken.end,
      message: `Union members must be either all strings or all interfaces; found: ${found}`,
    });
  };

  const { members } = type;
  for (const member of members) {
    validateType(member, types, errors);
  }
  // Make sure 'members' are either all string literals or all interfaces.
  const first = members[0]!;
  const unionKind = getUnionKind(first, types);
  switch (unionKind) {
    case "good:strings":
    case "good:interfaces": {
      break;
    }
    case "bad:array":
    case "bad:primitive":
    case "bad:union": {
      pushErrorForBadKind(unionKind, first);
      return;
    }
    case "error": {
      return;
    }
  }

  let allGood = true;
  for (const member of members.slice(1)) {
    const memberKind = getUnionKind(member, types);
    switch (memberKind) {
      case "good:strings":
      case "good:interfaces": {
        if (memberKind !== unionKind) {
          const firstToken = getFirstToken(type);
          const expected = getDescForKind(unionKind);
          const found = getDescForKind(memberKind);
          errors.push({
            start: firstToken.start,
            end: firstToken.end,
            message: [
              "Union members must be either all strings or all interfaces; ",
              ` expected: ${expected}, found: ${found}`,
            ].join(""),
          });
          allGood = false;
        }
        break;
      }
      case "bad:array":
      case "bad:primitive":
      case "bad:union": {
        pushErrorForBadKind(memberKind, first);
        allGood = false;
        break;
      }
      case "error": {
        break;
      }
    }
  }
  if (!allGood) {
    return;
  }

  // At this stage: members are either all string literals or all interfaces.
  if (unionKind === "good:strings") {
    errors.push(
      ...checkNoAmbiguity(
        members.map((m) => {
          if (m.kind !== "string-literal") {
            // Cannot happen.
            throw new Error();
          }
          return {
            name: m.value,
            start: m.quotedName.start + 1,
            end: m.quotedName.end - 1,
          };
        }),
      ),
    );
  } else {
    const _: "good:interfaces" = unionKind;
    // Verify that all these conditions are satisfied:
    //   - the first field of each interface has string literal type
    //   - all string literals are distinct
    //   - all first fields have the same name
    const quotedNames: SchemaSourceSpan[] = [];
    let discriminator: SchemaField | undefined;
    let allGood = true;
    for (const member of members) {
      const resolvedType = resolveTypeRef(member, types, new Set())!;
      if (resolvedType.kind !== "interface") {
        // Cannot happen.
        throw new Error();
      }
      const firstField = resolvedType.firstField;
      if (!firstField || firstField.type.kind !== "string-literal") {
        const firstToken = firstField?.name ?? getFirstToken(resolvedType);
        errors.push({
          start: firstToken.start,
          end: firstToken.end,
          message:
            "The first field of an interface in a union must be a string literal",
        });
        allGood = false;
        continue;
      }
      if (!discriminator) {
        discriminator = firstField;
      } else if (discriminator.name.text !== firstField.name.text) {
        errors.push({
          start: firstField.name.start,
          end: firstField.name.end,
          message: [
            "The first field of an interface in a union must have the same name as ",
            "the other members; ",
            `expected: ${discriminator.name.text}, found: ${firstField.name.text}`,
          ].join(""),
        });
        allGood = false;
      }
      quotedNames.push(firstField.type.quotedName);
    }
    if (!allGood) {
      errors.push(
        ...checkNoAmbiguity(
          quotedNames.map((q) => ({
            name: q.text,
            start: q.start,
            end: q.end,
          })),
        ),
      );
    }
  }
}

function resolveTypeRef(
  type: TypeRef,
  types: { readonly [name: string]: TypeDeclaration },
  seenNames: Set<string>,
): ResolvedTypeRef | null {
  if (type.kind === "type-name") {
    const typeName = type.name.text;
    {
      const primitive = isPrimitiveType(typeName);
      if (primitive) {
        return { kind: "primitive", primitive: primitive };
      }
    }
    if (seenNames.has(typeName)) {
      return null;
    }
    seenNames.add(typeName);
    const resolved = types[typeName];
    if (!resolved) {
      return null;
    }
    if (resolved.kind === "type") {
      return resolveTypeRef(resolved.valueType, types, seenNames);
    } else {
      return resolved;
    }
  }
  return type;
}

function getDescForKind(kind: UnionKind): string {
  switch (kind) {
    case "good:strings":
      return "string";
    case "good:interfaces":
      return "interface";
    case "bad:array":
      return "array";
    case "bad:primitive":
      return "primitive";
    case "bad:union":
      return "union";
    case "error":
      return "error";
  }
}

function validateTypeName(
  name: SchemaSourceSpan,
  errors: SchemaParseError[],
): void {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name.text)) {
    errors.push({
      start: name.start,
      end: name.end,
      message: WORD_MUST_START_WITH_UPPERCASE,
    });
  }
}

function isPrimitiveType(name: string): "string" | "number" | "boolean" | null {
  return name === "string" || name === "number" || name === "boolean"
    ? name
    : null;
}

const WORD_MUST_START_WITH_UPPERCASE =
  "Must start with uppercase letter and contain only alphanumeric characters";
const WORD_MUST_START_WITH_LOWERCASE =
  "Must start with lowercase letter and contain only alphanumeric characters";

function collectNameDependencies(
  type: TypeRef | InterfaceDeclaration,
  types: { readonly [name: string]: TypeDeclaration },
  seenNames: Set<string>,
): null {
  switch (type.kind) {
    case "array": {
      return collectNameDependencies(type.elementType, types, seenNames);
    }
    case "interface": {
      for (const field of Object.values(type.fields)) {
        collectNameDependencies(field.type, types, seenNames);
      }
      return null;
    }
    case "string-literal": {
      return null;
    }
    case "type-name": {
      const typeName = type.name.text;
      if (seenNames.has(typeName)) {
        return null;
      }
      seenNames.add(typeName);
      const resolved = types[typeName];
      if (!resolved) {
        return null;
      }
      if (resolved.kind === "type") {
        return collectNameDependencies(resolved.valueType, types, seenNames);
      } else {
        return collectNameDependencies(resolved, types, seenNames);
      }
    }
    case "union": {
      // Only collect dependencies from the first member of the union.
      collectNameDependencies(type.members[0]!, types, seenNames);
      return null;
    }
  }
}
