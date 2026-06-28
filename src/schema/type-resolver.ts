import type { ResolvedType, Type, TypeDeclaration } from "./schema-types.js";

export function resolveType(
  type: Type | TypeDeclaration,
  types: { readonly [name: string]: TypeDeclaration },
): ResolvedType | null {
  return doResolveType(type, types, new Set(), null);
}

function doResolveType(
  type: Type | TypeDeclaration,
  types: { readonly [name: string]: TypeDeclaration },
  seenNames: Set<string>,
  intAlias: "int" | null,
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
          return { kind: "primitive", primitive: "number" };
        } else {
          return { kind: "primitive", primitive: primitive };
        }
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
    return doResolveType(
      resolved,
      types,
      seenNames,
      typeName === "Int" ? "int" : null,
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
