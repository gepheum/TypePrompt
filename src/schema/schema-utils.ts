import { SchemaView, Type } from "./schema-types.js";

export function getNameDependencies(
  type: Type,
  schema: SchemaView,
  mode: "direct" | "recursive",
): Set<string> {
  const deps = new Set<string>();
  const collect = (type: Type): null => {
    switch (type.kind) {
      case "array": {
        return collect(type.elementType);
      }
      case "interface": {
        for (const field of Object.values(type.fields)) {
          collect(field.type);
        }
        return null;
      }
      case "record": {
        return collect(type.valueType);
      }
      case "primitive":
      case "shared-type-name":
      case "string-literal": {
        return null;
      }
      case "type-name": {
        const typeName = type.name.text;
        if (mode === "recursive" && !deps.has(typeName)) {
          deps.add(typeName);
          return collect(schema.typeDeclarations[typeName]!.valueType);
        }
        return null;
      }
      case "union": {
        for (const member of Object.values(type.members)) {
          collect(member);
        }
        return null;
      }
    }
  };
  collect(type);
  return deps;
}
