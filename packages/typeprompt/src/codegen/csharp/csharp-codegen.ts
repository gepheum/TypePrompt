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
  Field,
  FieldType,
  Interface,
  NamingHint,
  Schema,
  TypeNameView,
  Union,
} from "@typeprompt/core/schema/schema-types.js";
import { isLiteralType } from "@typeprompt/core/schema/schema-utils.js";
import { resolveType } from "@typeprompt/core/schema/type-resolver.js";
import { capitalize, toPascalCase } from "@typeprompt/core/util/casing.js";
import { runtimeTypesSchema } from "../../runtime/runtime-types-schema.js";
import { makeTemplates } from "../../runtime/spec-maker.js";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import type { OutputFile } from "../codegen-types.js";
import { reformatCFamilyCode } from "../formatters.js";

export function generateCSharpCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const csharpConfig = config.gen?.csharp;
  if (!csharpConfig) {
    return [];
  }
  return [
    {
      path: csharpConfig.file,
      content: writeAll(compilationResult, csharpConfig),
    },
  ];
}

function writeAll(
  compilationResult: ValidCompilationResult,
  config: { rootNamespace: string },
): string {
  const { rootNamespace } = config;
  const unionContext = makeUnionContext(compilationResult);

  const indentUnit = "    ";
  return coalesceEmptyLines(
    [
      STATIC_SNIPPETS["csharp-imports"],
      `namespace ${rootNamespace};`,
      reformatCFamilyCode(
        [
          writePromptsClass(compilationResult),
          writePublicTypes(compilationResult),
          writeTemplateIdEnum(compilationResult),
          writeToolExecutorInterfaces(compilationResult),
          writePromptToolsEnums(compilationResult),
          writeUserDefinedDatatypes(compilationResult, unionContext),
          writeSpecDatatypes(unionContext),
          writeTemplatesData(compilationResult),
          writeExecuteToolCall(compilationResult),
          writeMetaParser(compilationResult),
        ]
          .filter(Boolean)
          .join("\n\n"),
        { indentUnit },
      ),
      STATIC_SNIPPETS["csharp-logic"],
    ].join("\n\n"),
  );
}

function writeTemplateIdEnum(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, templates } = compilationResult;
  const lines = [
    "/// <summary>",
    "/// Uniquely identifies a prompt template.",
    "/// </summary>",
    "public enum TemplateId",
    "{",
  ];
  for (const template of Object.values(templates)) {
    const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const templateName = template.template.name.text;
    const rawMemberName = singleNamespace
      ? templateName
      : `${namespace}_${templateName}`;
    const memberName = toCSharpName(rawMemberName);
    lines.push(`${memberName},`);
  }
  lines.push(
    "}",
    "",
    "public static class TemplateIdExtensions",
    "{",
    "public static string GetId(this TemplateId templateId)",
    "{",
    "return templateId switch",
    "{",
  );
  for (const template of Object.values(templates)) {
    const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const templateName = template.template.name.text;
    const rawMemberName = singleNamespace
      ? templateName
      : `${namespace}_${templateName}`;
    const memberName = toCSharpName(rawMemberName);
    const templateId = getId(template.template);
    lines.push(`TemplateId.${memberName} => "${templateId}",`);
  }
  lines.push(
    "_ => throw new ArgumentOutOfRangeException(nameof(templateId)),",
    "};",
    "}",
    "}",
  );
  return lines.join("\n");
}

