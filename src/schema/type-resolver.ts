import type {
  ResolvedType,
  SchemaView,
  SyntheticType,
  Type,
  TypeDeclaration,
} from "./schema-types.js";

export function resolveType(
  type: Type | TypeDeclaration,
  schema: SchemaView,
): ResolvedType {
  return doResolveType<never>(type, schema, null)!;
}

export function resolveSyntheticType(
  type: Type | TypeDeclaration | SyntheticType,
  schema: SchemaView,
): ResolvedType | SyntheticType {
  return doResolveType<SyntheticType>(type, schema, null)!;
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
