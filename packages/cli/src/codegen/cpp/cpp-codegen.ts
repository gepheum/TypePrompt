import type {
  Config,
  FieldType,
  Interface,
  NamingHint,
  Optional,
  Schema,
  Type,
  TypeNameView,
  Union,
  ValidCompilationResult,
  ValidNamespaceResult,
} from "@typeprompt/core";
import {
  capitalize,
  getId,
  isLiteralType,
  makeTemplates,
  resolveType,
  runtimeTypesSchema,
  toPascalCase,
  toScreamCase,
  toSnakeCase,
} from "@typeprompt/core";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import type { OutputFile } from "../codegen-types.js";

export function generateCppCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const cppConfig = config.gen?.cpp;
  if (!cppConfig) {
    return [];
  }
  return [
    {
      path: cppConfig.file,
      content: writeAll(compilationResult, cppConfig),
    },
  ];
}

function writeAll(
  compilationResult: ValidCompilationResult,
  config: { readonly rootNamespace: string },
): string {
  const { rootNamespace } = config;
  const includeGuard = `__${toScreamCase(rootNamespace)}_GEN_H_`;
  return [
    [`#ifndef ${includeGuard}`, `#define ${includeGuard}`].join("\n"),
    STATIC_SNIPPETS["cpp-top-level"],
    `namespace ${rootNamespace} {`,
    STATIC_SNIPPETS["cpp-public-types"],
    coalesceEmptyLines(
      scaleIndent(
        [
          writeUserDefinedDatatypes(compilationResult, config),
          writeToolsSignatures(compilationResult, config),
          writeTemplatesSignatures(compilationResult, config),
          writeSpecDatatypes(config),
          writeTemplatesData(compilationResult),
        ].join("\n\n"),
      ),
    ),
    STATIC_SNIPPETS["cpp-logic"],
    `}  // namespace ${config.rootNamespace}`,
    "#endif\n",
  ].join("\n\n");
}

function writeUserDefinedDatatypes(
  compilationResult: ValidCompilationResult,
  config: { readonly rootNamespace: string },
): string {
  const { rootNamespace } = config;
  const { metaSchema, namespaces, singleNamespace } = compilationResult;
  const anyTypes = (schema: Schema): boolean =>
    Object.keys(schema.typeDeclarations).length >= 1;

  const lines: string[] = [];
  lines.push(
    "// ".concat("-".repeat(77)),
    "// User-defined datatypes",
    "// ".concat("-".repeat(77)),
    "",
  );
  if (anyTypes(metaSchema)) {
    lines.push(
      "namespace schema::meta {",
      writeSchema(metaSchema, {
        typePrefix: "schema::meta::",
        rootNamespace,
      }),
      "}  // namespace schema::meta",
      "",
    );
  }

  const writeNamespace = (
    namespace: ValidNamespaceResult,
    typePrefixBase: string,
  ): void => {
    const sharedTypePrefix = typePrefixBase.concat("shared::");
    if (anyTypes(namespace.schema)) {
      lines.push(
        `namespace ${typePrefixBase}shared {`,
        writeSchema(namespace.schema, {
          typePrefix: sharedTypePrefix,
          rootNamespace,
        }),
        `}  // namespace ${typePrefixBase}shared`,
        "",
      );
    }
    for (const template of namespace.templates) {
      const rawTemplateName = template.template.name.text;
      const cNamespace = typePrefixBase.concat(
        toCName(toSnakeCase(rawTemplateName)),
      );
      const typePrefix = cNamespace.concat("::");
      lines.push(
        `namespace ${cNamespace} {`,
        writeSchema(template.schema, {
          typePrefix,
          sharedTypePrefix,
          rootNamespace,
        }),
        `}  // namespace ${cNamespace}`,
        "",
      );
    }
    for (const tool of Object.values(namespace.tools)) {
      const rawToolName = tool.tool.name.text;
      const cNamespace = typePrefixBase.concat(
        toCName(toSnakeCase(rawToolName)),
      );
      const typePrefix = cNamespace.concat("::");
      lines.push(
        `namespace ${cNamespace} {`,
        writeSchema(tool.schema, {
          typePrefix,
          sharedTypePrefix,
          rootNamespace,
        }),
        `}  // namespace ${cNamespace}`,
        "",
      );
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace, "schema::");
  } else {
    for (const namespace of Object.values(namespaces)) {
      const typePrefix = ["schema", toCName(namespace.name), ""].join("::");
      writeNamespace(namespace, typePrefix);
    }
  }

  const metaType = anyTypes(metaSchema)
    ? writeType(
        {
          kind: "type-name",
          name: { text: "Meta" },
        },
        metaSchema,
        {
          topLevel: true,
          typePrefix: "schema::meta::",
          rootNamespace,
        },
      )
    : "internal::NoMeta";
  lines.push(
    "/// Metadata associated with a prompt.",
    `using Meta = ${metaType};`,
  );

  return lines.join("\n");
}

