import type {
  Schema,
  SchemaField,
  Template,
  TemplateFile,
  TypeDeclaration,
  TypeRef,
  UnionTypeRef,
} from "./types.js";

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

    if (!types.Response) {
      pushError("missing required type 'Response'");
    }

    for (const declaration of Object.values(types)) {
      validateDeclaration(declaration, types, pushError);
    }

    if (types.Response) {
      validateReachability(template, types, pushError);
    }
  }

  return errors;
}

function validateDeclaration(
  declaration: TypeDeclaration,
  types: Schema["types"],
  pushError: (message: string) => void,
): void {
  if (declaration.kind === "interface") {
    for (const field of Object.values(declaration.fields)) {
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
    if (!types[typeRef.name.text]) {
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
      validateTypeRef(field.type, types, pushError);
    }
    return;
  }

  if (typeRef.kind === "union") {
    validateUnion(typeRef, types, pushError);
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