function writeToolExecutorInterfaces(
  compilationResult: ValidCompilationResult,
): string {
  if (Object.keys(compilationResult.tools).length <= 0) return "";
  const { singleNamespace, namespaces } = compilationResult;

  const writeNamespaceBody = (namespace: ValidNamespaceResult): string => {
    if (Object.keys(namespace.tools).length <= 0) return "";
    const lines: string[] = [];

    for (const tool of Object.values(namespace.tools)) {
      const toolName = tool.tool.name.text;
      const interfaceName = `I${capitalize(toolName)}`;
      const methodName = toCSharpName(capitalize(toolName));
      const { inputType, outputType } = getToolTypes(tool, compilationResult);

      lines.push(
        "/// <summary>",
        `/// Tool executor interface for the '${toolName}' tool.`,
        "/// </summary>",
        `public interface ${interfaceName}`,
        "{",
        `Task<${outputType}> ${methodName}(${inputType} input, CancellationToken cancellationToken = default);`,
        "}",
        "",
      );
    }
    for (const template of namespace.templates) {
      const toolEntries = Object.values(template.tools);
      if (toolEntries.length < 2) continue;
      const templateName = template.template.name.text;
      const toolInfoList = toolEntries.map((t) => {
        const tool = t.tool;
        const rawToolName = tool.tool.name.text;
        const interfaceRef = `I${capitalize(rawToolName)}`;
        const paramName = toCSharpName(rawToolName);
        const methodName = toCSharpName(capitalize(rawToolName));
        const { inputType, outputType } = getToolTypes(tool, compilationResult);
        return {
          rawToolName,
          interfaceRef,
          paramName,
          methodName,
          inputType,
          outputType,
        };
      });

      const inherited = toolInfoList.map((t) => t.interfaceRef).join(", ");
      const toolNamesList = toolInfoList
        .map((t) => `'${t.rawToolName}'`)
        .join(", ");
      const callArgs = toolInfoList.map((t) => t.paramName).join(", ");

      lines.push(
        "/// <summary>",
        `/// Composite executor interface for the '${templateName}' prompt template.`,
        `/// Requires implementations for tools: ${toolNamesList}.`,
        "/// </summary>",
        `public interface I${templateName} : ${inherited}`,
        "{",
        "/// <summary>",
        `/// Creates a composite executor for the '${templateName}' prompt template from individual tool implementations.`,
        "/// </summary>",
        `public static I${templateName} Create(`,
        ...toolInfoList.map(
          (t, idx) =>
            `${t.interfaceRef} ${t.paramName}${idx < toolInfoList.length - 1 ? "," : ""}`,
        ),
        `) => new Forwarding(${callArgs});`,
        "",
        `private sealed class Forwarding(`,
        ...toolInfoList.map(
          (t, idx) =>
            `    ${t.interfaceRef} ${t.paramName}${idx < toolInfoList.length - 1 ? "," : ""}`,
        ),
        `) : I${templateName}`,
        "{",
      );

      for (const t of toolInfoList) {
        lines.push(
          `public Task<${t.outputType}> ${t.methodName}(`,
          `${t.inputType} input,`,
          `CancellationToken cancellationToken = default`,
          `) => ${t.paramName}.${t.methodName}(input, cancellationToken);`,
          "",
        );
      }

      lines.push("}", "}", "");
    }
    return lines.join("\n");
  };

  if (singleNamespace) {
    const body = writeNamespaceBody(singleNamespace);
    if (!body.trim()) return "";
    return ["public static class ToolExecutor", "{", body, "}"].join("\n");
  } else {
    const nsSections: string[] = [];
    for (const namespace of Object.values(namespaces)) {
      const body = writeNamespaceBody(namespace);
      if (body.trim()) {
        nsSections.push(
          `public static class ${toCSharpName(namespace.name)}\n{\n${body}\n}`,
        );
      }
    }
    if (nsSections.length <= 0) return "";
    return [
      "public static class ToolExecutor",
      "{",
      nsSections.join("\n\n"),
      "}",
    ].join("\n");
  }
}

function writePromptToolsEnums(
  compilationResult: ValidCompilationResult,
): string {
  if (Object.keys(compilationResult.tools).length <= 0) return "";
  const { singleNamespace, namespaces } = compilationResult;

  const enumClasses: string[] = [];
  const extensionClasses: string[] = [];

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    const templatesWithTools = namespace.templates.filter(
      (t) => Object.keys(t.tools).length > 0,
    );
    if (templatesWithTools.length <= 0) return;

    const nsEnumLines: string[] = [];
    const nsPrefix = singleNamespace ? "" : `${toCSharpName(namespace.name)}.`;
    const extensionPrefix = singleNamespace
      ? ""
      : `${toCSharpName(namespace.name)}_`;

    for (const template of namespace.templates) {
      const toolEntries = Object.values(template.tools);
      if (toolEntries.length <= 0) continue;
      const rawTemplateName = template.template.name.text;
      const enumName = toCSharpName(rawTemplateName);
      const extensionClassName = `${extensionPrefix}${rawTemplateName}_Extensions`;
      const fullEnumRef = `PromptTools.${nsPrefix}${enumName}`;

      nsEnumLines.push(
        "/// <summary>",
        `/// Tools available for the '${rawTemplateName}' prompt template.`,
        "/// </summary>",
        `public enum ${enumName}`,
        "{",
      );

      for (const t of toolEntries) {
        const rawToolName = t.tool.tool.name.text;
        const memberName = toCSharpName(capitalize(rawToolName));
        nsEnumLines.push(`${memberName},`);
      }

      nsEnumLines.push("}", "");

      extensionClasses.push(
        [
          `public static class ${extensionClassName}`,
          "{",
          `public static string GetToolName(this ${fullEnumRef} tool)`,
          "{",
          "return tool switch",
          "{",
          ...toolEntries.map((t) => {
            const rawToolName = t.tool.tool.name.text;
            const memberName = toCSharpName(capitalize(rawToolName));
            return `${fullEnumRef}.${memberName} => "${rawToolName}",`;
          }),
          "_ => throw new ArgumentOutOfRangeException(nameof(tool)),",
          "};",
          "}",
          "}",
        ].join("\n"),
      );
    }

    if (nsEnumLines.length > 0) {
      if (singleNamespace) {
        enumClasses.push(nsEnumLines.join("\n"));
      } else {
        enumClasses.push(
          `public static class ${toCSharpName(namespace.name)}\n{\n${nsEnumLines.join("\n")}\n}`,
        );
      }
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace);
  } else {
    for (const namespace of Object.values(namespaces)) {
      writeNamespace(namespace);
    }
  }

  if (enumClasses.length <= 0) return "";

  const promptToolsClass = [
    "public static class PromptTools",
    "{",
    enumClasses.join("\n\n"),
    "}",
  ].join("\n");

  return [promptToolsClass, ...extensionClasses].join("\n\n");
}