function writeToolsSignatures(
  compilationResult: ValidCompilationResult,
  config: { readonly rootNamespace: string },
): string {
  const { namespaces, singleNamespace } = compilationResult;
  const { rootNamespace } = config;
  const lines: string[] = [];

  const writeNamespace = (
    namespace: ValidNamespaceResult,
    middleComp: string,
  ): void => {
    const tools = Object.values(namespace.tools);
    if (tools.length <= 0) return;
    lines.push(`namespace tools${middleComp} {`);
    const typePrefixBase = `schema${middleComp}::`;
    const sharedTypePrefix = typePrefixBase.concat("shared::");
    for (const tool of tools) {
      const { schema } = tool;
      const rawToolName = tool.tool.name.text;
      const structCName = toCName(toPascalCase(rawToolName));
      const typePrefix = typePrefixBase.concat(
        toCName(toSnakeCase(rawToolName)),
        "::",
      );
      const options: WriteSchemaOptions = {
        topLevel: true,
        typePrefix,
        sharedTypePrefix,
        rootNamespace,
      };
      const inputType = writeType(
        {
          kind: "type-name",
          name: { text: "Input" },
        },
        schema,
        options,
      );
      const outputType = writeType(
        {
          kind: "type-name",
          name: { text: "Output" },
        },
        schema,
        options,
      );
      lines.push(
        `struct ${structCName} {`,
        ` static constexpr std::string_view kToolName = "${rawToolName}";`,
        "",
        ` using input_type = ${inputType};`,
        ` using output_type = ${outputType};`,
        "};",
        "",
      );
    }
    lines.push(`}  // namespace tools${middleComp}`, "");
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace, "");
  } else {
    for (const namespace of Object.values(namespaces)) {
      const cNamespace = toCName(namespace.name);
      writeNamespace(namespace, "::".concat(cNamespace));
    }
  }

  return lines.join("\n");
}

