import type {
  Example,
  ExampleSourceSpan,
  JsonValue,
} from "./example-parser.js";
import type { Schema, TypeDeclaration, TypeRef } from "./schema-parser.js";

export type ExampleValidationError = {
  sourceSpan: ExampleSourceSpan;
  message: string;
};

export function validateExample(
  example: Example,
  schema: Schema,
  typeName: string,
): readonly ExampleValidationError[] {
  if (!schema.types[typeName]) {
    return [
      {
        sourceSpan: example.value.firstToken,
        message: `Unknown type '${typeName}'`,
      },
    ];
  }

  if (matchesTypeNameRef(typeName, example.value, schema.types, new Map())) {
    return [];
  }

  return [
    {
      sourceSpan: example.value.firstToken,
      message: `Example does not match type '${typeName}'`,
    },
  ];
}

const NATIVE_TYPE_NAMES = new Set(["string", "number", "boolean"]);

function isWildcardValue(value: JsonValue): boolean {
  return (
    value.kind === "ellipsis" ||
    (value.kind === "object" &&
      Boolean(value.ellipsis) &&
      value.entries.length === 0)
  );
}

function matchesTypeNameRef(
  typeName: string,
  value: JsonValue,
  types: Schema["types"],
  visited: Map<TypeDeclaration, Set<JsonValue>>,
): boolean {
  if (isWildcardValue(value)) {
    return true;
  }

  if (NATIVE_TYPE_NAMES.has(typeName)) {
    return value.kind === typeName;
  }

  const declaration = types[typeName];
  if (!declaration) {
    return false;
  }

  if (!visited.has(declaration)) {
    visited.set(declaration, new Set());
  }
  const valueSet = visited.get(declaration)!;
  if (valueSet.has(value)) {
    return false;
  }
  valueSet.add(value);

  if (declaration.kind === "interface") {
    return matchesInterface(declaration, value, types, visited);
  }

  return matchesTypeRef(declaration.valueType, value, types, visited);
}

function matchesInterface(
  declaration: Extract<TypeDeclaration, { kind: "interface" }>,
  value: JsonValue,
  types: Schema["types"],
  visited: Map<TypeDeclaration, Set<JsonValue>>,
): boolean {
  if (isWildcardValue(value)) {
    return true;
  }
  if (value.kind !== "object") {
    return false;
  }

  const hasEllipsis = Boolean(value.ellipsis);
  const entriesByKey = new Map<string, JsonValue>();
  for (const entry of value.entries) {
    entriesByKey.set(entry.key.value, entry.value);
  }

  for (const field of Object.values(declaration.fields)) {
    const entryValue = entriesByKey.get(field.name.text);
    if (!entryValue) {
      if (field.optional || hasEllipsis) {
        continue;
      }
      return false;
    }

    if (!matchesTypeRef(field.type, entryValue, types, visited)) {
      return false;
    }
  }

  for (const key of entriesByKey.keys()) {
    if (!declaration.fields[key]) {
      return false;
    }
  }

  return true;
}

function matchesInlineInterface(
  typeRef: Extract<TypeRef, { kind: "inline-interface" }>,
  value: JsonValue,
  types: Schema["types"],
  visited: Map<TypeDeclaration, Set<JsonValue>>,
): boolean {
  if (isWildcardValue(value)) {
    return true;
  }
  if (value.kind !== "object") {
    return false;
  }

  const hasEllipsis = Boolean(value.ellipsis);
  const entriesByKey = new Map<string, JsonValue>();
  for (const entry of value.entries) {
    entriesByKey.set(entry.key.value, entry.value);
  }

  for (const field of Object.values(typeRef.fields)) {
    const entryValue = entriesByKey.get(field.name.text);
    if (!entryValue) {
      if (field.optional || hasEllipsis) {
        continue;
      }
      return false;
    }

    if (!matchesTypeRef(field.type, entryValue, types, visited)) {
      return false;
    }
  }

  for (const key of entriesByKey.keys()) {
    if (!typeRef.fields[key]) {
      return false;
    }
  }

  return true;
}

function matchesTypeRef(
  typeRef: TypeRef,
  value: JsonValue,
  types: Schema["types"],
  visited: Map<TypeDeclaration, Set<JsonValue>>,
): boolean {
  if (isWildcardValue(value)) {
    return true;
  }

  if (typeRef.kind === "type-name") {
    return matchesTypeNameRef(typeRef.name.text, value, types, visited);
  }

  if (typeRef.kind === "string-literal") {
    return value.kind === "string" && value.value === typeRef.value;
  }

  if (typeRef.kind === "array") {
    if (value.kind !== "array") {
      return false;
    }
    return value.values.every((item) =>
      matchesTypeRef(typeRef.elementType, item, types, visited),
    );
  }

  if (typeRef.kind === "inline-interface") {
    return matchesInlineInterface(typeRef, value, types, visited);
  }

  return typeRef.members.some((member) =>
    matchesTypeRef(member, value, types, visited),
  );
}
