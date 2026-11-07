import {
  capitalize,
  makeTemplates,
  runtimeTypesSchema,
  toPascalCase,
  toSnakeCase,
  type Spec,
} from "@typeprompt/core";
import type {
  ValidCompilationResult,
  ValidNamespaceResult,
  ValidTemplate,
  ValidatedTool,
} from "@typeprompt/core/compiler/compiler-types.js";
import { DEFAULT_NAMESPACE } from "@typeprompt/core/compiler/default-namespace.js";
import { getId } from "@typeprompt/core/compiler/ids.js";
import type { Config } from "@typeprompt/core/config/config-parser.js";
import type {
  FieldType,
  Interface,
  NamingHint,
  Schema,
  TypeNameView,
  Union,
} from "@typeprompt/core/schema/schema-types.js";
import { isLiteralType } from "@typeprompt/core/schema/schema-utils.js";
import { resolveType } from "@typeprompt/core/schema/type-resolver.js";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import type { OutputFile } from "../codegen-types.js";
import { coalesceEmptyLines, reformatCFamilyCode } from "../formatters.js";

export function generateRustCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const rustConfig = config.gen?.rust;
  if (!rustConfig) {
    return [];
  }
  const templatesData = makeTemplates(compilationResult);
  return [
    {
      path: rustConfig.file,
      content: writeAll(compilationResult, templatesData),
    },
  ];
}

function writeAll(
  compilationResult: ValidCompilationResult,
  templatesData: Spec.Templates,
): string {
  return coalesceEmptyLines(
    [
      STATIC_SNIPPETS["rust-top-level"],
      STATIC_SNIPPETS["rust-imports"],
      reformatCFamilyCode(
        [
          STATIC_SNIPPETS["rust-public-types"],
          writePromptsStruct(compilationResult),
          writeTemplateIdEnum(compilationResult),
          writeToolExecutorTraits(compilationResult),
          writePromptToolsEnums(compilationResult),
          writeUserDefinedDatatypes(compilationResult),
          writeSpecDatatypes(),
          writeTemplatesData(templatesData),
          writeExecuteToolCall(compilationResult),
          STATIC_SNIPPETS["rust-logic"],
        ].join("\n\n"),
      ),
    ].join("\n\n"),
  );
}

function getTemplateTypes(
  template: ValidTemplate,
  compilationResult: ValidCompilationResult,
): { readonly inputType: string; readonly outputType: string } {
  const { singleNamespace } = compilationResult;
  const templateRustName = toRustName(toSnakeCase(template.template.name.text));
  const rustNamespace = toRustName(
    toSnakeCase(template.template.namespace?.text ?? DEFAULT_NAMESPACE),
  );
  const typePrefixBase = singleNamespace
    ? "schema::"
    : `schema::${rustNamespace}::`;
  const sharedTypePrefix = typePrefixBase.concat("shared::");
  const templateTypePrefix = typePrefixBase.concat(templateRustName, "::");

  const options: WriteSchemaOptions = {
    typePrefix: templateTypePrefix,
    sharedTypePrefix,
    topLevel: true,
  };

  const inputType = writeType(
    { kind: "type-name", name: { text: "Input" } },
    template.schema,
    options,
  );
  const outputType =
    template.outputFormat === "text"
      ? "String"
      : writeType(
          { kind: "type-name", name: { text: "Output" } },
          template.schema,
          options,
        );

  return { inputType, outputType };
}

function getToolExecutorRef(
  template: ValidTemplate,
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace } = compilationResult;
  const toolEntries = Object.values(template.tools);
  if (toolEntries.length <= 0) {
    return "NoTools";
  }
  if (toolEntries.length === 1) {
    const tool = toolEntries[0]!.tool;
    const toolRustName = toRustName(capitalize(tool.tool.name.text));
    const rustNamespace = toRustName(
      toSnakeCase(tool.tool.namespace?.text ?? DEFAULT_NAMESPACE),
    );
    const traitPath = singleNamespace
      ? `tool_executor::${toolRustName}`
      : `tool_executor::${rustNamespace}::${toolRustName}`;
    return traitPath;
  }
  const traitName = toRustName(template.template.name.text);
  const rustNamespace = toRustName(
    toSnakeCase(template.template.namespace?.text ?? DEFAULT_NAMESPACE),
  );
  const traitPath = singleNamespace
    ? `tool_executor::${traitName}`
    : `tool_executor::${rustNamespace}::${traitName}`;
  return traitPath;
}