function writeTemplatesSignatures(
  compilationResult: ValidCompilationResult,
  config: { readonly rootNamespace: string },
): string {
  const { namespaces, singleNamespace } = compilationResult;
  const { rootNamespace } = config;
  const lines: string[] = [];

  const writeNamespace = (
    namespace: ValidNamespaceResult,
    middleComp: string,
  ): void => {
    const templates = Object.values(namespace.templates);
    if (templates.length <= 0) return;
    lines.push(`namespace templates${middleComp} {`);
    const typePrefixBase = `schema${middleComp}::`;
    const sharedTypePrefix = typePrefixBase.concat("shared::");
    for (const template of templates) {
      const { schema } = template;
      const tools = Object.values(template.tools);
      const rawTemplateName = template.template.name.text;
      const templateId = getId(template.template);
      const structCName = toCName(toPascalCase(rawTemplateName));
      const typePrefix = typePrefixBase.concat(
        toCName(toSnakeCase(rawTemplateName)),
        "::",
      );
      const options: WriteSchemaOptions = {
        topLevel: true,
        typePrefix,
        sharedTypePrefix,
        rootNamespace,
      };
      const inputType = writeType(
        {
          kind: "type-name",
          name: { text: "Input" },
        },
        schema,
        options,
      );
      const outputType = writeType(
        {
          kind: "type-name",
          name: { text: "Output" },
        },
        schema,
        options,
      );
      lines.push(
        `/// Defined in '${template.template.sourcePath}'`,
        `struct ${structCName} {`,
        ` static constexpr std::string_view kTemplateId = "${templateId}";`,
        "",
      );
      if (tools.length <= 0) {
        lines.push(" using tools_type = std::tuple<>;");
      } else {
        lines.push(" using tools_type = std::tuple<");
        for (const tool of tools) {
          const toolCName = toCName(toPascalCase(tool.tool.tool.name.text));
          lines.push(`   tools${middleComp}::${toolCName},`);
        }
        lines.push(lines.pop()!.slice(0, -1).concat(">;"));
      }
      const outputFormat =
        template.template.outputFormat?.text === "text" ? "kText" : "kJson";
      lines.push(
        "",
        ` using input_type = ${inputType};`,
        ` using output_type = ${outputType};`,
        "",
        ` static constexpr auto kOutputFormat = OutputFormat::${outputFormat};`,
        "};",
        "",
      );
    }
    lines.push(`}  // namespace templates${middleComp}`, "");
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace, "");
  } else {
    for (const namespace of Object.values(namespaces)) {
      const cNamespace = toCName(namespace.name);
      writeNamespace(namespace, "::".concat(cNamespace));
    }
  }

  return lines.join("\n");
}

function writeSpecDatatypes(config: {
  readonly rootNamespace: string;
}): string {
  const { rootNamespace } = config;
  const options: WriteSchemaOptions = {
    internal: true,
    typePrefix: "internal::spec::",
    rootNamespace,
  };
  return [
    "namespace internal::spec {",
    writeSchema(runtimeTypesSchema, options),
    "}  // namespace internal::spec",
  ].join("\n\n");
}

function writeTemplatesData(compilationResult: ValidCompilationResult): string {
  const templatesData = makeTemplates(compilationResult);
  const stringifiedJson = JSON.stringify(JSON.stringify(templatesData));
  return [
    "namespace internal {",
    "struct TemplatesData {",
    " static spec::Templates get() {",
    `  return *ParseJson<spec::Templates>(${stringifiedJson});`,
    " }",
    "};",
    "}  // namespace internal",
  ].join("\n");
}

type WriteSchemaOptions = {
  readonly topLevel?: true;
  readonly internal?: true;
  readonly typePrefix: string;
  readonly sharedTypePrefix?: string;
  readonly rootNamespace: string;
};

function writeSchema(schema: Schema, options: WriteSchemaOptions): string {
  const { internal, rootNamespace, typePrefix } = options;
  const lines: string[] = [];

  // 1. Declare all the types in the schema.
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const cName = makeNameFromHint(namingHint);
    const what =
      type.kind === "union" &&
      schema.unionToMembers.get(type)!.kind === "strings"
        ? "enum class"
        : "struct";
    lines.push(`${what} ${cName};`);
  }
  lines.push("");

  // 2. Define all the types in the schema.
  // Make sure define each type *after* all its dependencies have been defined.
  const definedTypes = new Set<Interface | Union>();
  const defineType = (type: FieldType): void => {
    type = resolveType(type, schema);
    while (true) {
      if (type.kind === "optional") {
        type = resolveType(type.innerType, schema);
      } else if (type.kind === "array") {
        type = resolveType(type.elementType, schema);
      } else {
        break;
      }
    }
    if (type.kind !== "interface" && type.kind !== "union") {
      return;
    }

    if (definedTypes.has(type)) return;
    definedTypes.add(type);

    const namingHint = schema.namingHints.defaultScope.get(type);
    if (!namingHint) return;

    // Define dependencies first.
    if (type.kind === "interface") {
      for (const field of Object.values(type.fields)) {
        defineType(field.type);
      }
    } else {
      const firstMember = type.members[0]!;
      defineType(firstMember);
    }

    const typeCName = makeNameFromHint(namingHint);
    lines.push(...commentify(namingHint.doc));
    if (!internal) {
      lines.push(
        `/// Exported as '${rootNamespace}::${typePrefix}${typeCName}'`,
      );
    }
    switch (type.kind) {
      case "interface": {
        lines.push(writeTypepromptInterface(type, typeCName, schema, options));
        break;
      }
      case "union": {
        lines.push(writeTypepromptUnion(type, typeCName, schema, options));
        break;
      }
    }
    lines.push(
      "",
      "",
      `inline JsonNode ToJsonNode(const ${typeCName}&);`,
      `inline Status ParseValue(const JsonNode&, const JsonPath&, ${typeCName}&);`,
      "",
    );
  };

  for (const type of schema.namingHints.defaultScope.keys()) {
    defineType(type);
  }

  // 3. Write all the complex method implementations.
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const typeCName = makeNameFromHint(namingHint);
    switch (type.kind) {
      case "interface": {
        lines.push(
          writeMethodImplsForInterface(type, typeCName, schema, options),
        );
        break;
      }
      case "union": {
        lines.push(writeMethodImplsForUnion(type, typeCName, schema, options));
        break;
      }
    }
    lines.push("", "");
  }

  return lines.join("\n");
}

