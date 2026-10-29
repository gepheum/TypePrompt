import type {
  FieldType,
  NullType,
  SchemaType,
  SchemaView,
  SyntheticType,
} from "./schema-types.js";

export function makeExampleValue<T = unknown>(schemaType: SchemaType): T {
  return generateValue(schemaType.type, schemaType.schema) as T;
}

function generateValue(
  type: FieldType | SyntheticType | NullType,
  schema: SchemaView,
): unknown {
  switch (type.kind) {
    case "primitive": {
      switch (type.primitive.text) {
        case "string":
          return "";
        case "number":
        case "integer":
          return 0;
        case "boolean":
          return false;
        default:
          return "";
      }
    }
    case "string-literal": {
      return type.value;
    }
    case "boolean-literal": {
      return type.value;
    }
    case "optional": {
      return generateValue(type.innerType, schema);
    }
    case "array": {
      return [generateValue(type.elementType, schema)];
    }
    case "interface": {
      const result: Record<string, unknown> = {};
      for (const [fieldName, field] of Object.entries(type.fields)) {
        result[fieldName] = generateValue(field.type, schema);
      }
      return result;
    }
    case "record": {
      return {};
    }
    case "union": {
      const firstMember = type.members[0]!;
      return generateValue(firstMember, schema);
    }
    case "synthetic-union": {
      if (type.members.kind === "strings") {
        return Object.keys(type.members.values)[0]!;
      } else if (type.members.kind === "interfaces") {
        const firstMember = Object.values(type.members.members)[0]!;
        return generateValue(firstMember.resolved, schema);
      }
      return null;
    }
    case "type-name": {
      const isShared =
        type.context === "namespace" &&
        schema.sharedDeclarations !== schema.typeDeclarations;
      const typeName = type.name.text;
      const declarations = isShared
        ? schema.sharedDeclarations
        : schema.typeDeclarations;
      let decl = declarations?.[typeName];
      if (!decl && !isShared && schema.sharedDeclarations) {
        decl = schema.sharedDeclarations[typeName];
      }
      if (!decl) return {};
      return generateValue(decl.valueType, schema);
    }
    case "shared-type-name": {
      const typeName = type.name.text;
      const decl = schema.sharedDeclarations?.[typeName];
      if (!decl) return {};
      return generateValue(decl.valueType, schema);
    }
    case "any":
    case "null": {
      return null;
    }
    default: {
      return {};
    }
  }
}