function getTemplateTypes(
  template: ValidTemplate,
  compilationResult: ValidCompilationResult,
): { readonly inputType: string; readonly outputType: string } {
  const { singleNamespace } = compilationResult;
  const templateName = toCSharpName(template.template.name.text);
  const templateNamespace =
    template.template.namespace?.text ?? DEFAULT_NAMESPACE;
  const schemaNamespaceBase = singleNamespace
    ? "Schema."
    : `Schema.${toCSharpName(templateNamespace)}.`;
  const sharedNamespace = schemaNamespaceBase.concat("Shared");

  const templateNamespacePath = schemaNamespaceBase.concat(templateName);
  const options: WriteSchemaOptions = {
    namespace: templateNamespacePath,
    sharedNamespace,
    topLevel: true,
  };

  const inputType = writeType(
    { kind: "type-name", name: { text: "Input" } },
    template.schema,
    options,
  );
  const outputType = writeType(
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
  const [firstToolEntry] = toolEntries;
  if (toolEntries.length === 1 && firstToolEntry) {
    const tool = firstToolEntry.tool;
    const toolName = tool.tool.name.text;
    const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
    const namespaceBase = singleNamespace
      ? "ToolExecutor"
      : `ToolExecutor.${toCSharpName(toolNamespace)}`;
    return `${namespaceBase}.I${capitalize(toolName)}`;
  } else {
    const templateName = template.template.name.text;
    const templateNamespace =
      template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const namespaceBase = singleNamespace
      ? "ToolExecutor"
      : `ToolExecutor.${toCSharpName(templateNamespace)}`;
    return `${namespaceBase}.I${templateName}`;
  }
}

function writePromptsClass(compilationResult: ValidCompilationResult): string {
  const { singleNamespace, namespaces } = compilationResult;
  const lines = [
    "/// <summary>",
    "/// Entry point for building prompts.",
    "/// </summary>",
  ];

  const writeTemplateRenderMethods = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const methodLines: string[] = [];
    const templateCount = namespace.templates.length;
    for (let i = 0; i < templateCount; i++) {
      const t = namespace.templates[i]!;
      const { inputType, outputType } = getTemplateTypes(t, compilationResult);
      const methodName = "Render".concat(capitalize(t.template.name.text));
      const templateId = getId(t.template);
      let toolExecutorRef: string;
      if (Object.keys(t.tools).length <= 0) {
        toolExecutorRef = "NoTools";
      } else {
        toolExecutorRef = getToolExecutorRef(t, compilationResult);
      }
      methodLines.push(
        `// Defined in '${t.template.sourcePath}'`,
        `public Prompt<${outputType}, ${toolExecutorRef}> ${methodName}(${inputType} input)`,
        "{",
        `return _renderer.Render<${inputType}, ${outputType}, ${toolExecutorRef}>("${templateId}", input);`,
        "}",
        "",
      );
    }
    return methodLines;
  };

  if (singleNamespace) {
    lines.push("public sealed class Prompts", "{");
    lines.push(
      "public static Prompts Default { get; } = new(new SpecRenderer(RuntimeData.TemplatesData));",
      "",
      "private readonly IRenderer _renderer;",
      "",
      "internal Prompts(IRenderer renderer)",
      "{",
      "_renderer = renderer;",
    );
    if (singleNamespace.templates.length <= 0) {
      lines.push("_ = _renderer;");
    }
    lines.push("}");
    const renderMethods = writeTemplateRenderMethods(singleNamespace);
    if (renderMethods.length > 0) {
      lines.push("", ...renderMethods);
    }
    lines.push("}");
  } else {
    const nsList = Object.values(namespaces);
    lines.push("public sealed class Prompts", "{");
    lines.push(
      "public static Prompts Default { get; } = new(new SpecRenderer(RuntimeData.TemplatesData));",
      "",
    );
    for (const ns of nsList) {
      const namespaceClassName = ns.name.concat("Prompts");
      const propertyName = toCSharpName(ns.name);
      lines.push(`public ${namespaceClassName} ${propertyName} { get; }`);
    }
    lines.push("", "internal Prompts(IRenderer renderer)", "{");
    for (const ns of nsList) {
      const namespaceClassName = ns.name.concat("Prompts");
      const propertyName = toCSharpName(ns.name);
      lines.push(`${propertyName} = new ${namespaceClassName}(renderer);`);
    }
    lines.push("}");

    for (const namespace of nsList) {
      const namespaceClassName = namespace.name.concat("Prompts");
      lines.push(
        "",
        "/// <summary>",
        `/// Prompts in the '${namespace.name}' namespace.`,
        "/// </summary>",
        `public sealed class ${namespaceClassName}`,
        "{",
        "private readonly IRenderer _renderer;",
        "",
        `internal ${namespaceClassName}(IRenderer renderer)`,
        "{",
        "_renderer = renderer;",
      );
      if (namespace.templates.length <= 0) {
        lines.push("_ = _renderer;");
      }
      lines.push("}");
      const renderMethods = writeTemplateRenderMethods(namespace);
      if (renderMethods.length > 0) {
        lines.push("", ...renderMethods);
      }
      lines.push("}");
    }
    lines.push("}");
  }

  return lines.join("\n");
}