function writeTypepromptInterface(
  type: Interface,
  typeCName: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  const { internal } = options;
  const fields = Object.values(type.fields);
  const sortedFields = [...fields].sort((a, b) => {
    const nameA = toCName(toSnakeCase(a.name.text));
    const nameB = toCName(toSnakeCase(b.name.text));
    return nameA.localeCompare(nameB, "en-US");
  });

  const lines: string[] = [];
  const firstField = sortedFields[0];
  if (firstField && !internal) {
    const fieldCName = toCName(toSnakeCase(firstField.name.text));
    lines.push(
      "///",
      "/// To construct a value:",
      `///   ${typeCName} v = ${typeCName}::whole{`,
      `///       .${fieldCName} = ...,`,
      "///       ...",
      "///   };",
      "///",
      "/// Or with 'auto':",
      `///   auto v = *${typeCName}::whole{`,
      `///       .${fieldCName} = ...,`,
      "///       ...",
      "///   };",
      "///",
      "/// When using designated initializer syntax, always specify fields in alphabetical order.",
      "/// Using '::whole' forces you to set all the fields.",
    );
  }
  lines.push(`struct ${typeCName} {`);
  for (const field of sortedFields) {
    const type = resolveType(field.type, schema);
    if (isLiteralType(type)) continue;
    const cName = toCName(toSnakeCase(field.name.text));
    const fieldType = writeType(type, schema, options);
    lines.push(...commentify(field.doc, "  "));
    lines.push(`  ${fieldType} ${cName}{};`);
  }
  if (!internal) {
    lines.push(
      "",
      `  /// Builder requiring all fields of ${typeCName} to be set at construction.`,
      `  /// Converts to ${typeCName} via implicit conversion or '*'.`,
      "  struct whole {",
    );
    for (const field of sortedFields) {
      const type = resolveType(field.type, schema);
      if (isLiteralType(type)) continue;
      const cName = toCName(toSnakeCase(field.name.text));
      const fieldType = writeType(type, schema, options);
      lines.push(`    must_init<${fieldType}> ${cName};`);
    }
    lines.push(
      "",
      `    inline operator ${typeCName}() &&;`,
      `    operator ${typeCName}() const& = delete;`,
      "",
      `    ${typeCName} operator*() && { return std::move(*this); }`,
      `    ${typeCName} operator*() const& = delete;`,
    );
    lines.push("  };"); // struct whole
  }
  lines.push("};"); // struct

  return lines.join("\n");
}

