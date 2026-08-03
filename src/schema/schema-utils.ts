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
  mode: "direct" | "recursive" | "cycle-detection",
): { readonly [scope in NameScope]: ReadonlySet<string> } {
  const deps = {
    defaultScope: new Set<string>(),
    shared: new Set<string>(),
  };
  const collect = (type: Type, scope: NameScope): null => {
    switch (type.kind) {
      case "any":
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
              : schema.sharedDeclarations!;
          const { valueType } = declarations[typeName]!;
          return collect(valueType, scope);
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
  collect(type, scope);
  return deps;
}