function getMetaType(compilationResult: ValidCompilationResult): string {
  const { metaSchema } = compilationResult;
  if (metaSchema.namingHints.defaultScope.size <= 0) {
    return "Never?";
  }
  return writeType(
    {
      kind: "type-name",
      name: { text: "Meta" },
    },
    metaSchema,
    {
      topLevel: true,
      namespace: "Schema",
    },
  );
}

function writePublicTypes(compilationResult: ValidCompilationResult): string {
  const metaType = getMetaType(compilationResult);
  return STATIC_SNIPPETS["csharp-public-types"].replace(
    /Meta Meta,/g,
    `${metaType} Meta,`,
  );
}

function writeUserDefinedDatatypes(
  compilationResult: ValidCompilationResult,
  unionContext: UnionContext,
): string {
  const { metaSchema, namespaces, singleNamespace } = compilationResult;
  const anyTypes = (schema: Schema): boolean =>
    Object.keys(schema.typeDeclarations).length >= 1;

  const schemaInnerLines: string[] = [];
  const extensionsInnerLines: string[] = [];

  // Meta types
  if (anyTypes(metaSchema)) {
    const { code, extensionsCode } = writeSchemaTypes(
      metaSchema,
      unionContext,
      {
        namespace: "Schema",
      },
    );
    if (code.trim()) {
      schemaInnerLines.push(code);
    }
    if (extensionsCode.trim()) {
      extensionsInnerLines.push(extensionsCode);
    }
  }

  if (singleNamespace) {
    const sharedNamespace = "Schema.Shared";
    if (anyTypes(singleNamespace.schema)) {
      const { code, extensionsCode } = writeSchemaTypes(
        singleNamespace.schema,
        unionContext,
        {
          namespace: sharedNamespace,
        },
      );
      if (code.trim()) {
        schemaInnerLines.push(
          ["public static class Shared", "{", code, "}"].join("\n"),
        );
      }
      if (extensionsCode.trim()) {
        extensionsInnerLines.push(extensionsCode);
      }
    }
    for (const template of singleNamespace.templates) {
      const templateName = toCSharpName(template.template.name.text);
      const { code, extensionsCode } = writeSchemaTypes(
        template.schema,
        unionContext,
        {
          namespace: `Schema.${templateName}`,
          sharedNamespace,
        },
      );
      if (code.trim()) {
        schemaInnerLines.push(
          [`public static class ${templateName}`, "{", code, "}"].join("\n"),
        );
      }
      if (extensionsCode.trim()) {
        extensionsInnerLines.push(extensionsCode);
      }
    }
    for (const tool of Object.values(singleNamespace.tools)) {
      const toolName = toCSharpName(capitalize(tool.tool.name.text));
      const { code, extensionsCode } = writeSchemaTypes(
        tool.schema,
        unionContext,
        {
          namespace: `Schema.${toolName}`,
          sharedNamespace,
        },
      );
      if (code.trim()) {
        schemaInnerLines.push(
          [`public static class ${toolName}`, "{", code, "}"].join("\n"),
        );
      }
      if (extensionsCode.trim()) {
        extensionsInnerLines.push(extensionsCode);
      }
    }
  } else {
    for (const namespace of Object.values(namespaces)) {
      const nsName = toCSharpName(namespace.name);
      const namespaceBase = `Schema.${nsName}.`;
      const sharedNamespace = namespaceBase.concat("Shared");
      const nsInnerLines: string[] = [];

      if (anyTypes(namespace.schema)) {
        const { code, extensionsCode } = writeSchemaTypes(
          namespace.schema,
          unionContext,
          {
            namespace: sharedNamespace,
          },
        );
        if (code.trim()) {
          nsInnerLines.push(
            ["public static class Shared", "{", code, "}"].join("\n"),
          );
        }
        if (extensionsCode.trim()) {
          extensionsInnerLines.push(extensionsCode);
        }
      }
      for (const template of namespace.templates) {
        const templateName = toCSharpName(template.template.name.text);
        const { code, extensionsCode } = writeSchemaTypes(
          template.schema,
          unionContext,
          {
            namespace: namespaceBase.concat(templateName),
            sharedNamespace,
          },
        );
        if (code.trim()) {
          nsInnerLines.push(
            [`public static class ${templateName}`, "{", code, "}"].join("\n"),
          );
        }
        if (extensionsCode.trim()) {
          extensionsInnerLines.push(extensionsCode);
        }
      }
      for (const tool of Object.values(namespace.tools)) {
        const toolName = toCSharpName(capitalize(tool.tool.name.text));
        const { code, extensionsCode } = writeSchemaTypes(
          tool.schema,
          unionContext,
          {
            namespace: namespaceBase.concat(toolName),
            sharedNamespace,
          },
        );
        if (code.trim()) {
          nsInnerLines.push(
            [`public static class ${toolName}`, "{", code, "}"].join("\n"),
          );
        }
        if (extensionsCode.trim()) {
          extensionsInnerLines.push(extensionsCode);
        }
      }

      if (nsInnerLines.length > 0) {
        schemaInnerLines.push(
          [
            `public static class ${nsName}`,
            "{",
            nsInnerLines.join("\n\n"),
            "}",
          ].join("\n"),
        );
      }
    }
  }

  if (schemaInnerLines.length <= 0) return "";

  const schemaClass = [
    "public static class Schema",
    "{",
    schemaInnerLines.join("\n\n"),
    "}",
  ].join("\n");

  const extensionsClass =
    extensionsInnerLines.length > 0
      ? [
          "public static class SchemaExtensions",
          "{",
          extensionsInnerLines.join("\n\n"),
          "}",
        ].join("\n")
      : "";

  return [schemaClass, extensionsClass].filter(Boolean).join("\n\n");
}