function writePromptsStruct(compilationResult: ValidCompilationResult): string {
  const { singleNamespace, namespaces } = compilationResult;

  const writeTemplatesMembers = (
    structName: string,
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const lines: string[] = [
      "#[derive(Clone)]",
      `pub struct ${structName} {`,
      "  spec: std::sync::Arc<spec::Templates>,",
      "}",
      "",
      `impl ${structName} {`,
    ];
    for (const t of namespace.templates) {
      const { inputType, outputType } = getTemplateTypes(t, compilationResult);
      const propertyName = toRustName(toSnakeCase(t.template.name.text));
      const templateId = getId(t.template);
      const toolEntries = Object.values(t.tools);

      lines.push(`// Defined in '${t.template.sourcePath}'`);
      if (toolEntries.length === 0) {
        lines.push(
          `pub fn render_${propertyName}(&self, input: &${inputType}) -> Prompt<${outputType}, NoTools> {`,
          `  do_render(self.spec.as_ref(), "${templateId}", input, None)`,
          "}",
          "",
        );
      } else {
        const rawTemplateName = t.template.name.text;
        const rawNamespace = t.template.namespace?.text ?? DEFAULT_NAMESPACE;
        const executeFunctionName = singleNamespace
          ? toRustName(`execute_${toSnakeCase(rawTemplateName)}_tool_call`)
          : toRustName(
              `execute_${toSnakeCase(rawNamespace)}__${toSnakeCase(rawTemplateName)}_tool_call`,
            );

        const traitBound = getToolExecutorRef(t, compilationResult);

        lines.push(
          `pub fn render_${propertyName}<E: ${traitBound} + Send + Sync + 'static>(&self, input: &${inputType}) -> Prompt<${outputType}, E> {`,
          "  let execute_fn: ExecuteToolCallFn<E> = |call, exec| {",
          `    Box::pin(${executeFunctionName}(call, exec))`,
          "  };",
          `  do_render(self.spec.as_ref(), "${templateId}", input, Some(execute_fn))`,
          "}",
          "",
        );
      }
    }
    lines.push("}");
    return lines;
  };

  if (singleNamespace) {
    return [
      "/// Entry point for building prompts.",
      ...writeTemplatesMembers("Prompts", singleNamespace),
      "",
      "impl Prompts {",
      "  fn new(spec: std::sync::Arc<spec::Templates>) -> Self {",
      "    Self { spec }",
      "  }",
      "}",
      "",
      "/// Entry point for building prompts.",
      "pub static PROMPTS: std::sync::LazyLock<Prompts> = std::sync::LazyLock::new(|| {",
      "  Prompts::new(std::sync::Arc::new(TEMPLATES_DATA.clone()))",
      "});",
    ].join("\n");
  } else {
    const nsList = Object.values(namespaces);
    const lines: string[] = [
      "/// Entry point for building prompts.",
      "#[derive(Clone)]",
      "pub struct Prompts {",
    ];
    for (const ns of nsList) {
      const namespaceStructName = toPascalCase(ns.name).concat("Prompts");
      const propertyName = toRustName(toSnakeCase(ns.name));
      lines.push(`pub ${propertyName}: ${namespaceStructName},`);
    }
    lines.push(
      "}",
      "",
      "impl Prompts {",
      "  fn new(spec: std::sync::Arc<spec::Templates>) -> Self {",
      "    Self {",
    );
    for (const ns of nsList) {
      const namespaceStructName = toPascalCase(ns.name).concat("Prompts");
      const propertyName = toRustName(toSnakeCase(ns.name));
      lines.push(
        `      ${propertyName}: ${namespaceStructName} { spec: std::sync::Arc::clone(&spec) },`,
      );
    }
    lines.push("    }", "  }", "}", "");

    for (const namespace of nsList) {
      const namespaceStructName = toPascalCase(namespace.name).concat(
        "Prompts",
      );
      lines.push(
        `/// Prompts in the '${namespace.name}' namespace.`,
        ...writeTemplatesMembers(namespaceStructName, namespace),
        "",
      );
    }

    lines.push(
      "/// Entry point for building prompts.",
      "pub static PROMPTS: std::sync::LazyLock<Prompts> = std::sync::LazyLock::new(|| {",
      "  Prompts::new(std::sync::Arc::new(TEMPLATES_DATA.clone()))",
      "});",
    );
    return lines.join("\n");
  }
}

