import { FieldType, Literal, SchemaView, Type } from "./schema-types.js";

export function isLiteralType(type: FieldType): type is Literal {
  return type.kind === "string-literal" || type.kind === "boolean-literal";
}

export function unwrapNullable(type: FieldType): {
  type: Type | Literal;
  isNullable: boolean;
} {
  if (type.kind === "nullable") {
    return {
      type: type.type,
      isNullable: true,
    };
  } else {
    return {
      type,
      isNullable: false,
    };
  }
}

export type NameScope = "defaultScope" | "shared";

export type NameDependencies = {
  readonly [scope in NameScope]: ReadonlySet<string>;
};

export function getNameDependencies(
  type: FieldType | { readonly kind: "types"; types: readonly Type[] },
  scope: NameScope,
  schema: SchemaView,
  mode: "direct" | "recursive" | "cycle-detection",
): NameDependencies {
  const deps = {
    defaultScope: new Set<string>(),
    shared: new Set<string>(),
  };
  const collect = (type: FieldType, scope: NameScope): null => {
    switch (type.kind) {
      case "any":
      case "boolean-literal":
      case "primitive":
      case "string-literal": {
        return null;
      }
      case "array": {
        return collect(type.elementType, scope);
      }
      case "interface": {
        for (const field of Object.values(type.fields)) {
          collect(field.type, scope);
        }
        return null;
      }
      case "nullable": {
        return collect(type.type, scope);
      }
      case "record": {
        return collect(type.valueType, scope);
      }
      case "shared-type-name": {
        scope = "shared";
        if (mode === "cycle-detection") {
          return null;
        }
        // fallthrough
      }
      case "type-name": {
        const typeName = type.name.text;
        if (deps[scope].has(typeName)) {
          return null;
        }
        deps[scope].add(typeName);
        if (mode === "recursive" || mode === "cycle-detection") {
          const declarations =
            scope === "defaultScope"
              ? schema.typeDeclarations
              : schema.sharedDeclarations;
          const declaration = declarations[typeName];
          if (declaration) {
            const { valueType } = declaration!;
            return collect(valueType, scope);
          } else {
            return null;
          }
        } else {
          return null;
        }
      }
      case "union": {
        if (mode === "cycle-detection") {
          // Only look at the first member.
          return collect(type.members[0]!, scope);
        }
        for (const member of Object.values(type.members)) {
          collect(member, scope);
        }
        return null;
      }
    }
  };
  if (type.kind === "types") {
    for (const t of type.types) {
      collect(t, scope);
    }
  } else {
    collect(type, scope);
  }
  return deps;
}

export const NAME_SCOPES: readonly NameScope[] = [
  "shared",
  "defaultScope",
] as const;
