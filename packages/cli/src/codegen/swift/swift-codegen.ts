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
import {
  capitalize,
  toCamelCase,
  toPascalCase,
  uncapitalize,
} from "@typeprompt/core/util/casing.js";
import { runtimeTypesSchema } from "../../runtime/runtime-types-schema.js";
import { makeTemplates } from "../../runtime/spec-maker.js";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import type { OutputFile } from "../codegen-types.js";
import { reformatCFamilyCode } from "../formatters.js";

export function generateSwiftCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const swiftConfig = config.gen?.swift;
  if (!swiftConfig) {
    return [];
  }
  return [
    {
      path: swiftConfig.file,
      content: writeAll(compilationResult, swiftConfig),
    },
  ];
}

function writeAll(
  compilationResult: ValidCompilationResult,
  config: { rootNamespace: string },
): string {
  const { rootNamespace } = config;

  return coalesceEmptyLines(
    [
      STATIC_SNIPPETS["swift-top-level"],
      STATIC_SNIPPETS["swift-imports"],
      `public enum ${rootNamespace} {`,
      reformatCFamilyCode(writePromptsStruct(compilationResult), {
        baseIndent: 1,
      }),
      STATIC_SNIPPETS["swift-public-types"],
      reformatCFamilyCode(
        [
          writeTemplateIdEnum(compilationResult),
          writeToolExecutorProtocols(compilationResult),
          writePromptToolsEnums(compilationResult),
          writeUserDefinedDatatypes(compilationResult),
          writeSpecDatatypes(),
          writeTemplatesData(compilationResult),
          writeExecuteToolCall(compilationResult),
        ].join("\n\n"),
        { baseIndent: 1 },
      ),
      STATIC_SNIPPETS["swift-logic"],
      `}  // enum ${rootNamespace}\n`,
    ].join("\n\n"),
  );
}

function getTemplateTypes(
  template: ValidTemplate,
  compilationResult: ValidCompilationResult,
): { readonly inputType: string; readonly outputType: string } {
  const { singleNamespace } = compilationResult;
  const templateSwiftName = toSwiftName(template.template.name.text);
  const swiftNamespace = toSwiftName(
    template.template.namespace?.text ?? DEFAULT_NAMESPACE,
  );
  const typePrefixBase = singleNamespace
    ? "Schema."
    : `Schema.${swiftNamespace}.`;
  const sharedTypePrefix = typePrefixBase.concat("Shared.");
  const templateTypePrefix = typePrefixBase.concat(templateSwiftName, ".");

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
  if (toolEntries.length <= 0) {
    return "NoTools";
  }
  const traitNames = Array.from(
    new Set(
      toolEntries.map((entry) => {
        const tool = entry.tool;
        const toolSwiftName = toSwiftName(capitalize(tool.tool.name.text));
        const toolSwiftNamespace = toSwiftName(
          tool.tool.namespace?.text ?? DEFAULT_NAMESPACE,
        );
        const namespaceBase = singleNamespace
          ? "ToolExecutor"
          : `ToolExecutor.${toolSwiftNamespace}`;
        return `${namespaceBase}.${toolSwiftName}`;
      }),
    ),
  );
  return `any ${traitNames.join(" & ")}`;
}

