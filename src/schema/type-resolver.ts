import type { ResolvedType, Type, TypeDeclaration } from "./schema-types.js";

export function resolveType(
  type: Type | TypeDeclaration,
  types: { readonly [name: string]: TypeDeclaration },
): ResolvedType {
  return doResolveType(type, types, null, null)!;
}

export function resolveMaybeInvalidType(
  type: Type | TypeDeclaration,
  types: { readonly [name: string]: TypeDeclaration },
): ResolvedType | null {
  const seenNames = new Set<string>();
  return doResolveType(type, types, seenNames, null);
}

function doResolveType(
  type: Type | TypeDeclaration,
  types: { readonly [name: string]: TypeDeclaration },
  seenNames: Set<string> | null,
  intAlias: "integer" | null,
): ResolvedType | null {
  if (type.kind === "type") {
    type = type.valueType;
  }
  if (type.kind === "type-name") {
    const typeName = type.name.text;
    {
      const primitive = isPrimitiveType(typeName);
      if (primitive) {
        if (primitive === "number" && intAlias) {
          return PRIMITIVES.integer;
        } else {
          return PRIMITIVES[primitive];
        }
      }
    }
    if (seenNames) {
      if (seenNames.has(typeName)) {
        return null;
      }
      seenNames.add(typeName);
    }
    const resolved = types[typeName];
    if (!resolved) {
      return null;
    }
    return doResolveType(
      resolved,
      types,
      seenNames,
      typeName === "Int" ? "integer" : null,
    );
  }
  return type;
}

export function isPrimitiveType(
  name: string,
): "string" | "number" | "boolean" | null {
  return name === "string" || name === "number" || name === "boolean"
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
