import type {
  ResolvedType,
  Schema,
  SchemaView,
  SyntheticType,
  Type,
  TypeDeclaration,
} from "./schema-types.js";

export function resolveType<S extends SyntheticType | never>(
  type: Type | TypeDeclaration | S,
  schema: Schema,
): ResolvedType | S {
  return doResolveType<S>(type, schema, null)!;
}

export function resolveMaybeInvalidType(
  type: Type | TypeDeclaration,
  schema: SchemaView,
): ResolvedType | null {
  const seenNames = new Set<string>();
  return doResolveType<never>(type, schema, seenNames);
}

function doResolveType<S extends SyntheticType | never>(
  type: Type | TypeDeclaration | S,
  schema: SchemaView,
  seenNames: Set<string> | null,
): ResolvedType | null | S {
  if (type.kind === "type") {
    type = type.valueType;
  }
  switch (type.kind) {
    case "type-name": {
      const typeName = type.name.text;
      {
        const primitive = isPrimitiveType(typeName);
        if (primitive) {
          return PRIMITIVES[primitive];
        }
      }
      if (seenNames) {
        if (seenNames.has(typeName)) {
          return null;
        }
        seenNames.add(typeName);
      }
      const resolved = schema.typeDeclarations[typeName];
      if (!resolved) {
        return null;
      }
      return doResolveType<S>(resolved, schema, seenNames);
    }
    case "shared-type-name": {
      const typeName = type.name.text;
      const { sharedDeclarations: sharedTypeDeclarations } = schema;
      if (!sharedTypeDeclarations) {
        return null;
      }
      const resolved = sharedTypeDeclarations[typeName];
      if (!resolved) {
        return null;
      }
      return doResolveType<S>(resolved, schema, seenNames);
    }
    default: {
      return type;
    }
  }
}

export function isPrimitiveType(
  name: string,
): "string" | "number" | "boolean" | "integer" | null {
  return name === "string" ||
    name === "number" ||
    name === "boolean" ||
    name === "integer"
    ? name
    : null;
}

const PRIMITIVES = {
  string: {
    kind: "primitive",
    primitive: "string",
  },
  number: {
    kind: "primitive",
    primitive: "number",
  },
  boolean: {
    kind: "primitive",
    primitive: "boolean",
  },
  integer: {
    kind: "primitive",
    primitive: "integer",
  },
} as const;
