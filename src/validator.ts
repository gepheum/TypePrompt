import type {
  JsonValue,
  Schema,
  SchemaField,
  Template,
  TemplateFile,
  TypeDeclaration,
  TypeRef,
  UnionTypeRef,
} from "./types.js";

const NATIVE_TYPE_NAMES = new Set(["string", "number", "boolean"]);

function isWildcardValue(value: JsonValue): boolean {
  return (
    value.kind === "ellipsis" ||
    (value.kind === "object" && Boolean(value.ellipsis) && value.entries.length === 0)
  );
}

export function validateTemplateFile(templateFile: TemplateFile): Error[] {
  const errors: Error[] = [];

  for (const template of templateFile.templates) {
    if (!template.schema) {
      continue;
    }

    const types = template.schema.types;
    const pushError = (message: string): void => {
      errors.push(new Error(`Template '${template.name.text}': ${message}`));
    };

    if (!types["Response"]) {
      pushError("missing required type 'Response'");
    }

    for (const declaration of Object.values(types)) {
      validateTypeDeclarationName(declaration, pushError);
      validateDeclaration(declaration, types, pushError);
    }

    if (types["Response"]) {
      validateReachability(template, types, pushError);
      validateExamples(template, types, pushError);
    }
  }

  return errors;
}

function validateExamples(
  template: Template,
  types: Schema["types"],
  pushError: (message: string) => void,
): void {
  const valueIds = new WeakMap<object, number>();
  let nextValueId = 1;

  const getValueId = (value: JsonValue): string => {
    if (value.kind === "string") {
      return `string:${value.value}`;
    }
    if (value.kind === "number") {
      return `number:${value.value}`;
    }
    if (value.kind === "boolean") {
      return `boolean:${value.value ? "true" : "false"}`;
    }
    if (value.kind === "null") {
      return "null";
    }
    if (value.kind === "ellipsis") {
      return "ellipsis";
    }

    const existing = valueIds.get(value as object);
    if (existing) {
      return `${value.kind}:${existing}`;
    }
    const assigned = nextValueId;
    nextValueId += 1;
    valueIds.set(value as object, assigned);
    return `${value.kind}:${assigned}`;
  };

  for (let i = 0; i < template.examples.length; i += 1) {
    const example = template.examples[i]!;
    if (
      !matchesTypeNameRef(
        "Response",
        example.value,
        types,
        new Set(),
        getValueId,
      )
    ) {
      pushError(`example #${i + 1} does not match type 'Response'`);
    }
  }
}

function validateTypeDeclarationName(
  declaration: TypeDeclaration,
  pushError: (message: string) => void,
): void {
  if (!/^[A-Z]/.test(declaration.name.text)) {
    pushError(`type name '${declaration.name.text}' must start with an uppercase letter`);
  }
  if (declaration.name.text.includes("_")) {
    pushError(`type name '${declaration.name.text}' must not contain underscores`);
  }
}

function matchesTypeNameRef(
  typeName: string,
  value: JsonValue,
  types: Schema["types"],
  visited: Set<string>,
  getValueId: (value: JsonValue) => string,
): boolean {
  if (isWildcardValue(value)) {
    return true;
  }

  if (typeName === "string") {
    return value.kind === "string";
  }
  if (typeName === "number") {
    return value.kind === "number";
  }
  if (typeName === "boolean") {
    return value.kind === "boolean";
  }

  const visitKey = `${typeName}@@${getValueId(value)}`;
  if (visited.has(visitKey)) {
    return false;
  }
  visited.add(visitKey);

  const declaration = types[typeName];
  if (!declaration) {
    return false;
  }

  if (declaration.kind === "interface") {
    return matchesInterface(declaration, value, types, visited, getValueId);
  }

  return matchesTypeRef(
    declaration.valueType,
    value,
    types,
    visited,
    getValueId,
  );
}