function writePromptsStruct(compilationResult: ValidCompilationResult): string {
  const { singleNamespace, namespaces } = compilationResult;

  const writeNamespaceMembers = (
    structName: string,
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const lines: string[] = [
      `public struct ${structName}: Sendable {`,
      "private let _spec: Spec.Templates",
      "",
      "fileprivate init(_ spec: Spec.Templates) {",
      "self._spec = spec",
      "}",
      "",
    ];
    const templateCount = namespace.templates.length;

    for (let i = 0; i < templateCount; i++) {
      const t = namespace.templates[i]!;
      const { inputType, outputType } = getTemplateTypes(t, compilationResult);
      const methodName = "render".concat(capitalize(t.template.name.text));
      const templateId = getId(t.template);
      const toolExecutorRef =
        Object.keys(t.tools).length >= 1
          ? getToolExecutorRef(t, compilationResult)
          : "NoTools";
      const isJsonOutput = (t.template.outputFormat?.text ?? "json") === "json";

      lines.push(`// Defined in '${t.template.sourcePath}'`);
      if (isJsonOutput) {
        lines.push(
          `public func ${methodName}(_ input: ${inputType}) -> Prompt<${outputType}, ${toolExecutorRef}> {`,
          `return doRender(_spec, "${templateId}", input, ${outputType}.self)`,
          "}",
          "",
        );
      } else {
        lines.push(
          `public func ${methodName}(_ input: ${inputType}) -> Prompt<${outputType}, ${toolExecutorRef}> {`,
          `return doRender(_spec, "${templateId}", input)`,
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
      ...writeNamespaceMembers("Prompts", singleNamespace),
      "",
      "/// Entry point for building prompts.",
      "public static let prompts = Prompts(_templatesData)",
    ].join("\n");
  } else {
    const nsList = Object.values(namespaces);
    const lines: string[] = [
      "/// Entry point for building prompts.",
      "public struct Prompts: Sendable {",
      "private let _spec: Spec.Templates",
      "",
      "fileprivate init(_ spec: Spec.Templates) {",
      "self._spec = spec",
      "}",
      "",
    ];
    for (const ns of nsList) {
      const namespaceStructName = ns.name.concat("Prompts");
      const propertyName = toSwiftName(uncapitalize(ns.name));
      lines.push(
        `public var ${propertyName}: ${namespaceStructName} {`,
        `${namespaceStructName}(_spec)`,
        "}",
        "",
      );
    }
    lines.push(
      "}",
      "",
      "/// Entry point for building prompts.",
      "public static let prompts = Prompts(_templatesData)",
    );
    lines.push("");
    for (const namespace of nsList) {
      const namespaceStructName = namespace.name.concat("Prompts");
      lines.push(
        `/// Prompts in the '${namespace.name}' namespace.`,
        ...writeNamespaceMembers(namespaceStructName, namespace),
        "",
      );
    }
    return lines.join("\n");
  }
}

function writeTemplateIdEnum(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, templates } = compilationResult;
  const templateList = Object.values(templates);
  if (templateList.length <= 0) {
    return [
      "/// Uniquely identifies a prompt template.",
      "public enum TemplateId: Sendable, CaseIterable, CustomStringConvertible {",
      "case none",
      "",
      "public var description: String {",
      'return ""',
      "}",
      "}",
    ].join("\n");
  }
  const lines = [
    "/// Uniquely identifies a prompt template.",
    "public enum TemplateId: Sendable, CaseIterable, CustomStringConvertible {",
  ];
  for (const template of templateList) {
    const rawNamespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const rawTemplateName = template.template.name.text;
    const caseName = toSwiftName(
      singleNamespace
        ? uncapitalize(rawTemplateName)
        : `${uncapitalize(rawNamespace)}_${rawTemplateName}`,
    );
    lines.push(`case ${caseName}`);
  }
  lines.push("", "private var id: String {", "switch self {");
  for (const template of Object.values(templates)) {
    const rawNamespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const rawTemplateName = template.template.name.text;
    const caseName = toSwiftName(
      singleNamespace
        ? uncapitalize(rawTemplateName)
        : `${uncapitalize(rawNamespace)}_${rawTemplateName}`,
    );
    const templateId = getId(template.template);
    lines.push(`case .${caseName}:`, `return "${templateId}"`);
  }
  lines.push(
    "}",
    "}",
    "",
    "public var description: String {",
    "return id",
    "}",
    "}",
  );
  return lines.join("\n");
}

function writeToolExecutorProtocols(
  compilationResult: ValidCompilationResult,
): string {
  if (Object.keys(compilationResult.tools).length <= 0) return "";
  const { singleNamespace, namespaces } = compilationResult;

  const writeNamespace = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const lines: string[] = [];
    for (const tool of Object.values(namespace.tools)) {
      const rawToolName = tool.tool.name.text;
      const interfaceName = capitalize(rawToolName);
      const { inputType, outputType } = getToolTypes(tool, compilationResult);

      lines.push(
        `/// Tool executor interface for the '${rawToolName}' tool.`,
        `public protocol ${interfaceName}: Sendable {`,
        `func ${toSwiftName(rawToolName)}(`,
        `input: ${inputType}`,
        `) async throws -> ${outputType}`,
        "}",
        "",
      );
    }
    for (const template of namespace.templates) {
      const toolEntries = Object.values(template.tools);
      if (toolEntries.length < 2) continue;
      const rawTemplateName = template.template.name.text;
      const toolInfoList = toolEntries.map((t) => {
        const tool = t.tool;
        const rawToolName = tool.tool.name.text;
        const interfaceRef = toSwiftName(capitalize(rawToolName));
        const paramName = toSwiftName(rawToolName);
        const methodName = toSwiftName(rawToolName);
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

      const inherited = Array.from(
        new Set(toolInfoList.map((t) => t.interfaceRef)),
      ).join(", ");
      const toolNamesList = toolInfoList
        .map((t) => `'${t.rawToolName}'`)
        .join(", ");

      lines.push(
        `/// Composite tool executor for the '${rawTemplateName}' prompt template.`,
        `/// Forwards to implementations of tools: ${toolNamesList}.`,
        `public struct ${toSwiftName(rawTemplateName)}: ${inherited}, Sendable {`,
        ...toolInfoList.map(
          (t) => `public let ${t.paramName}: any ${t.interfaceRef}`,
        ),
        "",
        "public init(",
        ...toolInfoList.map((t) => `${t.paramName}: any ${t.interfaceRef},`),
        ") {",
        ...toolInfoList.map((t) => `self.${t.paramName} = ${t.paramName}`),
        "}",
        "",
      );

      for (const t of toolInfoList) {
        lines.push(
          `public func ${t.methodName}(`,
          `input: ${t.inputType}`,
          `) async throws -> ${t.outputType} {`,
          `try await ${t.paramName}.${t.methodName}(input: input)`,
          "}",
          "",
        );
      }

      lines.push("}", "");
    }
    return lines;
  };

  const lines = [
    "/// Namespace containing tool executor protocols.",
    "public enum ToolExecutor {",
  ];
  if (singleNamespace) {
    lines.push(...writeNamespace(singleNamespace));
  } else {
    for (const namespace of Object.values(namespaces)) {
      if (Object.keys(namespace.tools).length <= 0) continue;
      const swiftNamespace = toSwiftName(namespace.name);
      lines.push(`public enum ${swiftNamespace} {`);
      lines.push(...writeNamespace(namespace));
      lines.push(`}  // enum ${swiftNamespace}`, "");
    }
  }
  lines.push("}  // enum ToolExecutor");
  return lines.join("\n");
}

function writePromptToolsEnums(
  compilationResult: ValidCompilationResult,
): string {
  if (Object.keys(compilationResult.tools).length <= 0) return "";
  const { singleNamespace, namespaces } = compilationResult;

  const writeNamespace = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const lines: string[] = [];
    for (const template of namespace.templates) {
      const toolEntries = Object.values(template.tools);
      if (toolEntries.length <= 0) continue;
      const rawTemplateName = template.template.name.text;
      const enumName = toSwiftName(rawTemplateName);

      lines.push(
        "/// Tools available for the '" +
          rawTemplateName +
          "' prompt template.",
        `public enum ${enumName}: Sendable, CaseIterable, CustomStringConvertible {`,
      );

      for (const t of toolEntries) {
        const rawToolName = t.tool.tool.name.text;
        const caseName = toSwiftName(toCamelCase(rawToolName));
        lines.push(`case ${caseName}`);
      }

      lines.push("", "public var toolName: String {", "switch self {");

      for (const t of toolEntries) {
        const rawToolName = t.tool.tool.name.text;
        const caseName = toSwiftName(toCamelCase(rawToolName));
        lines.push(`case .${caseName}:`, `return "${rawToolName}"`);
      }

      lines.push(
        "}",
        "}",
        "",
        "public var description: String {",
        "return toolName",
        "}",
        "}",
        "",
      );
    }
    return lines;
  };

  const lines = [
    "/// Namespace containing tools available for prompt templates.",
    "public enum PromptTools {",
  ];
  if (singleNamespace) {
    lines.push(...writeNamespace(singleNamespace));
  } else {
    for (const namespace of Object.values(namespaces)) {
      const templatesWithTools = namespace.templates.filter(
        (t) => Object.keys(t.tools).length > 0,
      );
      if (templatesWithTools.length <= 0) continue;
      const swiftNamespace = toSwiftName(namespace.name);
      lines.push(`public enum ${swiftNamespace} {`);
      lines.push(...writeNamespace(namespace));
      lines.push(`}  // enum ${swiftNamespace}`, "");
    }
  }
  lines.push("}  // enum PromptTools");
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
          typePrefix: "Schema.Meta.",
        },
      )
    : "Never?";
  lines.push(
    "/// Metadata associated with a prompt.",
    `public typealias Meta = ${metaType}`,
    "",
  );
  if (anyTypes(metaSchema)) {
    lines.push(
      "fileprivate static func parseMeta(_ meta: Any?) -> Meta {",
      "guard let meta = meta,",
      "let data = try? Foundation.JSONEncoder().encode(AnyEncodableValue(meta)),",
      "let decoded = try? Foundation.JSONDecoder().decode(Meta.self, from: data) else {",
      'fatalError("Failed to parse metadata")',
      "}",
      "return decoded",
      "}",
      "",
    );
  } else {
    lines.push(
      "fileprivate static func parseMeta(_ meta: Any?) -> Meta {",
      "return nil",
      "}",
      "",
    );
  }

  lines.push(
    "/// Namespace containing the user-defined datatypes.",
    "public enum Schema {",
  );
  if (anyTypes(metaSchema)) {
    lines.push(
      "public enum Meta {",
      writeSchema(metaSchema, {
        typePrefix: "Schema.Meta.",
      }),
      "}\n",
    );
  }

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    const swiftNamespace = toSwiftName(namespace.name);
    const typePrefixBase = singleNamespace
      ? "Schema."
      : `Schema.${swiftNamespace}.`;
    const sharedTypePrefix = "Schema.Shared.";
    if (anyTypes(namespace.schema)) {
      lines.push("public enum Shared {");
      lines.push(
        writeSchema(namespace.schema, {
          typePrefix: sharedTypePrefix,
        }),
      );
      lines.push("}  // enum Shared", "");
    }
    for (const template of namespace.templates) {
      const templateSwiftName = toSwiftName(template.template.name.text);
      const typePrefix = typePrefixBase.concat(templateSwiftName, ".");
      lines.push(`public enum ${templateSwiftName} {`);
      lines.push(
        writeSchema(template.schema, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
      lines.push(`}  // enum ${templateSwiftName}`, "");
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolSwiftName = toSwiftName(capitalize(tool.tool.name.text));
      const typePrefix = typePrefixBase.concat(toolSwiftName, ".");
      lines.push(`public enum ${toolSwiftName} {\n`);
      lines.push(
        writeSchema(tool.schema, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
      lines.push(`}  // enum ${toolSwiftName}`, "");
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace);
  } else {
    for (const namespace of Object.values(namespaces)) {
      const swiftNamespace = toSwiftName(namespace.name);
      lines.push(`public enum ${swiftNamespace} {`);
      writeNamespace(namespace);
      lines.push("}\n");
    }
  }
  lines.push("}  // enum Schema", "");
  return lines.join("\n");
}

function writeSpecDatatypes(): string {
  const options = {
    typePrefix: "Spec.",
  } as const;
  const lines = [
    "fileprivate enum Spec {",
    writeSchema(runtimeTypesSchema, options),
    "}  // enum Spec",
  ];
  return lines.join("\n");
}

function addKeysMetadata(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map(addKeysMetadata);
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const keys = Object.keys(obj);
    const result: Record<string, unknown> = {
      __keys__: keys,
    };
    for (const k of keys) {
      result[k] = addKeysMetadata(obj[k]);
    }
    return result;
  }
  return val;
}

function addKeysToExamples(templatesData: unknown): unknown {
  const clone = JSON.parse(JSON.stringify(templatesData));
  if (clone && typeof clone === "object" && clone.templates) {
    for (const tmpl of Object.values(clone.templates as Record<string, any>)) {
      if (tmpl.contents) {
        if (
          tmpl.contents.kind === "no-variants" &&
          tmpl.contents.content?.examples
        ) {
          for (const ex of tmpl.contents.content.examples) {
            if (ex.input) {
              ex.input = addKeysMetadata(ex.input);
            }
          }
        } else if (
          tmpl.contents.kind === "variants" &&
          tmpl.contents.variants
        ) {
          for (const v of Object.values(
            tmpl.contents.variants as Record<string, any>,
          )) {
            if (v.examples) {
              for (const ex of v.examples) {
                if (ex.input) {
                  ex.input = addKeysMetadata(ex.input);
                }
              }
            }
          }
        }
        if (tmpl.contents.defaultContent?.examples) {
          for (const ex of tmpl.contents.defaultContent.examples) {
            if (ex.input) {
              ex.input = addKeysMetadata(ex.input);
            }
          }
        }
      }
    }
  }
  return clone;
}

function writeTemplatesData(compilationResult: ValidCompilationResult): string {
  const templatesData = makeTemplates(compilationResult);
  const dataWithKeys = addKeysToExamples(templatesData);
  const stringifiedJson = JSON.stringify(JSON.stringify(dataWithKeys));
  const lines = [
    "private static let _templatesData: Spec.Templates = try! Foundation.JSONDecoder().decode(",
    "Spec.Templates.self,",
    `from: Foundation.Data(${stringifiedJson}.utf8)`,
    ")",
  ];
  return lines.join("\n");
}

function getToolTypes(
  tool: ValidatedTool,
  compilationResult: ValidCompilationResult,
): { readonly inputType: string; readonly outputType: string } {
  const { singleNamespace } = compilationResult;
  const rawToolName = tool.tool.name.text;
  const toolSwiftNamespace = toSwiftName(
    tool.tool.namespace?.text ?? DEFAULT_NAMESPACE,
  );
  const typePrefixBase = singleNamespace
    ? "Schema."
    : `Schema.${toolSwiftNamespace}.`;
  const sharedTypePrefix = typePrefixBase.concat("Shared.");

  const toolTypeName = toSwiftName(capitalize(rawToolName));
  const toolTypePrefix = typePrefixBase.concat(toolTypeName, ".");
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

  return { inputType, outputType };
}

function writeExecuteToolCall(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, tools } = compilationResult;
  const toolList = Object.values(tools);

  const lines = [
    "fileprivate static func executeToolCall(",
    "toolCall: ToolCall,",
    "namespace: String,",
    "executor: any Any,",
    ") async -> ToolCallResponse {",
  ];

  if (toolList.length === 0) {
    lines.push(
      'return makeToolErrorResponse(callId: toolCall.callId, errorMessage: "Tool not found: \\(toolCall.toolName)")',
      "}",
    );
    return lines.join("\n");
  }

  lines.push('switch "\\(namespace):\\(toolCall.toolName)" {');

  for (const tool of toolList) {
    const rawToolName = tool.tool.name.text;
    const toolSwiftName = toSwiftName(capitalize(rawToolName));
    const toolSwiftNamespace = toSwiftName(
      tool.tool.namespace?.text ?? DEFAULT_NAMESPACE,
    );
    const toolId = getId(tool.tool);

    const interfaceName = singleNamespace
      ? `ToolExecutor.${toolSwiftName}`
      : `ToolExecutor.${toolSwiftNamespace}.${capitalize(rawToolName)}`;

    const methodName = toSwiftName(rawToolName);

    lines.push(
      `case "${toolId}":`,
      `if let toolExecutor = executor as? ${interfaceName} {`,
      `return await dispatchToolCall(toolCall: toolCall) { try await toolExecutor.${methodName}(input: $0) }`,
      "}",
    );
  }

  lines.push(
    "default:",
    "break",
    "}",
    'return makeToolErrorResponse(callId: toolCall.callId, errorMessage: "Tool not found: \\(toolCall.toolName)")',
    "}",
  );

  return lines.join("\n");
}