function writeTemplateIdEnum(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, templates } = compilationResult;
  const templateList = Object.values(templates);
  const lines = [
    "/// Uniquely identifies a prompt template.",
    "#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy)]",
    "pub enum TemplateId {",
  ];
  if (templateList.length === 0) {
    lines.push(
      "  None,",
      "}",
      "",
      "impl TemplateId {",
      "  pub const fn as_str(&self) -> &'static str {",
      '    "None"',
      "  }",
      "",
      "  pub fn from_id(_s: &str) -> Option<Self> {",
      "    None",
      "  }",
      "}",
      "",
    );
  } else {
    for (const template of templateList) {
      const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
      const rawTemplateName = template.template.name.text;
      const rawMemberName = singleNamespace
        ? rawTemplateName
        : `${namespace}_${rawTemplateName}`;
      const variantName = toRustName(toPascalCase(rawMemberName));
      lines.push(`  ${variantName},`);
    }
    lines.push(
      "}",
      "",
      "impl TemplateId {",
      "  pub const fn as_str(&self) -> &'static str {",
      "    match self {",
    );
    for (const template of templateList) {
      const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
      const rawTemplateName = template.template.name.text;
      const rawMemberName = singleNamespace
        ? rawTemplateName
        : `${namespace}_${rawTemplateName}`;
      const variantName = toRustName(toPascalCase(rawMemberName));
      const templateId = getId(template.template);
      lines.push(`      TemplateId::${variantName} => "${templateId}",`);
    }
    lines.push(
      "    }",
      "  }",
      "",
      "  pub fn from_id(s: &str) -> Option<Self> {",
      "    match s {",
    );
    for (const template of templateList) {
      const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
      const rawTemplateName = template.template.name.text;
      const rawMemberName = singleNamespace
        ? rawTemplateName
        : `${namespace}_${rawTemplateName}`;
      const variantName = toRustName(toPascalCase(rawMemberName));
      const templateId = getId(template.template);
      lines.push(`      "${templateId}" => Some(TemplateId::${variantName}),`);
    }
    lines.push("      _ => None,", "    }", "  }", "}", "");
  }
  lines.push(
    "impl std::fmt::Display for TemplateId {",
    "  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {",
    '    write!(f, "{}", self.as_str())',
    "  }",
    "}",
  );
  return lines.join("\n");
}

function writeToolExecutorTraits(
  compilationResult: ValidCompilationResult,
): string {
  if (Object.keys(compilationResult.tools).length <= 0) return "";
  const { singleNamespace, namespaces } = compilationResult;

  const writeNamespace = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const lines: string[] = [];
    const rustNamespace = toRustName(toSnakeCase(namespace.name));
    const typePrefixBase = singleNamespace
      ? "super::schema::"
      : `super::super::schema::${rustNamespace}::`;
    const sharedTypePrefix = typePrefixBase.concat("shared::");

    for (const tool of Object.values(namespace.tools)) {
      const rawToolName = tool.tool.name.text;
      const interfaceName = toRustName(capitalize(rawToolName));
      const toolTypePrefix = typePrefixBase.concat(
        toRustName(toSnakeCase(rawToolName)),
        "::",
      );
      const options: WriteSchemaOptions = {
        typePrefix: toolTypePrefix,
        sharedTypePrefix,
        topLevel: true,
      };
      const inputType = writeType(
        { kind: "type-name", name: { text: "Input" } },
        tool.schema,
        options,
      );
      const outputType = writeType(
        { kind: "type-name", name: { text: "Output" } },
        tool.schema,
        options,
      );

      const methodName = toRustName(toSnakeCase(rawToolName));
      lines.push(
        `/// Tool executor interface for the '${rawToolName}' tool.`,
        `pub trait ${interfaceName} {`,
        `fn ${methodName}(`,
        "&self,",
        `input: ${inputType},`,
        `) -> impl std::future::Future<Output = ${outputType}> + Send`,
        "where",
        "Self: Sized;",
        "}",
        "",
        `impl<T: ${interfaceName}> ${interfaceName} for &T {`,
        `fn ${methodName}(`,
        "&self,",
        `input: ${inputType},`,
        `) -> impl std::future::Future<Output = ${outputType}> + Send {`,
        `(**self).${methodName}(input)`,
        "}",
        "}",
        "",
        `impl<T: ${interfaceName}> ${interfaceName} for Box<T> {`,
        `fn ${methodName}(`,
        "&self,",
        `input: ${inputType},`,
        `) -> impl std::future::Future<Output = ${outputType}> + Send {`,
        `(**self).${methodName}(input)`,
        "}",
        "}",
        "",
        `impl<T: ${interfaceName}> ${interfaceName} for std::sync::Arc<T> {`,
        `fn ${methodName}(`,
        "&self,",
        `input: ${inputType},`,
        `) -> impl std::future::Future<Output = ${outputType}> + Send {`,
        `(**self).${methodName}(input)`,
        "}",
        "}",
        "",
      );
    }
    for (const template of namespace.templates) {
      const toolEntries = Object.values(template.tools);
      if (toolEntries.length < 2) continue;
      const rawTemplateName = template.template.name.text;
      const traitName = toRustName(rawTemplateName);
      const toolInfoList = toolEntries.map((t) => {
        const tool = t.tool;
        const rawToolName = tool.tool.name.text;
        const interfaceRef = toRustName(capitalize(rawToolName));
        return { rawToolName, interfaceRef };
      });

      const toolNamesList = toolInfoList
        .map((t) => `'${t.rawToolName}'`)
        .join(", ");
      const inheritedTraits = toolInfoList
        .map((t) => t.interfaceRef)
        .join(" + ");

      lines.push(
        `/// Composite tool executor trait for the '${rawTemplateName}' prompt template.`,
        `/// Requires implementations of tools: ${toolNamesList}.`,
        `pub trait ${traitName}: ${inheritedTraits} {}`,
        `impl<T: ?Sized + ${inheritedTraits}> ${traitName} for T {}`,
        "",
      );
    }
    return lines;
  };

  const lines = [
    "/// Namespace containing tool executor traits.",
    "#[allow(non_camel_case_types)]",
    "pub mod tool_executor {",
  ];
  if (singleNamespace) {
    lines.push(...writeNamespace(singleNamespace));
  } else {
    for (const namespace of Object.values(namespaces)) {
      const hasTools =
        Object.keys(namespace.tools).length > 0 ||
        namespace.templates.some((t) => Object.keys(t.tools).length > 0);
      if (!hasTools) continue;
      const rustNamespace = toRustName(toSnakeCase(namespace.name));
      lines.push(`pub mod ${rustNamespace} {`);
      lines.push(...writeNamespace(namespace));
      lines.push(`}  // mod ${rustNamespace}`, "");
    }
  }
  lines.push("}  // mod tool_executor");
  return lines.join("\n");
}