function writeTypepromptUnion(
  type: Union,
  typeCName: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  const { internal } = options;
  const members = schema.unionToMembers.get(type)!;
  const lines: string[] = [];
  switch (members.kind) {
    case "strings": {
      lines.push(`enum class ${typeCName} {`);
      for (const member of members.members) {
        const cName = toCName("k".concat(toPascalCase(member.value)));
        lines.push(` ${cName},`);
      }
      lines.push("};"); // enum class
      break;
    }
    case "interfaces": {
      const { discriminants, discriminator } = members;
      const memberTypes = Object.values(members.members).map((member) =>
        writeType(member.resolved, schema, options),
      );
      lines.push(
        `struct ${typeCName} {`,
        " public:",
        " using variant_type = std::variant<",
      );
      for (const memberType of memberTypes) {
        lines.push(`   indirect<${memberType}>,`);
      }
      lines.push(lines.pop()!.slice(0, -1).concat(">;"), "");
      const firstMember = members.first;
      const firstType = writeType(firstMember, schema, options);
      lines.push(` ${typeCName}() : data_(${firstType}()) {}`);
      if (!internal) {
        lines.push(" /// Expects one of:");
        for (const member of memberTypes) {
          lines.push(` ///   - a ${member} rvalue`);
        }
      }
      lines.push(
        ` ${typeCName}(variant_type data) : data_(std::move(data)) {}`,
        "",
        ` ${typeCName}(const ${typeCName}&) = default;`,
        ` ${typeCName}(${typeCName}&&) = default;`,
        "",
      );
      if (!internal) {
        lines.push(" /// The right operand can be one of:");
        for (const member of memberTypes) {
          lines.push(` ///   - a ${member} rvalue`);
        }
      }
      lines.push(
        ` ${typeCName}& operator=(variant_type data) {`,
        "  data_ = std::move(data);",
        "  return *this;",
        " }",
        ` ${typeCName}& operator=(const ${typeCName}&) = default;`,
        ` ${typeCName}& operator=(${typeCName}&&) = default;`,
        "",
      );
      const discriminatorCName = toCName(toSnakeCase(discriminator));
      if (discriminants.type === "string") {
        lines.push(` enum class ${discriminatorCName} {`);
        for (const discriminant of Object.values(discriminants.values)) {
          const constantCName = toCName(
            "k".concat(toPascalCase(discriminant.value)),
          );
          lines.push(`  ${constantCName},`);
        }
        lines.push(
          " };",
          ` ${discriminatorCName} ${discriminatorCName}() const {`,
          `  return static_cast<enum ${discriminatorCName}>(data_.index());`,
          " }",
        );
      } else {
        const firstDiscriminant: boolean = discriminants.values[0]!.value;
        const indexOfTrue = firstDiscriminant ? 0 : 1;
        lines.push(
          ` bool ${discriminatorCName}() const { return data_.index() == ${indexOfTrue}; }`,
        );
      }
      lines.push("");
      if (discriminants.type === "string") {
        for (let i = 0; i < discriminants.values.length; i++) {
          const discriminant = discriminants.values[i]!;
          const methodCName = "as_".concat(
            toSnakeCase(discriminator),
            "_",
            toSnakeCase(discriminant.value),
          );
          const constantCName = toCName(
            "k".concat(toPascalCase(discriminant.value)),
          );
          const type = memberTypes[i];
          lines.push(
            ` /// Precondition: ${discriminatorCName}() == ${typeCName}::${discriminatorCName}::${constantCName}`,
            ` const ${type}& ${methodCName}() const& { return *std::get<${i}>(data_); }`,
            ` ${type}& ${methodCName}() & { return *std::get<${i}>(data_); }`,
            ` indirect<${type}> ${methodCName}() && { return std::move(std::get<${i}>(data_)); }`,
            "",
          );
        }
      } else {
        for (let i = 0; i < 2; i++) {
          const discriminant = discriminants.values[i]!;
          const discriminantValue: boolean = discriminant.value;
          const methodCName = "as_".concat(
            discriminantValue ? "" : "not_",
            toSnakeCase(discriminator),
          );
          const type = memberTypes[i];
          const maybeNot = discriminantValue ? "" : "!";
          lines.push(
            ` /// Precondition: ${maybeNot}${discriminatorCName}()`,
            ` const ${type}& ${methodCName}() const& { return *std::get<${i}>(data_); }`,
            ` ${type}& ${methodCName}() & { return *std::get<${i}>(data_); }`,
            ` indirect<${type}> ${methodCName}() && { return std::move(std::get<${i}>(data_)); }`,
            "",
          );
        }
      }
      lines.push(
        " template <typename Visitor>",
        " decltype(auto) visit(Visitor&& visitor) const& {",
        "  return std::visit(",
        "    [&visitor](const auto& boxed) -> decltype(auto) {",
        "     return visitor(*boxed);",
        "    },",
        "    data_);",
        " }",
        " template <typename Visitor>",
        " decltype(auto) visit(Visitor&& visitor) & {",
        "  return std::visit(",
        "    [&visitor](auto& boxed) -> decltype(auto) {",
        "     return visitor(*boxed);",
        "    },",
        "    data_);",
        " }",
        " template <typename Visitor>",
        " decltype(auto) visit(Visitor&& visitor) && {",
        "  return std::visit(",
        "    [&visitor](auto&& boxed) -> decltype(auto) {",
        "     return visitor(*std::forward<decltype(boxed)>(boxed));",
        "    },",
        "    std::move(data_));",
        " }",
        "",
        " private:",
        " variant_type data_;",
        "};", // struct
      );
    }
  }
  return lines.join("\n");
}