function writeSpecDatatypes(unionContext: UnionContext): string {
  const options = {
    namespace: "Spec",
  } as const;
  const { code: specTypesCode } = writeSchemaTypes(
    runtimeTypesSchema,
    unionContext,
    options,
  );
  return ["file static class Spec", "{", specTypesCode, "}"].join("\n");
}

function writeTemplatesData(compilationResult: ValidCompilationResult): string {
  const templatesData = makeTemplates(compilationResult);
  const stringifiedJson = JSON.stringify(JSON.stringify(templatesData));
  const lines = [
    "file static class RuntimeData",
    "{",
    "public static readonly Spec.Templates TemplatesData = JsonSerializer.Deserialize<Spec.Templates>(",
    stringifiedJson,
    ")!;",
    "}",
  ];
  return lines.join("\n");
}

function getToolTypes(
  tool: ValidatedTool,
  compilationResult: ValidCompilationResult,
): { readonly inputType: string; readonly outputType: string } {
  const { singleNamespace } = compilationResult;
  const toolName = tool.tool.name.text;
  const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
  const schemaNamespaceBase = singleNamespace
    ? "Schema."
    : `Schema.${toCSharpName(toolNamespace)}.`;
  const sharedNamespace = schemaNamespaceBase.concat("Shared");

  const toolTypeName = toCSharpName(capitalize(toolName));
  const toolNamespacePath = schemaNamespaceBase.concat(toolTypeName);
  const options: WriteSchemaOptions = {
    namespace: toolNamespacePath,
    sharedNamespace,
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

  return { inputType, outputType };
}

function writeExecuteToolCall(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, tools } = compilationResult;
  const toolList = Object.values(tools);

  const lines = [
    "file static class ToolExecution",
    "{",
    "public static ToolCallResponse MakeToolErrorResponse(string callId, string errorMessage)",
    "{",
    '    var errorJson = JsonSerializer.Serialize(new Dictionary<string, string> { ["error"] = errorMessage });',
    "    return new ToolCallResponse(callId, errorJson, errorMessage);",
    "}",
    "",
    "public static async Task<ToolCallResponse> DispatchToolCall<TInput, TOutput>(",
    "    ToolCall toolCall,",
    "    Func<TInput, Task<TOutput>> execute",
    ")",
    "{",
    "    TInput input;",
    "    try",
    "    {",
    "        input = JsonSerializer.Deserialize<TInput>(toolCall.StringifiedInput)!;",
    "    }",
    "    catch (Exception e)",
    "    {",
    '        return MakeToolErrorResponse(toolCall.CallId, $"Failed to parse tool input: {e.Message}");',
    "    }",
    "    try",
    "    {",
    "        var rawOutput = await execute(input);",
    "        var stringifiedOutput = JsonSerializer.Serialize(rawOutput);",
    "        return new ToolCallResponse(toolCall.CallId, stringifiedOutput);",
    "    }",
    "    catch (OperationCanceledException)",
    "    {",
    "        throw;",
    "    }",
    "    catch (Exception e)",
    "    {",
    "        return MakeToolErrorResponse(toolCall.CallId, e.Message);",
    "    }",
    "}",
    "",
    "public static async Task<ToolCallResponse> ExecuteToolCall(",
    "    ToolCall toolCall,",
    "    string @namespace,",
    "    object executor,",
    "    CancellationToken cancellationToken = default",
    ")",
    "{",
    'switch ($"{@namespace}:{toolCall.ToolName}")',
    "{",
  ];

  for (const tool of toolList) {
    const rawToolName = tool.tool.name.text;
    const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
    const toolId = getId(tool.tool);
    const { inputType, outputType } = getToolTypes(tool, compilationResult);

    const interfaceName = singleNamespace
      ? `ToolExecutor.I${capitalize(rawToolName)}`
      : `ToolExecutor.${toCSharpName(toolNamespace)}.I${capitalize(rawToolName)}`;
    const methodName = toCSharpName(capitalize(rawToolName));

    lines.push(
      `case "${toolId}":`,
      "{",
      `if (executor is ${interfaceName} toolExecutor)`,
      "{",
      `return await DispatchToolCall<${inputType}, ${outputType}>(toolCall, input => toolExecutor.${methodName}(input, cancellationToken));`,
      "}",
      "break;",
      "}",
    );
  }

  lines.push(
    "default:",
    "{",
    "break;",
    "}",
    "}",
    'return MakeToolErrorResponse(toolCall.CallId, $"Tool not found: {toolCall.ToolName}");',
    "}",
    "}  // class ToolExecution",
  );

  return lines.join("\n");
}