function writePromptToolsEnums(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, namespaces } = compilationResult;
  const anyTools = singleNamespace
    ? singleNamespace.templates.some((t) => Object.keys(t.tools).length > 0)
    : Object.values(namespaces).some((ns) =>
        ns.templates.some((t) => Object.keys(t.tools).length > 0),
      );
  if (!anyTools) return "";

  const writeNamespace = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const lines: string[] = [];
    for (const template of namespace.templates) {
      const toolEntries = Object.values(template.tools);
      if (toolEntries.length <= 0) continue;
      const rawTemplateName = template.template.name.text;
      const enumName = toRustName(rawTemplateName);

      lines.push(
        "/// Tools available for the '" +
          rawTemplateName +
          "' prompt template.",
        "#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]",
        "#[allow(non_camel_case_types)]",
        `pub enum ${enumName} {`,
      );

      for (const t of toolEntries) {
        const rawToolName = t.tool.tool.name.text;
        const memberName = toRustName(capitalize(rawToolName));
        lines.push(`#[serde(rename = "${rawToolName}")]`, `${memberName},`);
      }

      lines.push(
        "}",
        "",
        `impl ${enumName} {`,
        "pub fn tool_name(&self) -> &'static str {",
        "match self {",
      );

      for (const t of toolEntries) {
        const rawToolName = t.tool.tool.name.text;
        const memberName = toRustName(capitalize(rawToolName));
        lines.push(`${enumName}::${memberName} => "${rawToolName}",`);
      }

      lines.push(
        "}",
        "}",
        "",
        "pub fn as_str(&self) -> &'static str {",
        "self.tool_name()",
        "}",
        "}",
        "",
        `impl std::fmt::Display for ${enumName} {`,
        "fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {",
        'write!(f, "{}", self.as_str())',
        "}",
        "}",
        "",
      );
    }
    return lines;
  };

  const lines = [
    "/// Namespace containing tools available for prompt templates.",
    "#[allow(non_camel_case_types)]",
    "pub mod prompt_tools {",
  ];
  if (singleNamespace) {
    lines.push(...writeNamespace(singleNamespace));
  } else {
    for (const namespace of Object.values(namespaces)) {
      const templatesWithTools = namespace.templates.filter(
        (t) => Object.keys(t.tools).length > 0,
      );
      if (templatesWithTools.length <= 0) continue;
      const rustNamespace = toRustName(toSnakeCase(namespace.name));
      lines.push(`pub mod ${rustNamespace} {`);
      lines.push(...writeNamespace(namespace));
      lines.push(`}  // mod ${rustNamespace}`, "");
    }
  }
  lines.push("}  // mod prompt_tools");
  return lines.join("\n");
}

