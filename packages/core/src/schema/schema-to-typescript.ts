import type {
  FieldType,
  Interface,
  SchemaView,
  TypeDeclaration,
  Union,
} from "./schema-types.js";

/**
 * Renders a type and all the named types it transitively references as
 * TypeScript code, e.g. to append a schema to a system instruction.
 *
 * Formatting: 2-space indent, no semicolons, no empty lines.
 */
export function schemaToTypeScript(
  typeName: string,
  schema: SchemaView,
): string {
  return new Generator(schema).generate(typeName);
}

class Generator {
  /** Names of types already rendered, see {@link toTypeName}. */
  private readonly seen = new Set<string>();
  private readonly declarations: string[] = [];
  /** Types referenced by the declaration being rendered, in order. */
  private references: NamedTypeRef[] = [];

  constructor(private readonly schema: SchemaView) {}

  generate(rootName: string): string {
    this.emit({ name: rootName, shared: false });
    return this.declarations.join("\n");
  }

  /**
   * Renders the declaration of the given type if not already rendered, then
   * recursively the declarations of the types it references, in order.
   */
  private emit(ref: NamedTypeRef): void {
    const typeName = this.toTypeName(ref);
    if (this.seen.has(typeName)) {
      return;
    }
    this.seen.add(typeName);
    const declarations = ref.shared
      ? this.schema.sharedDeclarations
      : this.schema.typeDeclarations;
    const decl = declarations[ref.name];
    if (!decl) {
      return;
    }
    this.references = [];
    this.declarations.push(this.declarationToTypeScript(typeName, decl));
    for (const reference of this.references) {
      this.emit(reference);
    }
  }

  private declarationToTypeScript(name: string, decl: TypeDeclaration): string {
    const docLines = docToLines(decl.doc, "");
    const { valueType } = decl;
    const declaration =
      valueType.kind === "interface"
        ? `interface ${name} ${this.interfaceToTypeScript(valueType, "")}`
        : `type ${name} =${spaceBefore(this.typeToTypeScript(valueType, ""))}`;
    return [...docLines, declaration].join("\n");
  }

  /**
   * Returns the TypeScript expression for the given type. Multi-line
   * expressions are indented relative to `indent`, the indentation of the line
   * where the expression starts. An expression may start with a line break
   * (multi-line unions), in which case it must not be preceded by a space.
   */
  private typeToTypeScript(type: FieldType, indent: string): string {
    switch (type.kind) {
      case "any": {
        return "any";
      }
      case "array": {
        const element = this.typeToTypeScript(type.elementType, indent);
        if (type.elementType.kind !== "union") {
          return `${element}[]`;
        }
        return element.startsWith("\n")
          ? `(${element}\n${indent})[]`
          : `(${element})[]`;
      }
      case "boolean-literal": {
        return String(type.value);
      }
      case "interface": {
        return this.interfaceToTypeScript(type, indent);
      }
      case "optional": {
        // Optional types only appear as field types, which are handled in
        // interfaceToTypeScript. Fall back to a nullable type just in case.
        return `${this.typeToTypeScript(type.innerType, indent)} | null`;
      }
      case "primitive": {
        const primitive = type.primitive.text;
        return primitive === "integer" ? "number" : primitive;
      }
      case "record": {
        const value = this.typeToTypeScript(type.valueType, indent);
        return `{ [${type.keyName}: string]:${spaceBefore(value)} }`;
      }
      case "shared-type-name": {
        return this.reference({ name: type.name.text, shared: true });
      }
      case "string-literal": {
        return JSON.stringify(type.value);
      }
      case "type-name": {
        const shared =
          type.context === "namespace" &&
          this.schema.sharedDeclarations !== this.schema.typeDeclarations;
        return this.reference({ name: type.name.text, shared });
      }
      case "union": {
        return this.unionToTypeScript(type, indent);
      }
    }
  }

  private interfaceToTypeScript(iface: Interface, indent: string): string {
    const fieldIndent = indent + INDENT;
    const lines = ["{"];
    for (const [fieldName, field] of Object.entries(iface.fields)) {
      lines.push(...docToLines(field.doc, fieldIndent));
      const { type } = field;
      const [suffix, valueType] =
        type.kind === "optional" ? ["?", type.innerType] : ["", type];
      const value = this.typeToTypeScript(valueType, fieldIndent);
      lines.push(`${fieldIndent}${fieldName}${suffix}:${spaceBefore(value)}`);
    }
    lines.push(`${indent}}`);
    return lines.join("\n");
  }

  private unionToTypeScript(union: Union, indent: string): string {
    // Each member of a multi-line union starts with "| " on its own line,
    // indented one level deeper than the line where the union starts.
    const memberIndent = indent + INDENT;
    const members = union.members.map((m) =>
      this.typeToTypeScript(m, memberIndent + INDENT),
    );
    const inline = members.join(" | ");
    if (!inline.includes("\n")) {
      return inline;
    }
    return members.map((m) => `\n${memberIndent}| ${m}`).join("");
  }

  /**
   * Records a reference to the given type from the declaration being rendered,
   * and returns the name of the type in the generated code.
   */
  private reference(ref: NamedTypeRef): string {
    this.references.push(ref);
    return this.toTypeName(ref);
  }

  private toTypeName(ref: NamedTypeRef): string {
    return ref.shared && this.schema.typeDeclarations[ref.name]
      ? `_${ref.name}`
      : ref.name;
  }
}

/** Returns " " + `value`, unless `value` starts with a line break. */
function spaceBefore(value: string): string {
  return value.startsWith("\n") ? value : ` ${value}`;
}

function docToLines(doc: string | undefined, indent: string): string[] {
  const trimmed = doc?.trim();
  if (!trimmed) {
    return [];
  }
  const docLines = trimmed.replace(/\*\//g, "*\\/").split(/\r?\n/);
  if (docLines.length === 1) {
    return [`${indent}/** ${docLines[0]} */`];
  }
  return [
    `${indent}/**`,
    ...docLines.map((l) => (l ? `${indent} * ${l}` : `${indent} *`)),
    `${indent} */`,
  ];
}

const INDENT = "  ";

type NamedTypeRef = {
  readonly name: string;
  readonly shared: boolean;
};
