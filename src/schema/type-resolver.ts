import type {
  ResolvedType,
  SyntheticInterface,
  Type,
  TypeDeclaration,
} from "./schema-types.js";

export function resolveType<S extends SyntheticInterface | never>(
  type: Type | TypeDeclaration | S,
  types: { readonly [name: string]: TypeDeclaration },
): ResolvedType | S {
  return doResolveType<S>(type, types, null)!;
}

export function resolveMaybeInvalidType(
  type: Type | TypeDeclaration,
  types: { readonly [name: string]: TypeDeclaration },
): ResolvedType | null {
  const seenNames = new Set<string>();
  return doResolveType<never>(type, types, seenNames);
}

function doResolveType<S extends SyntheticInterface | never>(
  type: Type | TypeDeclaration | S,
  types: { readonly [name: string]: TypeDeclaration },
  seenNames: Set<string> | null,
): ResolvedType | null | S {
  if (type.kind === "type") {
    type = type.valueType;
  }
  if (type.kind === "type-name") {
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
    const resolved = types[typeName];
    if (!resolved) {
      return null;
    }
    return doResolveType<S>(resolved, types, seenNames);
  }
  return type;
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