function writeMethodImplsForInterface(
  type: Interface,
  typeCName: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  const { rootNamespace } = options;
  const fields = Object.values(type.fields);
  const sortedFields = [...fields].sort((a, b) => {
    const nameA = toCName(toSnakeCase(a.name.text));
    const nameB = toCName(toSnakeCase(b.name.text));
    return nameA.localeCompare(nameB, "en-US");
  });

  const lines: string[] = [];

  if (!options.internal) {
    // Struct::whole -> Struct
    lines.push(
      `inline ${typeCName}::whole::operator ${typeCName}() && {`,
      ` return ${typeCName}{`,
    );
    for (const field of sortedFields) {
      const type = resolveType(field.type, schema);
      if (isLiteralType(type)) continue;
      const fieldCName = toCName(toSnakeCase(field.name.text));
      lines.push(`   *std::move(${fieldCName}),`);
    }
    lines.push(
      " };", // return
      "}", // whole::operator
      "",
    );
  }

  // ToJsonNode() and ParseValue()
  lines.push(
    `inline JsonNode ToJsonNode(const ${typeCName}& input) {`,
    ` using ::${rootNamespace}::ToJsonNode;`,
    " return internal::MakeJsonObject({",
  );
  for (const field of fields) {
    const rawFieldName = field.name.text;
    const type = resolveType(field.type, schema);
    let value: string;
    if (isLiteralType(type)) {
      value = JSON.stringify(type.value satisfies string | boolean);
    } else {
      const cFieldName = toCName(toSnakeCase(rawFieldName));
      value = `input.${cFieldName}`;
    }
    lines.push(`  {"${rawFieldName}", ToJsonNode(${value})},`);
  }
  lines.push(
    " });", // return MakeJsonObject({...});
    "}", // ToJsonNode
    "",
    `inline Status ParseValue(const JsonNode& node, const JsonPath& context, ${typeCName}& out) {`,
    " internal::StructParser parser(&node, context);",
  );
  const parseFields = fields
    .filter((field) => !isLiteralType(resolveType(field.type, schema)))
    .sort((a, b) =>
      a.name.text < b.name.text ? -1 : a.name.text > b.name.text ? 1 : 0,
    );
  for (const field of parseFields) {
    const rawFieldName = field.name.text;
    const cFieldName = toCName(toSnakeCase(rawFieldName));
    const method = field.type.kind === "optional" ? "ParseOptional" : "Parse";
    lines.push(` parser.${method}("${rawFieldName}", out.${cFieldName});`);
  }
  lines.push(
    " return std::move(parser).status();",
    "}", // ParseValue
  );

  return lines.join("\n");
}

