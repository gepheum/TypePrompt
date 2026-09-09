import type {
  ValidCompilationResult,
  ValidNamespaceResult,
  ValidTemplate,
  ValidatedTool,
} from "../../compiler/compiler-types.js";
import { DEFAULT_NAMESPACE } from "../../compiler/default-namespace.js";
import { getId } from "../../compiler/ids.js";
import type { Config } from "../../config/config-parser.js";
import { runtimeTypesSchema } from "../../runtime/runtime-types-schema.js";
import { makeTemplates } from "../../runtime/spec-maker.js";
import type {
  FieldType,
  Interface,
  NamingHint,
  Schema,
  TypeNameView,
  Union,
} from "../../schema/schema-types.js";
import { isLiteralType } from "../../schema/schema-utils.js";
import { resolveType } from "../../schema/type-resolver.js";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import {
  capitalize,
  toCamelCase,
  toPascalCase,
  uncapitalize,
} from "../../util/casing.js";
import type { OutputFile } from "../codegen-types.js";

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
    reformat(
      [
        STATIC_SNIPPETS["swift-imports"],
        `enum ${rootNamespace} {`,
        writePromptsStruct(compilationResult),
        STATIC_SNIPPETS["swift-public-types"],
        writeTemplateIdEnum(compilationResult),
        writeToolExecutorProtocols(compilationResult, config),
        writeUserDefinedDatatypes(compilationResult, config),
        writeSpecDatatypes(),
        writeTemplatesData(compilationResult),
        writeExecuteToolCall(compilationResult, config),
        STATIC_SNIPPETS["swift-logic"],
        "}",
      ].join("\n\n"),
    ),
  ).concat("\n");
}

