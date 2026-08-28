import {
  Interface,
  Literal,
  SchemaView,
  Type,
  Union,
  UnionMembers,
} from "./schema-types.js";

export function toJsonSchema(
  typeName: string,
  schema: SchemaView,
  unionToMembers: ReadonlyMap<Union, UnionMembers>,
): Record<string, unknown> {
  const gen = new Generator(schema, unionToMembers);
  const root = gen.typeToSchema(schema.typeDeclarations[typeName]!.valueType);
  const defs = gen.defs;
  if (Object.keys(defs).length > 0) {
    root.$defs = defs;
  }
  return root;
}

class Generator {
  readonly defs: Record<string, Record<string, unknown>> = {};
  private readonly inProgress = new Set<string>();

  constructor(
    private readonly schema: SchemaView,
    private readonly unionToMembers: ReadonlyMap<Union, UnionMembers>,
  ) {}

  typeToSchema(type: Type | Literal): Record<string, unknown> {
    switch (type.kind) {
      case "any": {
        return {};
      }
      case "array": {
        return { type: "array", items: this.typeToSchema(type.elementType) };
      }
      case "boolean-literal": {
        return { type: "boolean", const: type.value };
      }
      case "interface": {
        return this.interfaceToSchema(type);
      }
      case "primitive": {
        return { type: type.primitive.text };
      }
      case "record": {
        return {
          type: "object",
          additionalProperties: this.typeToSchema(type.valueType),
        };
      }
      case "shared-type-name": {
        return this.namedTypeToRef(type.name.text, true);
      }
      case "string-literal": {
        return { type: "string", const: type.value };
      }
      case "type-name": {
        return this.namedTypeToRef(type.name.text, false);
      }
      case "union": {
        return this.unionToSchema(type);
      }
    }
  }

  private namedTypeToRef(
    name: string,
    shared: boolean,
  ): Record<string, unknown> {
    const defName = shared ? `_${name}` : name;
    if (!this.defs[defName] && !this.inProgress.has(defName)) {
      this.inProgress.add(defName);
      const declarations = shared
        ? this.schema.sharedDeclarations
        : this.schema.typeDeclarations;
      const decl = declarations?.[name];
      if (decl) {
        const defSchema = this.typeToSchema(decl.valueType);
        if (decl.doc) {
          defSchema.description = decl.doc;
        }
        this.defs[defName] = defSchema;
      }
      this.inProgress.delete(defName);
    }
    return { $ref: `#/$defs/${defName}` };
  }

  private interfaceToSchema(iface: Interface): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [fieldName, field] of Object.entries(iface.fields)) {
      let type = field.type;
      if (type.kind === "optional") {
        type = type.innerType;
      } else {
        required.push(fieldName);
      }
      const fieldSchema = this.typeToSchema(type);
      if (field.doc) {
        fieldSchema.description = field.doc;
      }
      properties[fieldName] = fieldSchema;
    }
    const schema: Record<string, unknown> = { type: "object", properties };
    if (required.length > 0) {
      schema.required = required;
    }
    schema.additionalProperties = false;
    return schema;
  }

  private unionToSchema(union: Union): Record<string, unknown> {
    const members = this.unionToMembers.get(union)!;
    if (members.kind === "strings") {
      return { enum: members.members.map((m) => m.value) };
    }
    // Discriminated interface union
    return {
      oneOf: Object.values(members.members).map((iface) =>
        this.interfaceToSchema(iface.resolved),
      ),
    };
  }
}