type WriteSchemaOptions = {
  readonly topLevel?: true;
  readonly typePrefix: string;
  readonly sharedTypePrefix?: string;
};

function writeSchema(schema: Schema, options: WriteSchemaOptions): string {
  const { typePrefix } = options;
  const lines: string[] = [];
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const name = makeNameFromHint(namingHint);
    if (typePrefix !== "Spec.") {
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
  lines.push(`public struct ${typeName} : Codable, Sendable {`);

  for (const field of fields) {
    const { type } = field;
    const swiftName = toSwiftName(field.name.text);
    const fieldType = writeType(type, schema, options);
    lines.push(...commentify(field.doc));
    lines.push(`public let ${swiftName}: ${fieldType}`);
  }

  lines.push("", "public init(");
  for (const field of fields) {
    const { type } = field;
    if (isLiteralType(type)) continue;
    const swiftName = toSwiftName(field.name.text);
    const fieldType = writeType(type, schema, options);
    const defaultVal = type.kind === "optional" ? " = nil" : "";
    lines.push(`${swiftName}: ${fieldType}${defaultVal},`);
  }
  lines.push(") {");
  for (const field of fields) {
    const swiftName = toSwiftName(field.name.text);
    const { type } = field;
    if (isLiteralType(type)) {
      lines.push(`self.${swiftName} = ${JSON.stringify(type.value)}`);
    } else {
      lines.push(`self.${swiftName} = ${swiftName}`);
    }
  }
  lines.push("}", "}");
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
      lines.push(`public enum ${typeName} : String, Codable, Sendable {\n`);
      for (const member of members.members) {
        const swiftName = toSwiftName(toCamelCase(member.value));
        lines.push(`case ${swiftName} = ${JSON.stringify(member.value)}`);
      }
      lines.push("}");
      break;
    }
    case "interfaces": {
      const { discriminants, discriminator } = members;
      const indirect = Object.values(members.members).some((m) => m.isRecursive)
        ? "indirect "
        : "";
      lines.push(`${indirect}public enum ${typeName} : Codable, Sendable {`);
      const caseEntries = Object.values(members.members).map((member) => {
        const { discriminant } = member;
        const caseName = toSwiftName(
          ((): string => {
            switch (discriminant.kind) {
              case "string-literal":
                return discriminator.concat(toPascalCase(discriminant.value));
              case "boolean-literal":
                return discriminant.value
                  ? discriminator
                  : "not".concat(capitalize(discriminator));
            }
          })(),
        );
        const type = writeType(member.resolved, schema, options);
        const quotedDiscriminant = JSON.stringify(discriminant.value);
        return { quotedDiscriminant, caseName, type };
      });

      for (const { caseName, type } of caseEntries) {
        lines.push(`case ${caseName}(${type})`);
      }

      for (const commonField of members.commonFields) {
        if (isLiteralType(commonField.type)) continue;
        const name = toSwiftName(commonField.name);
        const type = writeType(commonField.type, schema, options);
        lines.push("");
        lines.push(
          ...commentify(commonField.doc ?? ""),
          `public var ${name}: ${type} {`,
          "switch self {",
        );
        for (const { caseName } of caseEntries) {
          lines.push(`case .${caseName}(let value):`, `return value.${name}`);
        }
        lines.push("}", "}");
      }

      lines.push(
        "",
        "public func encode(to encoder: any Encoder) throws {",
        "var container = encoder.singleValueContainer()",
        "switch self {",
      );
      for (const { caseName } of caseEntries) {
        lines.push(
          `case .${caseName}(let value):`,
          "try container.encode(value)",
        );
      }
      lines.push("}", "}");

      lines.push(
        "",
        "private enum DiscriminatorCodingKeys: String, CodingKey {",
        `case discriminator = "${discriminator}"`,
        "}",
        "",
        "public init(from decoder: any Decoder) throws {",
        "let container = try decoder.container(keyedBy: DiscriminatorCodingKeys.self)",
      );

      if (discriminants.type === "string") {
        lines.push(
          "let discriminator = try container.decode(String.self, forKey: .discriminator)",
          "switch discriminator {",
        );
        for (const { quotedDiscriminant, caseName, type } of caseEntries) {
          lines.push(
            `case ${quotedDiscriminant}:`,
            `self = .${caseName}(try ${type}(from: decoder))`,
          );
        }
        lines.push(
          "default:",
          "throw DecodingError.dataCorrupted(",
          "DecodingError.Context(",
          "codingPath: decoder.codingPath,",
          'debugDescription: "Unknown discriminator: \\(discriminator)"',
          ")",
          ")",
          "}",
        );
      } else {
        lines.push(
          "let discriminator = try container.decode(Bool.self, forKey: .discriminator)",
          "switch discriminator {",
        );
        for (const { quotedDiscriminant, caseName, type } of caseEntries) {
          lines.push(
            `case ${quotedDiscriminant}:`,
            `self = .${caseName}(try ${type}(from: decoder))`,
          );
        }
        lines.push("}"); // switch
      }
      lines.push("}");
      lines.push("}");
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
      return `[${writtenElement}]`;
    }
    case "boolean-literal": {
      return "Bool";
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
          return "Shared.".concat(makeNameFromHint(namingHint!));
        }
      }
    }
    case "optional": {
      return writeType(type.innerType, schema, options).concat("?");
    }
    case "primitive": {
      if (type.primitive.text === "integer") {
        return "Int32";
      } else {
        switch (type.primitive.text) {
          case "boolean":
            return "Bool";
          case "string":
            return "String";
          case "number":
            return "Double";
          default:
            throw new Error(type.primitive.text satisfies never);
        }
      }
    }
    case "record": {
      return `[String: ${writeType(type.valueType, schema, options)}]`;
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
          return namePieces.length <= 1 ? toSwiftName(piece.name) : piece.name;
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

function toSwiftName(name: string): string {
  return RESERVED_NAMES.has(name)
    ? name.concat("_")
    : SWIFT_HARD_KEYWORDS.has(name)
      ? `\`${name}\``
      : name;
}

function commentify(doc: string): readonly string[] {
  if (!doc) return [];
  const lines = doc.split("\n");
  return lines.map((l) => (l ? `/// ${l}` : "///"));
}

function coalesceEmptyLines(code: string): string {
  return (
    code
      // Remove spaces enclosed within curly brackets if that's all there is.
      .replace(/\{\s+\}/g, "{}")
      // Remove spaces enclosed within round brackets if that's all there is.
      .replace(/\(\s+\)/g, "()")
      // Remove spaces enclosed within square brackets if that's all there is.
      .replace(/\[\s+\]/g, "[]")
      // Remove empty line following an open curly bracket.
      .replace(/(\{\n *)\n/g, "$1")
      // Remove empty line preceding a closed curly bracket.
      .replace(/\n(\n *\})/g, "$1") // 1/2
      .replace(/\n(\n *\})/g, "$1") // 2/2
      // Coalesce consecutive empty lines.
      .replace(/\n\n\n+/g, "\n\n")
      .replace(/\n*$/g, "\n")
  );
}