function writeMethodImplsForUnion(
  type: Union,
  typeCName: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  const { rootNamespace } = options;
  const members = schema.unionToMembers.get(type)!;

  // ToJsonNode() and ParseValue()
  const lines: string[] = [];
  if (members.kind === "strings") {
    lines.push(
      `inline constexpr std::string_view to_string_view(${typeCName} input) {`,
      " switch (input) {",
    );
    for (const member of members.members.slice(1)) {
      const constantCName = toCName("k".concat(toPascalCase(member.value)));
      lines.push(
        `  case ${typeCName}::${constantCName}:`,
        `   return "${member.value}";`,
      );
    }
    const first = members.members[0]!;
    lines.push(
      "  default:",
      `   return "${first.value satisfies string}";`,
      " }",
      "}",
      "",
      `inline JsonNode ToJsonNode(const ${typeCName}& input) {`,
      " return JsonNode(to_string_view(input));",
      "}",
      "",
      `inline Status ParseValue(const JsonNode& node, const JsonPath& context, ${typeCName}& out) {`,
      " if (node.type() != JsonNode::Type::kString) {",
      '  return context.MakeError("Expected string");',
    );
    for (const member of members.members) {
      const constantCName = toCName("k".concat(toPascalCase(member.value)));
      lines.push(
        ` } else if (node.as_string() == "${member.value}") {`,
        `  out = ${typeCName}::${constantCName};`,
      );
    }
    lines.push(
      " } else {",
      "  return context.MakeError(std::format(\"Unknown constant '{}'\", node.as_string()));",
      " }",
      " return kOkStatus;",
      "}",
    );
  } else {
    const { discriminants, discriminator } = members;
    const findMethod =
      discriminants.type === "string"
        ? "FindStringDiscriminant"
        : "FindBoolDiscriminant";
    lines.push(
      `inline JsonNode ToJsonNode(const ${typeCName}& input) {`,
      ` using ::${rootNamespace}::ToJsonNode;`,
      " return input.visit([](const auto& v) { return ToJsonNode(v); });",
      "}",
      "",
      `inline Status ParseValue(const JsonNode& node, const JsonPath& context, ${typeCName}& out) {`,
      ` using ::${rootNamespace}::ParseValue;`,
      ` auto discriminant = internal::Unions::${findMethod}(node, context, "${discriminator}");`,
      " auto status = kOkStatus;",
      " if (!discriminant.ok()) {",
      "  return std::move(discriminant).error();",
    );
    for (const member of Object.values(members.members)) {
      const discriminant = JSON.stringify(
        member.discriminant.value satisfies string | boolean,
      );
      const type = writeType(member.resolved, schema, options);
      lines.push(
        ` } else if (*discriminant == ${discriminant}) {`,
        `  ${type} v;`,
        "  status = ParseValue(node, context, v);",
        "  out = std::move(v);",
      );
    }
    lines.push(
      " } else {",
      "  return context.MakeError(std::format(\"Unknown discriminant '{}'\", *discriminant));",
      " }",
      " return status;",
      "}",
    );
  }

  return lines.join("\n");
}

function writeType(
  type: Type | TypeNameView | Optional,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  switch (type.kind) {
    case "any": {
      return "JsonNode";
    }
    case "array": {
      const { elementType } = type;
      const element = writeType(elementType, schema, options);
      return `std::vector<${element}>`;
    }
    case "interface":
    case "union": {
      let namingHint = schema.namingHints.defaultScope.get(type);
      let typePrefix = options.topLevel ? options.typePrefix : "";
      if (!namingHint) {
        namingHint = schema.namingHints.shared.get(type)!;
        typePrefix = options.sharedTypePrefix!;
      }
      return typePrefix.concat(makeNameFromHint(namingHint));
    }
    case "optional": {
      const { innerType } = type;
      const inner = writeType(innerType, schema, options);
      return `std::optional<${inner}>`;
    }
    case "primitive": {
      if (type.primitive.text === "integer") {
        return "std::int32_t";
      } else {
        switch (type.primitive.text) {
          case "boolean":
            return "bool";
          case "string":
            return "std::string";
          case "number":
            return "double";
          default:
            throw new Error(type.primitive.text satisfies never);
        }
      }
    }
    case "record": {
      const value = writeType(type.valueType, schema, options);
      return `std::map<std::string, ${value}>`;
    }
    case "shared-type-name":
    case "type-name": {
      const resolvedType = resolveType(type, schema);
      return writeType(resolvedType, schema, options);
    }
  }
}