function getTemplateTypes(
  template: ValidTemplate,
  compilationResult: ValidCompilationResult,
): { readonly inputType: string; readonly outputType: string } {
  const { singleNamespace } = compilationResult;
  const templateName = toSwiftName(template.template.name.text);
  const templateNamespace =
    template.template.namespace?.text ?? DEFAULT_NAMESPACE;
  const namespaceName = toSwiftName(templateNamespace);
  const typePrefixBase = singleNamespace
    ? "Schema."
    : `Schema.${namespaceName}.`;
  const sharedTypePrefix = typePrefixBase.concat("Shared.");
  const templateTypePrefix = typePrefixBase.concat(templateName, ".");

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
    return "Void";
  }
  const traitNames = Array.from(
    new Set(
      toolEntries.map((entry) => {
        const tool = entry.tool;
        const toolName = capitalize(tool.tool.name.text);
        const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
        const namespaceBase = singleNamespace
          ? "ToolExecutor"
          : `ToolExecutor.${toSwiftName(toolNamespace)}`;
        return `${namespaceBase}.${toolName}`;
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
    const lines: string[] = [`public struct ${structName}: Sendable {`];
    const templateCount = namespace.templates.length;
    const templateProps: { readonly name: string; readonly type: string }[] =
      [];

    for (let i = 0; i < templateCount; i++) {
      const t = namespace.templates[i]!;
      const { inputType, outputType } = getTemplateTypes(t, compilationResult);
      const propertyName = toSwiftName(uncapitalize(t.template.name.text));
      const toolExecutorRef =
        Object.keys(t.tools).length >= 1
          ? getToolExecutorRef(t, compilationResult)
          : "Void";
      const fullType = `any Template<${inputType}, ${outputType}, ${toolExecutorRef}>`;
      templateProps.push({ name: propertyName, type: fullType });
      lines.push(
        `// Defined in '${t.template.sourcePath}'`,
        `public let ${propertyName}: ${fullType}`,
        "",
      );
    }

    if (templateCount <= 0) {
      lines.push("fileprivate init() {}");
    } else {
      lines.push("fileprivate init(");
      for (let i = 0; i < templateProps.length; i++) {
        const prop = templateProps[i]!;
        lines.push(`${prop.name}: ${prop.type},`);
      }
      lines.push(") {");
      for (const prop of templateProps) {
        lines.push(`self.${prop.name} = ${prop.name}`);
      }
      lines.push("}");
    }
    lines.push("}");
    return lines;
  };

  if (singleNamespace) {
    return [
      "/// Entry point for building prompts.",
      ...writeNamespaceMembers("Prompts", singleNamespace),
    ].join("\n");
  } else {
    const nsList = Object.values(namespaces);
    const lines: string[] = [
      "/// Entry point for building prompts.",
      "public struct Prompts: Sendable {",
    ];
    for (const ns of nsList) {
      const namespaceStructName = ns.name.concat("Prompts");
      const propertyName = toSwiftName(uncapitalize(ns.name));
      lines.push(`public let ${propertyName}: ${namespaceStructName}`);
    }
    lines.push("");
    if (nsList.length <= 0) {
      lines.push("fileprivate init() {}");
    } else {
      lines.push("fileprivate init(");
      for (let i = 0; i < nsList.length; i++) {
        const ns = nsList[i]!;
        const namespaceStructName = ns.name.concat("Prompts");
        const propertyName = toSwiftName(uncapitalize(ns.name));
        lines.push(`${propertyName}: ${namespaceStructName},`);
      }
      lines.push(") {");
      for (const ns of nsList) {
        const propertyName = toSwiftName(uncapitalize(ns.name));
        lines.push(`self.${propertyName} = ${propertyName}`);
      }
      lines.push("}");
    }
    lines.push("");
    for (const namespace of nsList) {
      const namespaceStructName = namespace.name.concat("Prompts");
      lines.push(
        `/// Prompts in the '${namespace.name}' namespace.`,
        ...writeNamespaceMembers(namespaceStructName, namespace),
        "",
      );
    }
    lines.push("}");
    return lines.join("\n");
  }
}

function writeTemplateIdEnum(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, templates } = compilationResult;
  const lines = [
    "/// Uniquely identifies a prompt template.",
    "public enum TemplateId: Sendable, CaseIterable, CustomStringConvertible {",
  ];
  for (const template of Object.values(templates)) {
    const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const templateName = template.template.name.text;
    const rawMemberName = singleNamespace
      ? uncapitalize(templateName)
      : `${uncapitalize(namespace)}_${templateName}`;
    const caseName = toSwiftName(rawMemberName);
    lines.push(`case ${caseName}`);
  }
  lines.push("", "private var id: String {", "switch self {");
  for (const template of Object.values(templates)) {
    const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const templateName = template.template.name.text;
    const rawMemberName = singleNamespace
      ? uncapitalize(templateName)
      : `${uncapitalize(namespace)}_${templateName}`;
    const caseName = toSwiftName(rawMemberName);
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
  config: { readonly rootNamespace: string },
): string {
  const { singleNamespace, namespaces } = compilationResult;

  const writeNamespace = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const lines: string[] = [];
    for (const tool of Object.values(namespace.tools)) {
      const toolName = tool.tool.name.text;
      const interfaceName = capitalize(toolName);
      const { inputType, outputType } = getToolTypes(
        tool,
        compilationResult,
        config,
      );

      lines.push(
        `/// Tool executor interface for the '${toolName}' tool.`,
        `public protocol ${interfaceName}: Sendable {`,
        `func ${toSwiftName(toolName)}(`,
        `input: ${inputType}`,
        `) async throws -> ${outputType}`,
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
        const interfaceRef = toSwiftName(capitalize(rawToolName));
        const paramName = toSwiftName(rawToolName);
        const methodName = toSwiftName(rawToolName);
        const { inputType, outputType } = getToolTypes(
          tool,
          compilationResult,
          config,
        );
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
        `/// Composite tool executor for the '${templateName}' prompt template.`,
        `/// Forwards to implementations of tools: ${toolNamesList}.`,
        `public struct ${toSwiftName(templateName)}: ${inherited}, Sendable {`,
        ...toolInfoList.map(
          (t) => `public let ${t.paramName}: any ${t.interfaceRef}`,
        ),
        "",
        "public init(",
        ...toolInfoList.map(
          (t, i) =>
            `${t.paramName}: any ${t.interfaceRef}${i < toolInfoList.length - 1 ? "," : ""}`,
        ),
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
      const namespaceName = toSwiftName(namespace.name);
      lines.push(`public enum ${namespaceName} {`);
      lines.push(...writeNamespace(namespace));
      lines.push(`}  // enum ${namespaceName}`, "");
    }
  }
  lines.push("}  // enum ToolExecutor");
  return lines.join("\n");
}

function writeUserDefinedDatatypes(
  compilationResult: ValidCompilationResult,
  config: { rootNamespace: string },
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
          typePrefix: `${config.rootNamespace}.Schema.Meta.`,
        },
      )
    : "Never?";
  lines.push(
    "/// Metadata associated with a prompt.",
    `public typealias Meta = ${metaType}`,
    "",
    "/// Namespace containing the user-defined datatypes.",
    "public enum Schema {",
  );
  if (anyTypes(metaSchema)) {
    lines.push(
      "enum Meta {",
      writeSchema(metaSchema, {
        typePrefix: `${config.rootNamespace}.Schema.Meta.`,
      }),
      "}\n",
    );
  }

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    const namespaceName = toSwiftName(namespace.name);
    const typePrefixBase = singleNamespace
      ? `${config.rootNamespace}.Schema.`
      : `${config.rootNamespace}.Schema.${namespaceName}.`;
    const sharedTypePrefix = `${config.rootNamespace}.Schema.Shared.`;
    if (anyTypes(namespace.schema)) {
      lines.push("enum Shared {");
      lines.push(
        writeSchema(namespace.schema, {
          typePrefix: sharedTypePrefix,
        }),
      );
      lines.push("}  // enum Shared", "");
    }
    for (const template of namespace.templates) {
      const templateName = toSwiftName(template.template.name.text);
      const typePrefix = typePrefixBase.concat(templateName, ".");
      lines.push(`enum ${templateName} {`);
      lines.push(
        writeSchema(template.schema, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
      lines.push(`}  // enum ${templateName}`, "");
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = toSwiftName(capitalize(tool.tool.name.text));
      const typePrefix = typePrefixBase.concat(toolName, ".");
      lines.push(`enum ${toolName} {\n`);
      lines.push(
        writeSchema(tool.schema, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
      lines.push(`}  // enum ${toolName}`, "");
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace);
  } else {
    for (const namespace of Object.values(namespaces)) {
      const namespaceName = toSwiftName(namespace.name);
      lines.push(`enum ${namespaceName} {`);
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

function writeTemplatesData(compilationResult: ValidCompilationResult): string {
  const templatesData = makeTemplates(compilationResult, {
    includeJsonSchemas: true,
  });
  const stringifiedJson = JSON.stringify(JSON.stringify(templatesData));
  const lines = [
    "private static let templatesData: Spec.Templates = try! Foundation.JSONDecoder().decode(",
    "Spec.Templates.self,",
    `from: Foundation.Data(${stringifiedJson}.utf8)`,
    ")",
  ];
  return lines.join("\n");
}

function getToolTypes(
  tool: ValidatedTool,
  compilationResult: ValidCompilationResult,
  config: { readonly rootNamespace: string },
): { readonly inputType: string; readonly outputType: string } {
  const { singleNamespace } = compilationResult;
  const toolName = tool.tool.name.text;
  const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
  const namespaceName = toSwiftName(toolNamespace);
  const typePrefixBase = singleNamespace
    ? `${config.rootNamespace}.Schema.`
    : `${config.rootNamespace}.Schema.${namespaceName}.`;
  const sharedTypePrefix = typePrefixBase.concat("Shared.");

  const toolTypeName = toSwiftName(capitalize(toolName));
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
  config: { readonly rootNamespace: string },
): string {
  const { singleNamespace, tools } = compilationResult;
  const toolList = Object.values(tools);

  const lines = [
    "fileprivate struct ToolExecutionError: Error, CustomStringConvertible {",
    "let description: String",
    "}",
    "",
    "fileprivate struct ToolNotFoundError: Error, CustomStringConvertible {",
    "let description: String",
    "}",
    "",
    "fileprivate static func executeToolCall(",
    "toolCall: ToolCall,",
    "namespace: String,",
    "executor: any Any",
    ") async throws -> ToolCallResponse {",
    'var stringifiedOutput = ""',
    "do {",
    'switch "\\(namespace):\\(toolCall.toolName)" {',
  ];

  for (const tool of toolList) {
    const toolName = tool.tool.name.text;
    const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
    const toolId = getId(tool.tool);
    const { inputType } = getToolTypes(tool, compilationResult, config);

    const interfaceName = singleNamespace
      ? `ToolExecutor.${capitalize(toolName)}`
      : `ToolExecutor.${toSwiftName(toolNamespace)}.${capitalize(toolName)}`;
    const methodName = toSwiftName(toolName);

    lines.push(
      `case "${toolId}":`,
      `guard let toolExecutor = executor as? ${interfaceName} else {`,
      "break",
      "}",
      `let input = try Foundation.JSONDecoder().decode(${inputType}.self, from: Foundation.Data(toolCall.stringifiedInput.utf8))`,
      `let rawOutput = try await toolExecutor.${methodName}(input: input)`,
      "let outputData = try Foundation.JSONEncoder().encode(rawOutput)",
      "stringifiedOutput = String(decoding: outputData, as: UTF8.self)",
    );
  }

  lines.push(
    "default:",
    "break",
    "}",
    "} catch {",
    'let callInfo = "{\\"callId\\": \\"\\(toolCall.callId)\\", \\"toolName\\": \\"\\(toolCall.toolName)\\"}"',
    'throw ToolExecutionError(description: "Tool call failed: \\(callInfo) — \\(error)")',
    "}",
    "if stringifiedOutput.isEmpty {",
    'throw ToolNotFoundError(description: "Tool not found: \\(toolCall.toolName)")',
    "}",
    "return ToolCallResponse(callId: toolCall.callId, stringifiedOutput: stringifiedOutput)",
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
    lines.push(...wrapDocComment(namingHint.doc));
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
  lines.push(`struct ${typeName} : Codable, Sendable {`);

  for (const field of fields) {
    const { type } = field;
    const name = toSwiftName(field.name.text);
    const fieldType = writeType(type, schema, options);
    lines.push(...wrapDocComment(field.doc));
    lines.push(`let ${name}: ${fieldType}`);
  }

  lines.push("", "init(");
  for (const field of fields) {
    const { type } = field;
    if (isLiteralType(type)) continue;
    const name = toSwiftName(field.name.text);
    const fieldType = writeType(type, schema, options);
    const defaultVal = type.kind === "optional" ? " = nil" : "";
    lines.push(`${name}: ${fieldType}${defaultVal},`);
  }
  lines.push(") {");
  for (const field of fields) {
    const name = toSwiftName(field.name.text);
    const { type } = field;
    if (isLiteralType(type)) {
      lines.push(`self.${name} = ${JSON.stringify(type.value)}`);
    } else {
      lines.push(`self.${name} = ${name}`);
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
      lines.push(`enum ${typeName} : String, Codable, Sendable {\n`);
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
      lines.push(`${indirect}enum ${typeName} : Codable, Sendable {`);
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
          ...wrapDocComment(commonField.doc ?? ""),
          `var ${name}: ${type} {`,
          "switch self {",
        );
        for (const { caseName } of caseEntries) {
          lines.push(`case .${caseName}(let value):`, `return value.${name}`);
        }
        lines.push("}", "}");
      }

      lines.push(
        "",
        "func encode(to encoder: any Encoder) throws {",
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
        "init(from decoder: any Decoder) throws {",
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

function wrapDocComment(doc: string): readonly string[] {
  if (!doc) return [];
  const lines = doc.split("\n");
  return lines.map((l) => `/// ${l}`);
}

function reformat(code: string): string {
  const inputLines: readonly string[] = code.split("\n");
  const outputLines: string[] = [];
  let indent = "";
  let continuationIndent = "";
  for (const inputLine of inputLines) {
    const line = inputLine.trim();
    if (
      line.startsWith("}") ||
      line.startsWith(")") ||
      line.startsWith("]") ||
      line.startsWith(">")
    ) {
      indent = indent.slice(0, -2);
    }
    const starPrefix = line.startsWith("*") ? " " : "";
    outputLines.push(
      line.length <= 0
        ? line
        : [indent, continuationIndent, starPrefix, line].join(""),
    );
    if (
      line.endsWith("{") ||
      line.endsWith("(") ||
      line.endsWith("[") ||
      line.endsWith("<")
    ) {
      indent = indent + "  ";
    } else if (line.endsWith(":")) {
      continuationIndent = "  ";
    } else if (!line.endsWith(",")) {
      continuationIndent = "";
    }
  }
  return outputLines.join("\n");
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
      .replace(/\n(\n *\})/g, "$1")
      // Coalesce consecutive empty lines.
      .replace(/\n\n\n+/g, "\n\n")
      .replace(/\n\n$/g, "\n")
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
