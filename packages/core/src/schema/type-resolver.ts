import type {
  FieldType,
  Literal,
  ResolvedFieldType,
  ResolvedType,
  SchemaView,
  SyntheticType,
  Type,
  TypeNameView,
  UnionMemberType,
} from "./schema-types.js";

export function resolveType(
  type: Type | TypeNameView,
  schema: SchemaView,
): ResolvedType;

export function resolveType(
  type: FieldType | TypeNameView,
  schema: SchemaView,
): ResolvedFieldType;

export function resolveType(
  type: Type | TypeNameView | SyntheticType,
  schema: SchemaView,
): ResolvedType | SyntheticType;

export function resolveType(
  type: FieldType | TypeNameView | SyntheticType,
  schema: SchemaView,
): ResolvedFieldType | SyntheticType;

export function resolveType(
  type: FieldType | TypeNameView | SyntheticType,
  schema: SchemaView,
): ResolvedFieldType | SyntheticType {
  return doResolveType(type, schema, null)!;
}

export function resolveMaybeInvalidType(
  type: UnionMemberType,
  schema: SchemaView,
): ResolvedType | Literal | null {
  const seenNames = new Set<string>();
  return doResolveType(type, schema, seenNames) as ResolvedType | null;
}

function doResolveType(
  type: FieldType | TypeNameView | SyntheticType,
  schema: SchemaView,
  seenNames: Set<string> | null,
): ResolvedFieldType | SyntheticType | null {
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
      return doResolveType(resolved.valueType, schema, seenNames);
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
      const sharedSchema: SchemaView = {
        typeDeclarations: schema.sharedDeclarations,
        sharedDeclarations: {},
      };
      return doResolveType(resolved.valueType, sharedSchema, seenNames);
    }
    default: {
      return type;
    }
  }
}