function writeUserDefinedDatatypes(
  compilationResult: ValidCompilationResult,
): string {
  const { metaSchema, namespaces, singleNamespace } = compilationResult;
  const anyTypes = (schema: Schema): boolean =>
    Object.keys(schema.typeDeclarations).length >= 1;
  const lines: string[] = [];

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
        },
      )
    : "()";
  lines.push(
    "/// Metadata associated with a prompt.",
    `pub type Meta = ${metaType};`,
    "",
    "/// Namespace containing the user-defined datatypes.",
    "pub mod schema {",
  );
  if (anyTypes(metaSchema)) {
    lines.push(
      "pub mod meta {",
      writeSchema(metaSchema, {
        typePrefix: "schema::meta::",
      }),
      "}  // mod meta",
      "",
    );
  }

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    const rustNamespace = toRustName(toSnakeCase(namespace.name));
    const typePrefixBase = singleNamespace
      ? "schema::"
      : `schema::${rustNamespace}::`;
    const sharedTypePrefix = "super::shared::";
    if (anyTypes(namespace.schema)) {
      lines.push("pub mod shared {");
      lines.push(
        writeSchema(namespace.schema, {
          typePrefix: sharedTypePrefix,
        }),
      );
      lines.push("}  // mod shared", "");
    }
    for (const template of namespace.templates) {
      const templateModName = toRustName(
        toSnakeCase(template.template.name.text),
      );
      const typePrefix = typePrefixBase.concat(templateModName, "::");
      lines.push(`pub mod ${templateModName} {`);
      lines.push(
        writeSchema(template.schema, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
      lines.push(`}  // mod ${templateModName}`, "");
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolModName = toRustName(toSnakeCase(tool.tool.name.text));
      const typePrefix = typePrefixBase.concat(toolModName, "::");
      lines.push(`pub mod ${toolModName} {\n`);
      lines.push(
        writeSchema(tool.schema, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
      lines.push(`}  // mod ${toolModName}`, "");
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace);
  } else {
    for (const namespace of Object.values(namespaces)) {
      const rustNamespace = toRustName(toSnakeCase(namespace.name));
      lines.push(`pub mod ${rustNamespace} {`);
      writeNamespace(namespace);
      lines.push(`}  // mod ${rustNamespace}`, "");
    }
  }
  lines.push("}  // mod schema\n");
  return lines.join("\n");
}

function writeSpecDatatypes(): string {
  const options = {
    typePrefix: "spec::",
    file: true,
  } as const;
  const lines = [
    "mod spec {",
    writeSchema(runtimeTypesSchema, options),
    "}  // mod spec",
  ];
  return lines.join("\n");
}

function writeTemplatesData(templatesData: Spec.Templates): string {
  const stringifiedJson = JSON.stringify(JSON.stringify(templatesData));
  const lines = [
    "static TEMPLATES_DATA: std::sync::LazyLock<spec::Templates> = std::sync::LazyLock::new(|| {",
    "serde_json::from_str(",
    `${stringifiedJson},`,
    ").unwrap()",
    "});",
  ];
  return lines.join("\n");
}

function getToolInfo(
  tool: ValidatedTool,
  compilationResult: ValidCompilationResult,
): {
  readonly traitName: string;
  readonly methodName: string;
  readonly inputType: string;
  readonly outputType: string;
} {
  const { singleNamespace } = compilationResult;
  const rawToolName = tool.tool.name.text;
  const traitName = toRustName(capitalize(rawToolName));
  const rustNamespace = toRustName(
    toSnakeCase(tool.tool.namespace?.text ?? DEFAULT_NAMESPACE),
  );

  const traitRef = singleNamespace
    ? `tool_executor::${traitName}`
    : `tool_executor::${rustNamespace}::${traitName}`;

  const typePrefixBase = singleNamespace
    ? "schema::"
    : `schema::${rustNamespace}::`;
  const sharedTypePrefix = typePrefixBase.concat("shared::");
  const toolTypePrefix = typePrefixBase.concat(
    toRustName(toSnakeCase(rawToolName)),
    "::",
  );
  const options: WriteSchemaOptions = {
    typePrefix: toolTypePrefix,
    sharedTypePrefix,
    topLevel: true,
  };

  const inputType = writeType(
    { kind: "type-name", name: { text: "Input" } },
    tool.schema,
    options,
  );
  const outputType = writeType(
    { kind: "type-name", name: { text: "Output" } },
    tool.schema,
    options,
  );

  const methodName = toRustName(toSnakeCase(rawToolName));

  return {
    traitName: traitRef,
    methodName,
    inputType,
    outputType,
  };
}

function writeExecuteToolCall(
  compilationResult: ValidCompilationResult,
): string {
  const { templates, singleNamespace } = compilationResult;
  const anyTools = Object.values(templates).some(
    (t) => Object.keys(t.tools).length >= 1,
  );
  if (!anyTools) return "";

  const sections: string[] = [];

  for (const template of Object.values(templates)) {
    const templateTools = Object.values(template.tools).map((t) => t.tool);
    if (templateTools.length <= 0) continue;

    const rawTemplateName = template.template.name.text;
    const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const functionName = singleNamespace
      ? toRustName(`execute_${toSnakeCase(rawTemplateName)}_tool_call`)
      : toRustName(
          `execute_${toSnakeCase(namespace)}__${toSnakeCase(rawTemplateName)}_tool_call`,
        );

    const uniqueTraits = Array.from(
      new Set(
        templateTools.map((t) => getToolInfo(t, compilationResult).traitName),
      ),
    );
    const traitBounds = uniqueTraits.join(" + ");

    const lines = [
      `async fn ${functionName}<E: ${traitBounds}>(`,
      "tool_call: &ToolCall,",
      "executor: &E,",
      ") -> ToolCallResponse {",
      "match tool_call.tool_name.as_str() {",
    ];

    for (const tool of templateTools) {
      const rawToolName = tool.tool.name.text;
      const { methodName } = getToolInfo(tool, compilationResult);

      lines.push(
        `"${rawToolName}" => dispatch_tool_call(tool_call, |input| executor.${methodName}(input)).await,`,
      );
    }

    lines.push(
      "_ => make_tool_error_response(",
      "tool_call.call_id.clone(),",
      'format!("Tool not found: {}", tool_call.tool_name),',
      "),",
      "}",
      "}",
    );

    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

type WriteSchemaOptions = {
  readonly topLevel?: true;
  readonly typePrefix: string;
  readonly sharedTypePrefix?: string;
  readonly file?: true;
};

function writeSchema(schema: Schema, options: WriteSchemaOptions): string {
  const { typePrefix } = options;
  const lines: string[] = [];
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const name = makeNameFromHint(namingHint);
    if (!options.file) {
      lines.push(`// Exported as '${typePrefix}${name}'`);
    }
    lines.push(...commentify(namingHint.doc));
    switch (type.kind) {
      case "interface": {
        lines.push(writeTypepromptInterface(type, name, schema, options));
        break;
      }
      case "union": {
        lines.push(writeTypepromptUnion(type, name, schema, options));
        break;
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function writeTypepromptInterface(
  type: Interface,
  typeName: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  const fields = Object.values(type.fields);
  const lines: string[] = [];
  const hasLiteralField = fields.some((f) => isLiteralType(f.type));

  const vis = options.file ? "pub(super) " : "pub ";
  const derives = hasLiteralField
    ? "Clone, serde::Deserialize, Debug, PartialEq"
    : "Clone, serde::Serialize, serde::Deserialize, Debug, PartialEq";
  lines.push(`#[derive(${derives})]`);
  lines.push(`${vis}struct ${typeName} {`);
  for (const field of fields) {
    const type = resolveType(field.type, schema);
    if (isLiteralType(type)) continue;
    const rawFieldName = field.name.text;
    const rustName = toRustName(toSnakeCase(rawFieldName));
    const fieldType = writeType(type, schema, options);
    lines.push(...commentify(field.doc));
    const serdeAttrs: string[] = [];
    if (rawFieldName !== rustName) {
      serdeAttrs.push(`rename = "${rawFieldName}"`);
    }
    if (type.kind === "optional") {
      serdeAttrs.push("default");
    }
    if (serdeAttrs.length > 0) {
      lines.push(`#[serde(${serdeAttrs.join(", ")})]`);
    }
    lines.push(`${vis}${rustName}: ${fieldType},`);
  }
  lines.push("}"); // struct

  if (hasLiteralField) {
    lines.push(
      "",
      `impl serde::Serialize for ${typeName} {`,
      "fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {",
      `let mut state = serde::Serializer::serialize_struct(serializer, "${typeName}", ${fields.length})?;`,
    );
    for (const field of fields) {
      const type = resolveType(field.type, schema);
      const rawFieldName = field.name.text;
      if (isLiteralType(type)) {
        lines.push(
          `serde::ser::SerializeStruct::serialize_field(&mut state, "${rawFieldName}", &${JSON.stringify(type.value)})?;`,
        );
      } else {
        const rustName = toRustName(toSnakeCase(rawFieldName));
        lines.push(
          `serde::ser::SerializeStruct::serialize_field(&mut state, "${rawFieldName}", &self.${rustName})?;`,
        );
      }
    }
    lines.push("serde::ser::SerializeStruct::end(state)");
    lines.push("}"); // fn serialize
    lines.push("}"); // impl serde::Serialize
  }

  return lines.join("\n");
}

function writeTypepromptUnion(
  type: Union,
  typeName: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  const members = schema.unionToMembers.get(type)!;
  const lines: string[] = [];
  const vis = options.file ? "pub(super) " : "pub ";
  switch (members.kind) {
    case "strings": {
      lines.push(
        "#[derive(Clone, serde::Serialize, serde::Deserialize, Debug, PartialEq)]",
      );
      lines.push(`${vis}enum ${typeName} {\n`);
      for (const member of members.members) {
        const rustName = toRustName(toPascalCase(member.value));
        lines.push(`#[serde(rename = "${member.value}")]`);
        lines.push(rustName.concat(","));
      }
      lines.push("}"); // enum
      lines.push(
        "",
        `impl ${typeName} {`,
        `  ${vis}const fn as_str(&self) -> &'static str {`,
        "    match self {",
      );
      for (const member of members.members) {
        const rustName = toRustName(toPascalCase(member.value));
        lines.push(`      Self::${rustName} => "${member.value}",`);
      }
      lines.push(
        "    }",
        "  }",
        "}",
        "",
        `impl std::fmt::Display for ${typeName} {`,
        "  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {",
        '    write!(f, "{}", self.as_str())',
        "  }",
        "}",
      );
      break;
    }
    case "interfaces": {
      lines.push("#[derive(Clone, Debug, PartialEq)]");
      lines.push(`${vis}enum ${typeName} {\n`);
      const { discriminator } = members;
      const caseEntries = Object.values(members.members).map(
        (
          member,
        ): {
          readonly quotedDiscriminant: string;
          readonly caseName: string;
          readonly type: string;
        } => {
          const { discriminant, isRecursive } = member;
          const caseName = toRustName(
            ((): string => {
              switch (discriminant.kind) {
                case "string-literal": {
                  return capitalize(discriminator).concat(
                    toPascalCase(discriminant.value),
                  );
                }
                case "boolean-literal":
                  return discriminant.value === true
                    ? capitalize(discriminator)
                    : "Not".concat(capitalize(discriminator));
              }
            })(),
          );
          let type = writeType(member.resolved, schema, options);
          if (isRecursive) {
            type = `Box<${type}>`;
          }
          const quotedDiscriminant = JSON.stringify(discriminant.value);
          return { quotedDiscriminant, caseName, type };
        },
      );
      for (const { caseName, type } of caseEntries) {
        lines.push(`${caseName}(${type}),`);
      }
      lines.push("}"); // enum

      lines.push(
        "",
        `impl serde::Serialize for ${typeName} {`,
        "fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S : serde::Serializer {",
        "match self {",
      );
      for (const { caseName } of caseEntries) {
        lines.push(
          `${typeName}::${caseName}(v) => serde::Serialize::serialize(v, serializer),`,
        );
      }
      lines.push(
        "}", // match
        "}", // fn serialize
        "}", // impl serde::Serialize
      );

      const valueGetter =
        members.discriminants.type === "boolean" ? "as_bool" : "as_str";
      lines.push(
        "",
        `impl<'de> serde::Deserialize<'de> for ${typeName} {`,
        "fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D : serde::Deserializer<'de> {",
        "let value = serde_json::Value::deserialize(deserializer)?;",
        `let discriminant = value.get("${discriminator}")`,
        `.and_then(serde_json::Value::${valueGetter})`,
        `.ok_or_else(|| serde::de::Error::missing_field("${discriminator}"))?;`,
        "match discriminant {",
      );
      for (const { caseName, quotedDiscriminant, type } of caseEntries) {
        lines.push(`${quotedDiscriminant} => {`);
        lines.push(
          `let v = <${type}>::deserialize(value).map_err(serde::de::Error::custom)?;`,
        );
        lines.push(`Ok(${typeName}::${caseName}(v))`);
        lines.push("}");
      }
      if (members.discriminants.type === "string") {
        const discriminants = caseEntries
          .map((e) => e.quotedDiscriminant)
          .join(", ");
        lines.push(
          `other => Err(serde::de::Error::unknown_variant(other, &[${discriminants}])),`,
        );
      }
      lines.push(
        "}", // match
        "}", // fn deserialize
        "}", // impl serde::Deserialize
      );
      const nonLiteralCommonFields = members.commonFields.filter(
        (f) => !isLiteralType(f.type),
      );

      if (nonLiteralCommonFields.length >= 1) {
        lines.push("", `impl ${typeName} {`);
        for (const member of nonLiteralCommonFields) {
          const rustName = toRustName(toSnakeCase(member.name));
          const type = writeType(member.type, schema, options);
          if (member.doc) {
            lines.push(...commentify(member.doc));
          }
          lines.push(`${vis}fn ${rustName}(&self) -> &${type} {`);
          lines.push("match self {");
          for (const { caseName } of caseEntries) {
            lines.push(`${typeName}::${caseName}(v) => &v.${rustName},`);
          }
          lines.push(
            "}", // match
            "}", // fn
          );
        }
        lines.push("}"); // impl
      }
    }
  }
  return lines.join("\n");
}

function writeType(
  type: FieldType | TypeNameView,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  switch (type.kind) {
    case "any": {
      return "serde_json::Value";
    }
    case "array": {
      const { elementType } = type;
      const writtenElement = writeType(elementType, schema, options);
      return `Vec<${writtenElement}>`;
    }
    case "boolean-literal": {
      return "bool";
    }
    case "interface":
    case "union": {
      const { sharedTypePrefix, topLevel, typePrefix } = options;
      let namingHint = schema.namingHints.defaultScope.get(type);
      if (namingHint) {
        if (topLevel) {
          return typePrefix.concat(makeNameFromHint(namingHint));
        } else {
          return makeNameFromHint(namingHint!);
        }
      } else {
        namingHint = schema.namingHints.shared.get(type);
        if (topLevel) {
          return sharedTypePrefix!.concat(makeNameFromHint(namingHint!));
        } else {
          return "super::shared::".concat(makeNameFromHint(namingHint!));
        }
      }
    }
    case "optional": {
      const writtenInner = writeType(type.innerType, schema, options);
      return `Option<${writtenInner}>`;
    }
    case "primitive": {
      if (type.primitive.text === "integer") {
        return "i32";
      } else {
        switch (type.primitive.text) {
          case "boolean":
            return "bool";
          case "string":
            return "String";
          case "number":
            return "f64";
          default:
            throw new Error(type.primitive.text satisfies never);
        }
      }
    }
    case "record": {
      return `std::collections::HashMap<String, ${writeType(type.valueType, schema, options)}>`;
    }
    case "shared-type-name":
    case "type-name": {
      const resolvedType = resolveType(type, schema);
      return writeType(resolvedType, schema, options);
    }
    case "string-literal": {
      return "String";
    }
  }
}

function makeNameFromHint(hint: NamingHint): string {
  const { namePieces } = hint;
  return namePieces
    .map((piece) => {
      switch (piece.kind) {
        case "type":
          return namePieces.length <= 1 ? toRustName(piece.name) : piece.name;
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

function toRustName(name: string): string {
  return RESERVED_NAMES.has(name) || RUST_HARD_KEYWORDS.has(name)
    ? name.concat("_")
    : name;
}

function commentify(doc: string): readonly string[] {
  if (!doc) return [];
  const lines = doc.split("\n");
  return lines.map((l) => (l ? `/// ${l}` : "///"));
}

const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "Box",
  "Debug",
  "Option",
  "PartialEq",
  "Prompt",
  "Prompts",
  "Result",
  "String",
  "ToolExecutor",
  "Vec",
  "derive",
  "serde",
  "serde_json",
  "tool_executor",
] as const);

const RUST_HARD_KEYWORDS: ReadonlySet<string> = new Set([
  "Self",
  // Strict keywords
  "as",
  "break",
  "const",
  "continue",
  "crate",
  "else",
  "enum",
  "extern",
  "false",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "static",
  "struct",
  "super",
  "trait",
  "true",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
  // Reserved keywords (not yet used but reserved)
  "abstract",
  "become",
  "box",
  "do",
  "final",
  "macro",
  "override",
  "priv",
  "typeof",
  "unsized",
  "virtual",
  "yield",
  // 2018+ keywords
  "async",
  "await",
  "dyn",
  "try",
]);
