import { SchemaView, Type } from "./schema-types.js";

export type NameScope = "defaultScope" | "shared";

export const NAME_SCOPES: readonly NameScope[] = [
  "shared",
  "defaultScope",
] as const;

export function getNameDependencies(
  type: Type,
  scope: NameScope,
  schema: SchemaView,
  mode: "direct" | "recursive",
): { readonly [scope in NameScope]: ReadonlySet<string> } {
  const deps = {
    defaultScope: new Set<string>(),
    shared: new Set<string>(),
  };
  const collect = (type: Type, scope: NameScope): null => {
    switch (type.kind) {
      case "array": {
        return collect(type.elementType, scope);
      }
      case "interface": {
        for (const field of Object.values(type.fields)) {
          collect(field.type, scope);
        }
        return null;
      }
      case "record": {
        return collect(type.valueType, scope);
      }
      case "primitive":
      case "string-literal": {
        return null;
      }
      case "shared-type-name": {
        scope = "shared";
        // fallthrough
      }
      case "type-name": {
        const typeName = type.name.text;
        const hadDep = deps[scope].has(typeName);
        deps[scope].add(typeName);
        if (mode === "recursive" && !hadDep) {
          const declarations =
            scope === "defaultScope"
              ? schema.typeDeclarations
              : schema.sharedDeclarations!;
          const { valueType } = declarations[typeName]!;
          return collect(valueType, scope);
        } else {
          return null;
        }
      }
      case "union": {
        for (const member of Object.values(type.members)) {
          collect(member, scope);
        }
        return null;
      }
    }
  };
  collect(type, scope);
  return deps;
}