function writeMetaParser(compilationResult: ValidCompilationResult): string {
  const metaType = getMetaType(compilationResult);
  if (metaType === "Never?") {
    return [
      "public sealed class Never",
      "{",
      "private Never() { }",
      "}",
      "",
      "file static class MetaParser",
      "{",
      "public static Never? Parse(JsonElement? meta)",
      "{",
      "_ = meta;",
      "return null;",
      "}",
      "}",
    ].join("\n");
  } else {
    return [
      "file static class MetaParser",
      "{",
      `public static ${metaType} Parse(JsonElement? meta)`,
      "{",
      `return JsonSerializer.Deserialize<${metaType}>(meta!.Value)!;`,
      "}",
      "}",
    ].join("\n");
  }
}

type WriteSchemaOptions = {
  readonly topLevel?: true;
  readonly namespace: string;
  readonly sharedNamespace?: string;
};

function writeEnumExtensionMethod(
  fullEnumRef: string,
  members: readonly { readonly value: string }[],
): string {
  const lines: string[] = [
    `public static string GetValue(this ${fullEnumRef} value) => value switch`,
    "{",
    ...members.map(
      (m) =>
        `${fullEnumRef}.${toCSharpName(toPascalCase(m.value))} => "${m.value}",`,
    ),
    "_ => throw new ArgumentOutOfRangeException(nameof(value), value, null),",
    "};",
  ];
  return lines.join("\n");
}

interface SchemaTypesResult {
  readonly code: string;
  readonly extensionsCode: string;
}

function writeSchemaTypes(
  schema: Schema,
  unionContext: UnionContext,
  options: WriteSchemaOptions,
): SchemaTypesResult {
  const lines: string[] = [];
  const extensionLines: string[] = [];
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const name = makeNameFromHint(namingHint);
    let implementations: readonly string[] | undefined;
    if (type.kind === "union") {
      const members = schema.unionToMembers.get(type);
      if (members?.kind === "interfaces") {
        implementations = Object.values(members.members).map((member) =>
          writeType(member.resolved, schema, options),
        );
      } else if (members?.kind === "strings") {
        extensionLines.push(
          writeEnumExtensionMethod(
            `${options.namespace}.${name}`,
            members.members,
          ),
        );
      }
    }
    lines.push(...wrapXmlDoc(namingHint.doc, implementations));
    switch (type.kind) {
      case "interface": {
        lines.push(
          writeTypepromptInterface(type, name, schema, options, unionContext),
        );
        break;
      }
      case "union": {
        lines.push(writeTypepromptUnion(type, name, schema, options));
        break;
      }
    }
    lines.push("");
  }

  return {
    code: lines.join("\n"),
    extensionsCode: extensionLines.join("\n\n"),
  };
}

