import type { FieldType, Schema } from "./schema-types.js";

export function hasRecursiveType(schema: Schema, typeName: string): boolean {
  const decl = schema.typeDeclarations[typeName]!;

  const visitedLocal = new Set<string>([typeName]);
  const visitedShared = new Set<string>();

  function checkType(type: FieldType): boolean {
    switch (type.kind) {
      case "any":
      case "boolean-literal":
      case "primitive":
      case "string-literal": {
        return false;
      }
      case "array": {
        return checkType(type.elementType);
      }
      case "optional": {
        return checkType(type.innerType);
      }
      case "record": {
        return checkType(type.valueType);
      }
      case "interface": {
        return Object.values(type.fields).some((field) =>
          checkType(field.type),
        );
      }
      case "type-name":
      case "shared-type-name": {
        const shared =
          type.kind === "shared-type-name" || type.context === "namespace";
        const name = type.name.text;
        const visited = shared ? visitedShared : visitedLocal;
        if (visited.has(name)) {
          return false;
        }
        visited.add(name);
        const targetDecl = (
          shared ? schema.sharedDeclarations : schema.typeDeclarations
        )[name];
        if (!targetDecl) {
          return false;
        }
        return checkType(targetDecl.valueType);
      }
      case "union": {
        const unionMembers = schema.unionToMembers.get(type);
        if (unionMembers?.kind !== "interfaces") {
          return false;
        }
        return Object.values(unionMembers.members).some(
          (m) => m.isRecursive || checkType(m.resolved),
        );
      }
    }
  }

  return checkType(decl.valueType);
}
