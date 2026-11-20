import type {
  FieldType,
  Interface,
  SchemaView,
  TypeDeclaration,
  Union,
  UnionMembers,
} from "./schema-types.js";

export function toJsonSchema(
  typeName: string,
  schema: SchemaView,
  unionToMembers: ReadonlyMap<Union, UnionMembers>,
): Record<string, unknown> {
  const gen = new Generator(schema, unionToMembers);
  // If the root type is an alias (e.g. `type Output = Foo`), inline the
  // aliased type's value at the root rather than emitting a root `$ref`.
  const target = gen.resolveAlias({ name: typeName, shared: false });
  const root = gen.typeToSchema(target.decl!.valueType);
  if (target.firstDoc) {
    root.description = target.firstDoc;
  }
  const defs = gen.defs;
  if (Object.keys(defs).length >= 1) {
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

  typeToSchema(type: FieldType): Record<string, unknown> {
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
      case "optional": {
        return {
          anyOf: [this.typeToSchema(type.innerType), { type: "null" }],
        };
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
      case "shared-type-name":
      case "type-name": {
        return this.namedTypeToRef(this.toNamedTypeRef(type));
      }
      case "string-literal": {
        return { type: "string", const: type.value };
      }
      case "union": {
        return this.unionToSchema(type);
      }
    }
  }

  /**
   * Follows a chain of aliases (`type A = B; type B = C; ...`) and returns the
   * first named type whose value is not itself a type name, along with its
   * declaration. Every type in the chain resolves to the same target, so all
   * references to any of them share a single `$defs` entry.
   *
   * Also returns the first doc comment found along the chain, starting from
   * `ref` itself.
   */
  resolveAlias(ref: NamedTypeRef): {
    readonly ref: NamedTypeRef;
    readonly decl: TypeDeclaration | undefined;
    readonly firstDoc: string | undefined;
  } {
    const visited = new Set<string>();
    let current = ref;
    let firstDoc: string | undefined;
    for (;;) {
      const decl = this.getDeclaration(current);
      firstDoc ||= decl?.doc || undefined;
      const valueType = decl?.valueType;
      const key = toDefName(current);
      if (
        !valueType ||
        (valueType.kind !== "type-name" &&
          valueType.kind !== "shared-type-name") ||
        visited.has(key)
      ) {
        return { ref: current, decl, firstDoc };
      }
      visited.add(key);
      current = this.toNamedTypeRef(valueType);
    }
  }

  private toNamedTypeRef(
    type: Extract<FieldType, { kind: "type-name" | "shared-type-name" }>,
  ): NamedTypeRef {
    if (type.kind === "shared-type-name") {
      return { name: type.name.text, shared: true };
    }
    const shared =
      type.context === "namespace" &&
      this.schema.sharedDeclarations !== this.schema.typeDeclarations;
    return { name: type.name.text, shared };
  }

  private getDeclaration(ref: NamedTypeRef): TypeDeclaration | undefined {
    const declarations = ref.shared
      ? this.schema.sharedDeclarations
      : this.schema.typeDeclarations;
    return declarations?.[ref.name];
  }

  private namedTypeToRef(ref: NamedTypeRef): Record<string, unknown> {
    const target = this.resolveAlias(ref);
    const defName = toDefName(target.ref);
    if (!this.defs[defName] && !this.inProgress.has(defName)) {
      this.inProgress.add(defName);
      const { decl } = target;
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
      required.push(fieldName);
      let fieldSchema = this.typeToSchema(field.type);
      if (field.doc) {
        if ("$ref" in fieldSchema) {
          // OpenAI strict mode rejects keywords next to `$ref`, so wrap the
          // reference in a single-member `anyOf` to attach the description.
          fieldSchema = { anyOf: [fieldSchema] };
        }
        fieldSchema.description = field.doc;
      }
      properties[fieldName] = fieldSchema;
    }
    const schema: Record<string, unknown> = { type: "object", properties };
    if (required.length >= 1) {
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
      anyOf: Object.values(members.members).map((iface) =>
        this.interfaceToSchema(iface.resolved),
      ),
    };
  }
}

type NamedTypeRef = {
  readonly name: string;
  readonly shared: boolean;
};

function toDefName(ref: NamedTypeRef): string {
  return ref.shared ? `_${ref.name}` : ref.name;
}