function writeTypepromptInterface(
  type: Interface,
  typeName: string,
  schema: Schema,
  options: WriteSchemaOptions,
  unionContext: UnionContext,
): string {
  const fields = Object.values(type.fields);

  const interfaces = unionContext.intMemberToUnionRefs.get(type);
  const implementsClause = interfaces
    ? " : ".concat(
        interfaces
          .map((i) =>
            i.startsWith(options.namespace.concat("."))
              ? i.slice(options.namespace.length + 1)
              : i,
          )
          .join(", "),
      )
    : "";

  const lines = [`public sealed record ${typeName}${implementsClause}`, "{"];

  for (const field of fields) {
    const { type } = field;
    const fieldType = writeType(type, schema, options);
    const rawFieldName = field.name.text;
    let propertyName = toCSharpName(capitalize(rawFieldName));
    if (propertyName === typeName) {
      // In C#, a record (like a class or struct) cannot contain a member—including a
      // field, property, or method—that shares the exact same name as its enclosing
      // type.
      // Just use camelCase for the field name.
      const camelCaseName = toCSharpName(rawFieldName);
      if (unionContext.overrideFields.has(field)) {
        for (const int of interfaces!) {
          lines.push(
            `${fieldType} ${int}.${propertyName} => ${camelCaseName};`,
          );
        }
      }
      propertyName = camelCaseName;
    }
    lines.push(...wrapXmlDoc(field.doc));
    if (isLiteralType(type)) {
      const quotedValue = JSON.stringify(type.value);
      lines.push(
        "[JsonInclude]",
        `[JsonPropertyName("${rawFieldName}")]`,
        `private readonly ${fieldType} ${propertyName} = ${quotedValue};`,
      );
    } else {
      const isOptional = resolveType(type, schema).kind === "optional";
      const required = isOptional ? "" : "required ";
      if (isOptional) {
        lines.push(
          "[JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]",
        );
      }
      lines.push(
        `[JsonPropertyName("${rawFieldName}")]`,
        `public ${required}${fieldType} ${propertyName} { get; init; }`,
      );
    }
  }

  lines.push("}");
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
  switch (members.kind) {
    case "strings": {
      lines.push(
        "[JsonConverter(typeof(JsonStringEnumConverter))]",
        `public enum ${typeName} {\n`,
      );
      for (const member of members.members) {
        const csharpName = toCSharpName(toPascalCase(member.value));
        lines.push(`[JsonStringEnumMemberName("${member.value}")]`);
        lines.push(csharpName.concat(","));
      }
      lines.push("}");
      break;
    }
    case "interfaces": {
      const { discriminator, discriminants } = members;
      lines.push(`[JsonConverter(typeof(${typeName}__Converter))]`);
      lines.push(`public interface ${typeName}`, "{");

      for (const commonField of members.commonFields) {
        const propertyName = toCSharpName(capitalize(commonField.name));
        if (isLiteralType(commonField.type)) continue;
        const type = writeType(commonField.type, schema, options);
        lines.push(
          ...wrapXmlDoc(commonField.doc ?? ""),
          `public ${type} ${propertyName} { get; }`,
        );
      }
      lines.push("}");

      lines.push(
        "",
        `internal sealed class ${typeName}__Converter : JsonConverter<${typeName}>`,
        "{",
        `public override ${typeName}? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {`,
        "using var doc = JsonDocument.ParseValue(ref reader);",
        "var root = doc.RootElement;",
        `if (!root.TryGetProperty("${discriminator}", out var discElem))`,
        "{",
        `throw new JsonException("Missing discriminator property '${discriminator}'");`,
        "}",
      );

      if (discriminants.type === "string") {
        lines.push(
          "var discriminant = discElem.GetString();",
          "return discriminant switch",
          "{",
        );
        for (const [discriminant, member] of Object.entries(members.members)) {
          const type = writeType(member.resolved, schema, options);
          lines.push(
            `"${discriminant}" => JsonSerializer.Deserialize<${type}>(root, options),`,
          );
        }
        lines.push(
          `_ => throw new JsonException($"Unknown discriminant value '{discriminant}'")`,
          "};",
        );
      } else {
        lines.push(
          "var discriminant = discElem.GetBoolean();",
          "return discriminant switch",
          "{",
        );
        for (const [discriminant, member] of Object.entries(members.members)) {
          const type = writeType(member.resolved, schema, options);
          lines.push(
            `${discriminant} => JsonSerializer.Deserialize<${type}>(root, options),`,
          );
        }
        lines.push("};");
      }

      lines.push(
        "}",
        "",
        `public override void Write(Utf8JsonWriter writer, ${typeName} value, JsonSerializerOptions options) {`,
        "JsonSerializer.Serialize(writer, value, value.GetType(), options);",
        "}",
        "}",
      );
      break;
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
      return "JsonElement";
    }
    case "array": {
      const { elementType } = type;
      const writtenElement = writeType(elementType, schema, options);
      return `IReadOnlyList<${writtenElement}>`;
    }
    case "boolean-literal": {
      return "bool";
    }
    case "interface":
    case "union": {
      const { namespace, sharedNamespace, topLevel } = options;
      let namingHint = schema.namingHints.defaultScope.get(type);
      if (namingHint) {
        if (topLevel) {
          return namespace.concat(".", makeNameFromHint(namingHint));
        } else {
          return makeNameFromHint(namingHint!);
        }
      } else {
        namingHint = schema.namingHints.shared.get(type);
        return sharedNamespace!.concat(".", makeNameFromHint(namingHint!));
      }
    }
    case "optional": {
      return writeType(type.innerType, schema, options).concat("?");
    }
    case "primitive": {
      if (type.primitive.text === "integer") {
        return "int";
      } else {
        switch (type.primitive.text) {
          case "boolean":
            return "bool";
          case "string":
            return "string";
          case "number":
            return "double";
          default:
            throw new Error(type.primitive.text satisfies never);
        }
      }
    }
    case "record": {
      return `IReadOnlyDictionary<string, ${writeType(type.valueType, schema, options)}>`;
    }
    case "shared-type-name":
    case "type-name": {
      const resolvedType = resolveType(type, schema);
      return writeType(resolvedType, schema, options);
    }
    case "string-literal": {
      return "string";
    }
  }
}