function makeNameFromHint(hint: NamingHint): string {
  const { namePieces } = hint;
  return namePieces
    .map((piece) => {
      switch (piece.kind) {
        case "type":
          return namePieces.length <= 1 ? toCName(piece.name) : piece.name;
        case "field":
          return capitalize(piece.name);
        case "member": {
          switch (piece.discriminant.type) {
            case "string":
              return capitalize(piece.discriminator).concat(
                toPascalCase(piece.discriminant.value),
              );
            case "boolean":
              return (piece.discriminant.value ? "" : "Not").concat(
                capitalize(piece.discriminator),
              );
          }
        }
      }
    })
    .join("_");
}

function toCName(name: string): string {
  return RESERVED_NAMES.has(name) ? name.concat("_") : name;
}

function commentify(doc: string, indent = ""): readonly string[] {
  if (!doc) return [];
  const lines = doc.split("\n");
  return lines.map((l) => (l ? `${indent}/// ${l}` : `${indent}///`));
}

function coalesceEmptyLines(code: string): string {
  return (
    code
      // Coalesce consecutive empty lines first.
      .replace(/\n\n\n+/g, "\n\n")
      // Remove spaces enclosed within curly brackets if that's all there is.
      .replace(/\{\s+\}/g, "{}")
      // Remove spaces enclosed within round brackets if that's all there is.
      .replace(/\(\s+\)/g, "()")
      // Remove spaces enclosed within square brackets if that's all there is.
      .replace(/\[\s+\]/g, "[]")
      // Remove empty lines following an open curly bracket.
      .replace(/(\{\n *)\n+/g, "$1")
      // Remove empty lines preceding a closed curly bracket.
      .replace(/\n+(\n *\})/g, "$1")
  );
}

function scaleIndent(input: string): string {
  return input
    .replace(/^ +/gm, (match) => match.repeat(2))
    .replace(/^( *)(public:|private:|protected:)/gm, (_, spaces, access) =>
      spaces.length > 0 ? `${spaces.slice(1)}${access}` : access,
    );
}

const RESERVED_NAMES: ReadonlySet<string> = new Set([
  // KEYWORDS
  "alignas",
  "alignof",
  "and",
  "and_eq",
  "asm",
  "atomic_cancel",
  "atomic_commit",
  "atomic_noexcept",
  "auto",
  "bitand",
  "bitor",
  "bool",
  "break",
  "case",
  "catch",
  "char",
  "char8_t",
  "char16_t",
  "char32_t",
  "class",
  "compl",
  "concept",
  "const",
  "consteval",
  "constexpr",
  "constinit",
  "const_cast",
  "continue",
  "co_await",
  "co_return",
  "co_yield",
  "decltype",
  "default",
  "delete",
  "do",
  "double",
  "dynamic_cast",
  "else",
  "enum",
  "explicit",
  "export",
  "extern",
  "false",
  "float",
  "for",
  "friend",
  "goto",
  "if",
  "inline",
  "int",
  "long",
  "mutable",
  "namespace",
  "new",
  "noexcept",
  "not",
  "not_eq",
  "nullptr",
  "operator",
  "or",
  "or_eq",
  "private",
  "protected",
  "public",
  "reflexpr",
  "register",
  "reinterpret_cast",
  "requires",
  "return",
  "short",
  "signed",
  "sizeof",
  "static",
  "static_assert",
  "static_cast",
  "struct",
  "switch",
  "synchronized",
  "template",
  "this",
  "thread_local",
  "throw",
  "true",
  "try",
  "typedef",
  "typeid",
  "typename",
  "union",
  "unsigned",
  "using",
  "virtual",
  "void",
  "volatile",
  "wchar_t",
  "while",
  "xor",
  "xor_eq",

  // RESERVED NAMES
  "JsonNode",
  "JsonPath",
  "OutputFormat",
  "ParseValue",
  "Status",
  "ToJsonNode",
  "indirect",
  "internal",
  "must_init",
  "schema",
  "std",
  "tools",
  "whole",
]);