const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "Bool",
  "Codable",
  "Decoder",
  "DecodingError",
  "Double",
  "Int32",
  "JsonElement",
  "Shared",
  "String",
  "ToolExecutor",
  "self",
] as const);

const SWIFT_HARD_KEYWORDS: ReadonlySet<string> = new Set([
  // Keywords used in declarations.
  "associatedtype",
  "class",
  "deinit",
  "enum",
  "extension",
  "fileprivate",
  "func",
  "import",
  "init",
  "inout",
  "internal",
  "let",
  "open",
  "operator",
  "private",
  "protocol",
  "public",
  "rethrows",
  "static",
  "struct",
  "subscript",
  "typealias",
  "var",

  // Keywords used in statements.
  "break",
  "case",
  "continue",
  "default",
  "defer",
  "do",
  "else",
  "fallthrough",
  "for",
  "guard",
  "if",
  "in",
  "repeat",
  "return",
  "switch",
  "where",
  "while",

  // Keywords used in expressions and types.
  "Any",
  "as",
  "catch",
  "false",
  "is",
  "nil",
  "Self",
  "self",
  "super",
  "throw",
  "throws",
  "true",
  "try",

  // Contextual / special-purpose keywords that commonly conflict with identifiers.
  "actor",
  "any",
  "associativity",
  "async",
  "await",
  "borrowing",
  "convenience",
  "consuming",
  "didSet",
  "distributed",
  "dynamic",
  "final",
  "get",
  "indirect",
  "infix",
  "isolated",
  "lazy",
  "left",
  "mutating",
  "none",
  "nonmutating",
  "optional",
  "override",
  "package",
  "postfix",
  "precedence",
  "prefix",
  "Protocol",
  "required",
  "right",
  "set",
  "some",
  "Type",
  "unowned",
  "weak",
  "willSet",
]);