function makeNameFromHint(hint: NamingHint): string {
  const { namePieces } = hint;
  return namePieces
    .map((piece) => {
      switch (piece.kind) {
        case "type":
          return namePieces.length <= 1 ? toCSharpName(piece.name) : piece.name;
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

type UnionContext = {
  readonly intMemberToUnionRefs: Map<Interface, readonly string[]>;
  readonly intMemberToStringDiscriminant: Map<Interface, string>;
  readonly overrideFields: Set<Field>;
};

function makeUnionContext(
  compilationResult: ValidCompilationResult,
): UnionContext {
  const { singleNamespace } = compilationResult;

  const intMemberToUnionRefs = new Map<Interface, string[]>();
  const intMemberToStringDiscriminant = new Map<Interface, string>();
  const overrideFields = new Set<Field>();

  const processSchema = (schema: Schema, namespace: string): void => {
    for (const [
      type,
      namingHint,
    ] of schema.namingHints.defaultScope.entries()) {
      if (type.kind !== "union") continue;
      const members = schema.unionToMembers.get(type)!;
      if (members.kind !== "interfaces") continue;
      const unionRef = namespace.concat(".", makeNameFromHint(namingHint));
      for (const [discriminant, member] of Object.entries(members.members)) {
        const { resolved } = member;
        const unionRefs = intMemberToUnionRefs.get(resolved) ?? [];
        if (unionRefs.length <= 0) {
          intMemberToUnionRefs.set(resolved, unionRefs);
        }
        unionRefs.push(unionRef);

        if (members.discriminants.type === "string") {
          intMemberToStringDiscriminant.set(resolved, discriminant);
        }

        for (const commonField of members.commonFields) {
          for (const memberField of commonField.memberFields) {
            overrideFields.add(memberField);
          }
        }
      }
    }
  };

  processSchema(compilationResult.metaSchema, "Schema");
  for (const namespace of Object.values(compilationResult.namespaces)) {
    const namespaceBase = singleNamespace
      ? "Schema."
      : `Schema.${toCSharpName(namespace.name)}.`;
    processSchema(namespace.schema, namespaceBase.concat("Shared"));
    for (const template of namespace.templates) {
      const templateName = toCSharpName(template.template.name.text);
      processSchema(template.schema, namespaceBase.concat(templateName));
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = toCSharpName(capitalize(tool.tool.name.text));
      processSchema(tool.schema, namespaceBase.concat(toolName));
    }
  }

  processSchema(runtimeTypesSchema, "Spec");

  return {
    intMemberToUnionRefs,
    intMemberToStringDiscriminant,
    overrideFields,
  };
}

function toCSharpName(name: string): string {
  return CSHARP_HARD_KEYWORDS.has(name)
    ? "@".concat(name)
    : RESERVED_NAMES.has(name)
      ? name.concat("_")
      : name;
}

/**
 * Formats doc text as XML documentation comment lines. Returns an array of strings
 * (one per line) ready to be pushed to this.lines. Returns empty array if doc is empty
 * and no implementations are provided.
 */
function wrapXmlDoc(
  doc: string,
  implementations?: readonly string[],
): readonly string[] {
  if (!doc && (!implementations || implementations.length === 0)) {
    return [];
  }

  const contentLines: string[] = [];
  if (doc) {
    // Split into lines and escape XML special characters
    const escaped = doc
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    contentLines.push(...escaped.split("\n"));
  }

  if (implementations && implementations.length > 0) {
    const uniqueImplementations = [...new Set(implementations)];
    const impls = uniqueImplementations
      .map((i) => `<see cref="${i}"/>`)
      .join(", ");
    if (contentLines.length > 0) {
      contentLines.push("<para>", `Implementations: ${impls}.`, "</para>");
    } else {
      contentLines.push(`Implementations: ${impls}.`);
    }
  }

  return [
    "/// <summary>",
    ...contentLines.map((line) => (line ? `/// ${line}` : "///")),
    "/// </summary>",
  ];
}

function coalesceEmptyLines(code: string): string {
  return (
    code
      // Remove spaces enclosed within curly brackets if that's all there is.
      .replace(/\{\s+\}/g, "{ }")
      // Remove spaces enclosed within round brackets if that's all there is.
      .replace(/\(\s+\)/g, "( )")
      // Remove spaces enclosed within square brackets if that's all there is.
      .replace(/\[\s+\]/g, "[ ]")
      // Remove empty line following an open curly bracket.
      .replace(/(\{\n *)\n/g, "$1")
      // Remove empty line preceding a closed curly bracket.
      .replace(/\n(\n *\})/g, "$1")
      // Coalesce consecutive empty lines.
      .replace(/\n\n\n+/g, "\n\n")
      .replace(/\n*$/g, "\n")
  );
}

const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "IReadOnlyDictionary",
  "IReadOnlyList",
  "JsonConverter",
  "JsonDocument",
  "JsonElement",
  "JsonException",
  "JsonIgnore",
  "JsonIgnoreCondition",
  "JsonInclude",
  "JsonPropertyName",
  "JsonSerializer",
  "JsonSerializerOptions",
  "JsonStringEnumConverter",
  "JsonStringEnumMemberName",
  "Schema",
  "Type",
  "Utf8JsonReader",
  "Utf8JsonWriter",
] as const);

const CSHARP_HARD_KEYWORDS: ReadonlySet<string> = new Set([
  "abstract",
  "as",
  "base",
  "bool",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "checked",
  "class",
  "const",
  "continue",
  "decimal",
  "default",
  "delegate",
  "do",
  "double",
  "else",
  "enum",
  "event",
  "explicit",
  "extern",
  "false",
  "finally",
  "fixed",
  "float",
  "for",
  "foreach",
  "goto",
  "if",
  "implicit",
  "in",
  "int",
  "interface",
  "internal",
  "is",
  "lock",
  "long",
  "namespace",
  "new",
  "null",
  "object",
  "operator",
  "out",
  "override",
  "params",
  "private",
  "protected",
  "public",
  "readonly",
  "ref",
  "return",
  "sbyte",
  "sealed",
  "short",
  "sizeof",
  "stackalloc",
  "static",
  "string",
  "struct",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "uint",
  "ulong",
  "unchecked",
  "unsafe",
  "ushort",
  "using",
  "virtual",
  "void",
  "volatile",
  "while",
]);