function matchesInterface(
  declaration: Extract<TypeDeclaration, { kind: "interface" }>,
  value: JsonValue,
  types: Schema["types"],
  visited: Set<string>,
  getValueId: (value: JsonValue) => string,
): boolean {
  if (isWildcardValue(value)) {
    return true;
  }
  if (value.kind !== "object") {
    return false;
  }

  const entriesByKey = new Map<string, JsonValue>();
  for (const entry of value.entries) {
    entriesByKey.set(entry.key.value, entry.value);
  }

  for (const field of Object.values(declaration.fields)) {
    const entryValue = entriesByKey.get(field.name.text);
    if (!entryValue) {
      if (field.optional) {
        continue;
      }
      return false;
    }
    if (!matchesTypeRef(field.type, entryValue, types, visited, getValueId)) {
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
  visited: Set<string>,
  getValueId: (value: JsonValue) => string,
): boolean {
  if (isWildcardValue(value)) {
    return true;
  }
  if (value.kind !== "object") {
    return false;
  }

  const entriesByKey = new Map<string, JsonValue>();
  for (const entry of value.entries) {
    entriesByKey.set(entry.key.value, entry.value);
  }

  for (const field of Object.values(typeRef.fields)) {
    const entryValue = entriesByKey.get(field.name.text);
    if (!entryValue) {
      if (field.optional) {
        continue;
      }
      return false;
    }
    if (!matchesTypeRef(field.type, entryValue, types, visited, getValueId)) {
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
  visited: Set<string>,
  getValueId: (value: JsonValue) => string,
): boolean {
  if (isWildcardValue(value)) {
    return true;
  }

  if (typeRef.kind === "type-name") {
    return matchesTypeNameRef(
      typeRef.name.text,
      value,
      types,
      visited,
      getValueId,
    );
  }

  if (typeRef.kind === "string-literal") {
    return value.kind === "string" && value.value === typeRef.value;
  }

  if (typeRef.kind === "array") {
    if (value.kind !== "array") {
      return false;
    }
    return value.values.every((item) =>
      matchesTypeRef(typeRef.elementType, item, types, visited, getValueId),
    );
  }

  if (typeRef.kind === "inline-interface") {
    return matchesInlineInterface(typeRef, value, types, visited, getValueId);
  }

  return typeRef.members.some((member) =>
    matchesTypeRef(member, value, types, visited, getValueId),
  );
}

function validateDeclaration(
  declaration: TypeDeclaration,
  types: Schema["types"],
  pushError: (message: string) => void,
): void {
  if (declaration.kind === "interface") {
    for (const field of Object.values(declaration.fields)) {
      validateFieldName(field, pushError);
      validateTypeRef(field.type, types, pushError);
    }
    return;
  }

  validateTypeRef(declaration.valueType, types, pushError);
}

function validateTypeRef(
  typeRef: TypeRef,
  types: Schema["types"],
  pushError: (message: string) => void,
): void {
  if (typeRef.kind === "type-name") {
    if (!types[typeRef.name.text] && !NATIVE_TYPE_NAMES.has(typeRef.name.text)) {
      pushError(`unknown type reference '${typeRef.name.text}'`);
    }
    return;
  }

  if (typeRef.kind === "array") {
    validateTypeRef(typeRef.elementType, types, pushError);
    return;
  }

  if (typeRef.kind === "inline-interface") {
    for (const field of Object.values(typeRef.fields)) {
      validateFieldName(field, pushError);
      validateTypeRef(field.type, types, pushError);
    }
    return;
  }

  if (typeRef.kind === "union") {
    validateUnion(typeRef, types, pushError);
  }
}

function validateFieldName(
  field: SchemaField,
  pushError: (message: string) => void,
): void {
  if (field.name.text.endsWith("_")) {
    pushError(`field name '${field.name.text}' must not end with an underscore`);
  }
}

function validateUnion(
  unionRef: UnionTypeRef,
  types: Schema["types"],
  pushError: (message: string) => void,
): void {
  const literalValues = new Set<string>();
  const interfaceDiscriminatorValues = new Set<string>();

  for (const member of unionRef.members) {
    if (member.kind === "string-literal") {
      if (literalValues.has(member.value)) {
        pushError(`union has duplicate string literal '${member.value}'`);
      }
      literalValues.add(member.value);
      continue;
    }

    for (const field of Object.values(member.fields)) {
      validateTypeRef(field.type, types, pushError);
    }

    const discriminatorValues = extractStringLiteralValues(member.firstField);
    if (!discriminatorValues) {
      pushError(
        "union interface member must have firstField of type string literal or union of string literals",
      );
      continue;
    }

    for (const value of discriminatorValues) {
      if (interfaceDiscriminatorValues.has(value)) {
        pushError(`union interface discriminator values overlap on '${value}'`);
      }
      interfaceDiscriminatorValues.add(value);
    }
  }
}

function extractStringLiteralValues(
  firstField: SchemaField | undefined,
): ReadonlySet<string> | null {
  if (!firstField) {
    return null;
  }

  if (firstField.type.kind === "string-literal") {
    return new Set([firstField.type.value]);
  }

  if (firstField.type.kind !== "union") {
    return null;
  }

  const values = new Set<string>();
  for (const member of firstField.type.members) {
    if (member.kind !== "string-literal") {
      return null;
    }
    values.add(member.value);
  }

  return values;
}

function validateReachability(
  template: Template,
  types: Schema["types"],
  pushError: (message: string) => void,
): void {
  const visited = new Set<string>();
  const queue = ["Response"];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const declaration = types[current];
    if (!declaration) {
      continue;
    }

    for (const referenceName of getDirectTypeReferences(declaration)) {
      if (types[referenceName] && !visited.has(referenceName)) {
        queue.push(referenceName);
      }
    }
  }

  for (const typeName of Object.keys(types)) {
    if (!visited.has(typeName)) {
      pushError(`type '${typeName}' is not reachable from 'Response'`);
    }
  }
}

function getDirectTypeReferences(
  declaration: TypeDeclaration,
): ReadonlySet<string> {
  const refs = new Set<string>();

  if (declaration.kind === "interface") {
    for (const field of Object.values(declaration.fields)) {
      collectTypeReferences(field.type, refs);
    }
    return refs;
  }

  collectTypeReferences(declaration.valueType, refs);
  return refs;
}

function collectTypeReferences(typeRef: TypeRef, refs: Set<string>): void {
  if (typeRef.kind === "type-name") {
    refs.add(typeRef.name.text);
    return;
  }

  if (typeRef.kind === "array") {
    collectTypeReferences(typeRef.elementType, refs);
    return;
  }

  if (typeRef.kind === "inline-interface") {
    for (const field of Object.values(typeRef.fields)) {
      collectTypeReferences(field.type, refs);
    }
    return;
  }

  if (typeRef.kind === "union") {
    for (const member of typeRef.members) {
      if (member.kind === "inline-interface") {
        for (const field of Object.values(member.fields)) {
          collectTypeReferences(field.type, refs);
        }
      }
    }
  }
}
