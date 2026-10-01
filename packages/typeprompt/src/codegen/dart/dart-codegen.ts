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
  Interface,
  NamingHint,
  Optional,
  Schema,
  Type,
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
import { coalesceEmptyLines, reformatCFamilyCode } from "../formatters.js";

export function generateDartCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const dartConfig = config.gen?.dart;
  if (!dartConfig) {
    return [];
  }
  return [
    {
      path: dartConfig.file,
      content: writeAll(compilationResult),
    },
  ];
}

function writeAll(compilationResult: ValidCompilationResult): string {
  const unionContext = makeUnionContext(compilationResult);

  return coalesceEmptyLines(
    [
      STATIC_SNIPPETS["dart-top-level"],
      STATIC_SNIPPETS["dart-imports"],
      reformatCFamilyCode(writePromptsClass(compilationResult)),
      STATIC_SNIPPETS["dart-public-types"],
      reformatCFamilyCode(
        [
          writeTemplateIdEnum(compilationResult),
          writeToolExecutorClasses(compilationResult),
          writePromptToolsEnums(compilationResult),
          writeUserDefinedDatatypes(compilationResult, unionContext),
          writeSpecDatatypes(unionContext),
          writeTemplatesData(compilationResult),
          writeExecuteToolCall(compilationResult),
        ].join("\n\n"),
      ),
      STATIC_SNIPPETS["dart-logic"],
    ].join("\n\n"),
  );
}

function getTemplateTypes(
  template: ValidTemplate,
  compilationResult: ValidCompilationResult,
): {
  readonly inputType: string;
  readonly outputType: string;
  readonly inputTypeNode: Type | Optional;
  readonly outputTypeNode: Type | Optional;
  readonly options: WriteSchemaOptions;
} {
  const { singleNamespace } = compilationResult;
  const templateName = template.template.name.text;
  const templateNamespace =
    template.template.namespace?.text ?? DEFAULT_NAMESPACE;
  const typePrefixBase = singleNamespace ? "" : templateNamespace.concat("_");
  const sharedTypePrefix = typePrefixBase.concat("Shared_");
  const templateTypePrefix = typePrefixBase.concat(templateName, "_");

  const options: WriteSchemaOptions = {
    typePrefix: templateTypePrefix,
    sharedTypePrefix,
  };

  const inputTypeNode = resolveType(
    { kind: "type-name", name: { text: "Input" } },
    template.schema,
  );
  const outputTypeNode = resolveType(
    { kind: "type-name", name: { text: "Output" } },
    template.schema,
  );

  const inputType = writeType(inputTypeNode, template.schema, options);
  const outputType = writeType(outputTypeNode, template.schema, options);

  return { inputType, outputType, inputTypeNode, outputTypeNode, options };
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
    const capitalizedToolName = capitalize(toolName);
    return singleNamespace
      ? `ToolExecutor_${capitalizedToolName}`
      : `ToolExecutor_${toolNamespace}_${capitalizedToolName}`;
  } else {
    const templateName = template.template.name.text;
    const templateNamespace =
      template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    return singleNamespace
      ? `ToolExecutor_${templateName}`
      : `ToolExecutor_${templateNamespace}_${templateName}`;
  }
}

function writePromptsClass(compilationResult: ValidCompilationResult): string {
  const { singleNamespace, namespaces } = compilationResult;

  const writeNamespaceMembers = (
    className: string,
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const lines: string[] = [
      `final class ${className} {`,
      "final _Spec_Templates _spec;",
      "",
      `const ${className}._(this._spec);`,
      "",
    ];
    const templateCount = namespace.templates.length;
    for (let i = 0; i < templateCount; i++) {
      const t = namespace.templates[i]!;
      const { inputType, outputType, inputTypeNode, outputTypeNode, options } =
        getTemplateTypes(t, compilationResult);
      const methodName = "render".concat(capitalize(t.template.name.text));
      const templateId = getId(t.template);
      let toolExecutorRef: string;
      if (Object.keys(t.tools).length <= 0) {
        toolExecutorRef = "NoTools";
      } else {
        toolExecutorRef = getToolExecutorRef(t, compilationResult);
      }
      const inputToJsonExpr = writeToJsonExpr(
        inputTypeNode,
        "input",
        t.schema,
        options,
      );
      const fromJsonExpr = writeFromJsonExpr(
        outputTypeNode,
        "json",
        t.schema,
        options,
      );
      const isJsonOutput = (t.template.outputFormat?.text ?? "json") === "json";

      if (isJsonOutput) {
        lines.push(
          `// Defined in '${t.template.sourcePath}'`,
          `Prompt<${outputType}, ${toolExecutorRef}> ${methodName}(${inputType} input) {`,
          `final fromJson = (json) => ${fromJsonExpr};`,
          `return _doRender(_spec, "${templateId}", ${inputToJsonExpr}, fromJson);`,
          "}",
          "",
        );
      } else {
        lines.push(
          `// Defined in '${t.template.sourcePath}'`,
          `Prompt<${outputType}, ${toolExecutorRef}> ${methodName}(${inputType} input) {`,
          `final fromJson = (str) => str as String;`,
          `return _doRender(_spec, "${templateId}", ${inputToJsonExpr}, fromJson);`,
          "}",
          "",
        );
      }
    }
    lines.push("}");
    return lines;
  };

  const sections: string[] = [];
  if (singleNamespace) {
    sections.push(
      [
        "/// Entry point for building prompts.",
        ...writeNamespaceMembers("Prompts", singleNamespace),
        "",
        "/// Entry point for building prompts.",
        "final prompts = Prompts._(_templatesData);",
      ].join("\n"),
    );
  } else {
    const nsList = Object.values(namespaces);
    const promptsLines: string[] = [
      "/// Entry point for building prompts.",
      "final class Prompts {",
      "final _Spec_Templates _spec;",
      "",
      "const Prompts._(this._spec);",
      "",
    ];
    for (const ns of nsList) {
      const namespaceClassName = ns.name.concat("Prompts");
      const propertyName = toDartName(uncapitalize(ns.name));
      promptsLines.push(
        `${namespaceClassName} get ${propertyName} => ${namespaceClassName}._(_spec);`,
      );
    }
    promptsLines.push(
      "}",
      "",
      "/// Entry point for building prompts.",
      "final prompts = Prompts._(_templatesData);",
    );
    sections.push(promptsLines.join("\n"));

    for (const namespace of nsList) {
      const namespaceClassName = namespace.name.concat("Prompts");
      sections.push(
        [
          `/// Prompts in the '${namespace.name}' namespace.`,
          ...writeNamespaceMembers(namespaceClassName, namespace),
        ].join("\n"),
      );
    }
  }

  return sections.join("\n\n");
}

function writeTemplateIdEnum(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, templates } = compilationResult;
  const templateList = Object.values(templates);
  if (templateList.length <= 0) {
    return [
      "/// Uniquely identifies a prompt template.",
      "enum TemplateId {",
      'none("");',
      "",
      "final String _id;",
      "const TemplateId(this._id);",
      "",
      "@override",
      "String toString() => _id;",
      "}",
    ].join("\n");
  }
  const lines = [
    "/// Uniquely identifies a prompt template.",
    "enum TemplateId {",
  ];
  for (const template of templateList) {
    const isLast = template === templateList.at(-1);
    const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const templateName = template.template.name.text;
    const rawMemberName = singleNamespace
      ? uncapitalize(templateName)
      : `${uncapitalize(namespace)}_${templateName}`;
    const caseName = toDartName(rawMemberName);
    const templateId = getId(template.template);
    lines.push(`${caseName}("${templateId}")${isLast ? ";" : ","}`);
  }
  lines.push(
    "",
    "final String _id;",
    "const TemplateId(this._id);",
    "",
    "@override",
    "String toString() => _id;",
    "}",
  );
  return lines.join("\n");
}

function writeToolExecutorClasses(
  compilationResult: ValidCompilationResult,
): string {
  if (Object.keys(compilationResult.tools).length <= 0) return "";
  const { singleNamespace, namespaces } = compilationResult;
  const lines: string[] = [];

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    for (const tool of Object.values(namespace.tools)) {
      const { interfaceName, methodName, inputType, outputType } = getToolInfo(
        tool,
        compilationResult,
      );

      const rawToolName: string = tool.tool.name.text;
      lines.push(
        `/// Tool executor interface for the '${rawToolName}' tool.`,
        `abstract class ${interfaceName} {`,
        `Future<${outputType}> ${methodName}(${inputType} input);`,
        "}",
        "",
      );
    }
    for (const template of namespace.templates) {
      const toolEntries = Object.values(template.tools);
      if (toolEntries.length < 2) continue;
      const templateName = template.template.name.text;
      const templateNamespace =
        template.template.namespace?.text ?? DEFAULT_NAMESPACE;
      const templateInterface = singleNamespace
        ? `ToolExecutor_${templateName}`
        : `ToolExecutor_${templateNamespace}_${templateName}`;
      const toolInfoList = toolEntries.map((t) => {
        const { interfaceName, methodName, inputType, outputType } =
          getToolInfo(t.tool, compilationResult);
        const rawToolName = t.tool.tool.name.text;
        const paramName = toDartName(rawToolName);
        return {
          rawToolName,
          interfaceName,
          paramName,
          methodName,
          inputType,
          outputType,
        };
      });

      const inherited = toolInfoList.map((t) => t.interfaceName).join(", ");
      const toolNamesList = toolInfoList
        .map((t) => `'${t.rawToolName}'`)
        .join(", ");
      const callArgs = toolInfoList.map((t) => t.paramName).join(", ");

      lines.push(
        `/// Composite executor interface for the '${templateName}' prompt template.`,
        `/// Requires implementations for tools: ${toolNamesList}.`,
        `abstract class ${templateInterface} implements ${inherited} {`,
        `/// Creates a composite executor for the '${templateName}' prompt template from individual tool implementations.`,
        `factory ${templateInterface}.create(`,
        ...toolInfoList.map((t) => `${t.interfaceName} ${t.paramName},`),
        `) => _${templateInterface}Forwarding(${callArgs});`,
        "}",
        "",
        `class _${templateInterface}Forwarding implements ${templateInterface} {`,
        ...toolInfoList.map((t) => `final ${t.interfaceName} _${t.paramName};`),
        "",
        `_${templateInterface}Forwarding(`,
        ...toolInfoList.map((t) => `this._${t.paramName},`),
        `);`,
        "",
      );

      for (const t of toolInfoList) {
        lines.push(
          "@override",
          `Future<${t.outputType}> ${t.methodName}(`,
          `${t.inputType} input`,
          `) => _${t.paramName}.${t.methodName}(input);`,
          "",
        );
      }

      lines.push("}", "");
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace);
  } else {
    for (const namespace of Object.values(namespaces)) {
      writeNamespace(namespace);
    }
  }

  return lines.join("\n");
}

function writePromptToolsEnums(
  compilationResult: ValidCompilationResult,
): string {
  if (Object.keys(compilationResult.tools).length <= 0) return "";
  const { singleNamespace, namespaces } = compilationResult;
  const lines: string[] = [];

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    for (const template of namespace.templates) {
      const toolEntries = Object.values(template.tools);
      if (toolEntries.length <= 0) continue;
      const rawTemplateName = template.template.name.text;
      const enumName = singleNamespace
        ? `PromptTools_${rawTemplateName}`
        : `PromptTools_${namespace.name}_${rawTemplateName}`;

      lines.push(
        "/// Tools available for the '" +
          rawTemplateName +
          "' prompt template.",
        `enum ${enumName} {`,
      );

      for (const t of toolEntries) {
        const isLast = t === toolEntries.at(-1);
        const rawToolName = t.tool.tool.name.text;
        const entryName = toDartName(toCamelCase(rawToolName));
        lines.push(`${entryName}${isLast ? ";" : ","}`);
      }

      lines.push("", "String get toolName {", "switch (this) {");

      for (const t of toolEntries) {
        const rawToolName = t.tool.tool.name.text;
        const entryName = toDartName(toCamelCase(rawToolName));
        lines.push(
          `case ${enumName}.${entryName}:`,
          `return "${rawToolName}";`,
        );
      }

      lines.push(
        "}",
        "}",
        "",
        "@override",
        "String toString() => toolName;",
        "}",
        "",
      );
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace);
  } else {
    for (const namespace of Object.values(namespaces)) {
      writeNamespace(namespace);
    }
  }

  return lines.join("\n");
}

function writeUserDefinedDatatypes(
  compilationResult: ValidCompilationResult,
  unionContext: UnionContext,
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
          typePrefix: "Meta_",
        },
      )
    : "Null";
  lines.push(
    "/// Metadata associated with a prompt.",
    `typedef Meta = ${metaType};`,
    anyTypes(metaSchema)
      ? "Meta _parseMeta(dynamic meta) => Meta.fromJson(meta as Map<String, dynamic>);"
      : "Meta _parseMeta(dynamic meta) => null;",
    "",
    "// ".concat("-".repeat(77)),
    "// User-defined datatypes",
    "// ".concat("-".repeat(77)),
    "",
  );
  if (anyTypes(metaSchema)) {
    lines.push(
      writeSchema(metaSchema, unionContext, {
        typePrefix: "Meta_",
      }),
    );
  }

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    const rawNamespace = namespace.name;
    const typePrefixBase = singleNamespace ? "" : rawNamespace.concat("_");
    const sharedTypePrefix = typePrefixBase.concat("Shared_");
    if (anyTypes(namespace.schema)) {
      lines.push(
        writeSchema(namespace.schema, unionContext, {
          typePrefix: sharedTypePrefix,
        }),
      );
    }
    for (const template of namespace.templates) {
      const templateName = template.template.name.text;
      const typePrefix = typePrefixBase.concat(templateName, "_");
      lines.push(
        writeSchema(template.schema, unionContext, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = capitalize(tool.tool.name.text);
      const typePrefix = typePrefixBase.concat(toolName, "_");
      lines.push(
        writeSchema(tool.schema, unionContext, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace);
  } else {
    for (const namespace of Object.values(namespaces)) {
      writeNamespace(namespace);
    }
  }
  return lines.join("\n");
}

function writeSpecDatatypes(unionContext: UnionContext): string {
  const options = {
    typePrefix: "_Spec_",
  } as const;
  return writeSchema(runtimeTypesSchema, unionContext, options);
}

function writeTemplatesData(compilationResult: ValidCompilationResult): string {
  const templatesData = makeTemplates(compilationResult);
  const stringifiedJson = JSON.stringify(JSON.stringify(templatesData)).replace(
    /\$/g,
    "\\$",
  );
  const lines = [
    `final _templatesData = _Spec_Templates.fromJson(`,
    `jsonDecode(${stringifiedJson}) as Map<String, dynamic>,`,
    `);`,
  ];
  return lines.join("\n");
}

function getToolInfo(
  tool: ValidatedTool,
  compilationResult: ValidCompilationResult,
): {
  readonly interfaceName: string;
  readonly methodName: string;
  readonly inputTypeNode: Type | Optional;
  readonly outputTypeNode: Type | Optional;
  readonly options: WriteSchemaOptions;
  readonly inputType: string;
  readonly outputType: string;
} {
  const { singleNamespace } = compilationResult;
  const toolName = tool.tool.name.text;
  const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
  const capitalizedToolName = capitalize(toolName);
  const typePrefixBase = singleNamespace ? "" : toolNamespace.concat("_");
  const sharedTypePrefix = typePrefixBase.concat("Shared_");
  const interfaceName = singleNamespace
    ? `ToolExecutor_${capitalizedToolName}`
    : `ToolExecutor_${toolNamespace}_${capitalizedToolName}`;
  const toolTypePrefix = typePrefixBase.concat(capitalizedToolName, "_");
  const options: WriteSchemaOptions = {
    typePrefix: toolTypePrefix,
    sharedTypePrefix,
  };

  const inputTypeNode = resolveType(
    { kind: "type-name", name: { text: "Input" } },
    tool.schema,
  );
  const outputTypeNode = resolveType(
    { kind: "type-name", name: { text: "Output" } },
    tool.schema,
  );

  const inputType = writeType(inputTypeNode, tool.schema, options);
  const outputType = writeType(outputTypeNode, tool.schema, options);

  return {
    interfaceName,
    methodName: toDartName(toolName),
    inputTypeNode,
    outputTypeNode,
    options,
    inputType,
    outputType,
  };
}

function writeExecuteToolCall(
  compilationResult: ValidCompilationResult,
): string {
  const { tools } = compilationResult;
  const toolList = Object.values(tools);

  const lines = [
    "Future<ToolCallResponse> _executeToolCall(",
    "ToolCall toolCall,",
    "String namespace,",
    "Object executor,",
    ") async {",
  ];

  if (toolList.length <= 0) {
    lines.push(
      'return _makeToolErrorResponse(toolCall.callId, "Tool not found: ${toolCall.toolName}");',
      "}",
    );
    return lines.join("\n");
  }

  lines.push('switch ("$namespace:${toolCall.toolName}") {');

  for (const tool of toolList) {
    const toolId = getId(tool.tool);
    const {
      interfaceName,
      methodName,
      inputTypeNode,
      outputTypeNode,
      options,
    } = getToolInfo(tool, compilationResult);

    const inputFromJson = writeFromJsonExpr(
      inputTypeNode,
      "json",
      tool.schema,
      options,
    );
    const outputToJson = writeToJsonExpr(
      outputTypeNode,
      "output",
      tool.schema,
      options,
    );

    lines.push(
      `case "${toolId}":`,
      `if (executor is ${interfaceName}) {`,
      "return _dispatchToolCall(",
      "toolCall,",
      `(json) => ${inputFromJson},`,
      `executor.${methodName},`,
      `(output) => ${outputToJson},`,
      ");",
      "}",
    );
  }

  lines.push(
    "}",
    'return _makeToolErrorResponse(toolCall.callId, "Tool not found: ${toolCall.toolName}");',
    "}",
  );

  return lines.join("\n");
}

type WriteSchemaOptions = {
  readonly typePrefix: string;
  readonly sharedTypePrefix?: string;
};

function writeSchema(
  schema: Schema,
  unionContext: UnionContext,
  options: WriteSchemaOptions,
): string {
  const lines: string[] = [];
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const name = makeNameFromHint(namingHint);
    lines.push(...commentify(namingHint.doc));
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

  return lines.join("\n");
}

function writeTypepromptInterface(
  type: Interface,
  typeName: string,
  schema: Schema,
  options: WriteSchemaOptions,
  unionContext: UnionContext,
): string {
  const { typePrefix } = options;
  const className = typePrefix.concat(typeName);

  const interfaces = unionContext.intMemberToUnionRefs.get(type);
  const implementsClause = interfaces
    ? " implements ".concat(interfaces.join(", "))
    : "";

  const lines = [`final class ${className}${implementsClause} {`];
  const fields = Object.values(type.fields);
  const hasNonLiteralFields = fields.some(
    (f) => !isLiteralType(resolveType(f.type, schema)),
  );

  for (const field of fields) {
    const type = resolveType(field.type, schema);
    if (isLiteralType(type)) continue;
    const dartName = toDartName(field.name.text);
    const fieldType = writeType(type, schema, options);
    lines.push(...commentify(field.doc));
    if (unionContext.overrideFields.has(field)) {
      lines.push("@override");
    }
    lines.push(`final ${fieldType} ${dartName};`);
  }
  lines.push("");
  if (hasNonLiteralFields) {
    lines.push(`${className}({`);
    for (const field of fields) {
      const type = resolveType(field.type, schema);
      if (isLiteralType(type)) continue;
      const dartName = toDartName(field.name.text);
      const isOptional = type.kind === "optional";
      const required = isOptional ? "" : "required ";
      lines.push(`${required}this.${dartName},`);
    }
    lines.push("});");
  } else {
    lines.push(`${className}();`);
  }
  lines.push("");
  if (interfaces) {
    lines.push("@override");
  }
  lines.push("Map<String, dynamic> toJson() {");
  lines.push("return {");
  for (const field of fields) {
    const rawName = field.name.text;
    const dartName = toDartName(rawName);
    const resolvedFieldType = resolveType(field.type, schema);
    if (isLiteralType(resolvedFieldType)) {
      const value = JSON.stringify(
        resolvedFieldType.value satisfies string | boolean,
      );
      lines.push(`"${rawName}": ${value},`);
    } else {
      const toJsonExpr = writeToJsonExpr(
        resolvedFieldType,
        dartName,
        schema,
        options,
      );
      lines.push(`"${rawName}": ${toJsonExpr},`);
    }
  }
  lines.push(
    "};", // Map literal
    "}", // toJson()
    "",
  );
  lines.push(
    "@override",
    "String toString() {",
    'return JsonEncoder.withIndent("  ").convert(toJson());',
    "}",
    "",
  );
  lines.push(
    `factory ${className}.fromJson(Map<String, dynamic> json) {`,
    `return ${className}(`,
  );
  for (const field of fields) {
    const type = resolveType(field.type, schema);
    if (isLiteralType(type)) continue;
    const rawName = field.name.text;
    const dartName = toDartName(rawName);
    const valueExpr = `json["${field.name.text}"]`;
    const valueFromJsonExpr = writeFromJsonExpr(
      type,
      valueExpr,
      schema,
      options,
    );
    lines.push(`${dartName}: ${valueFromJsonExpr},`);
  }
  lines.push(`);`, `}`);

  lines.push("}"); // class

  return lines.join("\n");
}

function writeTypepromptUnion(
  type: Union,
  typeName: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  const { typePrefix } = options;
  const className = typePrefix.concat(typeName);
  const members = schema.unionToMembers.get(type)!;
  const lines: string[] = [];
  switch (members.kind) {
    case "strings": {
      lines.push(`enum ${className} {\n`);
      for (const member of members.members) {
        const isLast = member === members.members.at(-1);
        const dartName = toDartName(toCamelCase(member.value));
        lines.push(dartName.concat(isLast ? ";" : ","));
      }
      lines.push("String toJson() {");
      lines.push("switch (this) {");
      for (const member of members.members) {
        const name = member.value;
        const dartName = toDartName(toCamelCase(name));
        lines.push(`case ${dartName}:`, `return "${name}";`);
      }
      lines.push(
        "}", // switch
        "}", // toJson()
        "",
      );
      lines.push(`factory ${className}.fromJson(String value) {`);
      lines.push("switch (value) {");
      for (const member of members.members) {
        const name = member.value;
        const dartName = toDartName(toCamelCase(name));
        lines.push(`case "${name}":`, `return ${className}.${dartName};`);
      }
      lines.push(
        "default:",
        'throw FormatException("Unknown json value: $value");',
      );
      lines.push(
        "}", // switch
        "}", // fromJson()
        "}",
      ); // enum
      break;
    }
    case "interfaces": {
      const discriminator = members.discriminator;
      lines.push(`sealed class ${className} {`);
      for (const commonField of members.commonFields) {
        const name = toDartName(commonField.name);
        if (isLiteralType(commonField.type)) continue;
        const type = writeType(commonField.type, schema, options);
        lines.push(
          ...commentify(commonField.doc ?? ""),
          `${type} get ${name};`,
        );
      }
      lines.push("", "Map<String, dynamic> toJson();");
      lines.push(
        "",
        `factory ${className}.fromJson(Map<String, dynamic> json) {`,
        `switch (json['${discriminator}']) {`,
      );
      for (const member of Object.values(members.members)) {
        const quotedDiscriminant = JSON.stringify(member.discriminant.value);
        const memberType = resolveType(member.resolved, schema);
        lines.push(
          `case ${quotedDiscriminant}:`,
          [
            "return ",
            writeType(memberType, schema, options),
            ".fromJson(json);",
          ].join(""),
        );
      }
      lines.push(
        "default:",
        `throw FormatException("Unknown discriminator: \${json['${discriminator}']}");`,
      );
      lines.push(
        "}", // switch
        "}", // fromJson
        "}",
      ); // sealed class
    }
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
      return "dynamic";
    }
    case "array": {
      const { elementType } = type;
      const writtenElement = writeType(elementType, schema, options);
      return `List<${writtenElement}>`;
    }
    case "interface":
    case "union": {
      let namingHint = schema.namingHints.defaultScope.get(type);
      let { typePrefix } = options;
      if (!namingHint) {
        namingHint = schema.namingHints.shared.get(type)!;
        typePrefix = options.sharedTypePrefix!;
      }
      return typePrefix.concat(makeNameFromHint(namingHint));
    }
    case "optional": {
      const innerType = resolveType(type.innerType, schema);
      return innerType.kind === "any"
        ? "dynamic"
        : writeType(innerType, schema, options).concat("?");
    }
    case "primitive": {
      if (type.primitive.text === "integer") {
        return "int";
      } else {
        switch (type.primitive.text) {
          case "boolean":
            return "bool";
          case "string":
            return "String";
          case "number":
            return "double";
          default:
            throw new Error(type.primitive.text satisfies never);
        }
      }
    }
    case "record": {
      return `Map<String, ${writeType(type.valueType, schema, options)}>`;
    }
    case "shared-type-name":
    case "type-name": {
      const resolvedType = resolveType(type, schema);
      return writeType(resolvedType, schema, options);
    }
  }
}

function writeToJsonExpr(
  type: Type | Optional,
  inputExpr: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  switch (type.kind) {
    case "any":
    case "primitive": {
      return inputExpr;
    }
    case "array": {
      const elementToJsonExpr = writeToJsonExpr(
        type.elementType,
        "e",
        schema,
        options,
      );
      if (elementToJsonExpr === "e") {
        return inputExpr;
      } else if (elementToJsonExpr.endsWith("(e)")) {
        return `${inputExpr}.map(${elementToJsonExpr.slice(0, -3)}).toList()`;
      } else {
        return `${inputExpr}.map((e) => ${elementToJsonExpr}).toList()`;
      }
    }
    case "interface":
    case "union": {
      return inputExpr.concat(".toJson()");
    }
    case "optional": {
      const innerToJsonExpr = writeToJsonExpr(
        type.innerType,
        inputExpr,
        schema,
        options,
      );
      if (innerToJsonExpr === inputExpr) {
        return inputExpr;
      } else if (innerToJsonExpr.startsWith(inputExpr.concat("."))) {
        return innerToJsonExpr.replace(".", "?.");
      } else {
        return `${inputExpr} == null ? null : ${innerToJsonExpr}`;
      }
    }
    case "record": {
      const valueToJsonExpr = writeToJsonExpr(
        type.valueType,
        "v",
        schema,
        options,
      );
      return inputExpr.concat(
        `.map((k, v) => MapEntry(k, ${valueToJsonExpr}))`,
      );
    }
    case "shared-type-name":
    case "type-name": {
      const resolvedType = resolveType(type, schema);
      return writeToJsonExpr(resolvedType, inputExpr, schema, options);
    }
  }
}

function writeFromJsonExpr(
  type: Type | Optional,
  inputExpr: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  switch (type.kind) {
    case "any": {
      return inputExpr;
    }
    case "array": {
      const elementTypeName = writeType(type.elementType, schema, options);
      const elementFromJsonExpr = writeFromJsonExpr(
        type.elementType,
        "e",
        schema,
        options,
      );
      if (elementFromJsonExpr === "e") {
        return `(${inputExpr} as List).cast<${elementTypeName}>()`;
      } else {
        return `(${inputExpr} as List).map<${elementTypeName}>((e) => ${elementFromJsonExpr}).toList()`;
      }
    }
    case "interface":
    case "union": {
      const typeName = writeType(type, schema, options);
      return `${typeName}.fromJson(${inputExpr})`;
    }
    case "optional": {
      const innerFromJsonExpr = writeFromJsonExpr(
        type.innerType,
        inputExpr,
        schema,
        options,
      );
      if (innerFromJsonExpr === inputExpr) {
        return inputExpr;
      } else if (innerFromJsonExpr.startsWith(inputExpr.concat("."))) {
        return innerFromJsonExpr.replace(".", "?.");
      } else {
        return `${inputExpr} == null ? null : ${innerFromJsonExpr}`;
      }
    }
    case "primitive": {
      switch (type.primitive.text) {
        case "boolean":
        case "string":
          return inputExpr;
        case "integer":
          return `(${inputExpr} as num).toInt()`;
        case "number":
          return `(${inputExpr} as num).toDouble()`;
        default:
          throw new Error(type.primitive.text satisfies never);
      }
    }
    case "record": {
      const valueTypeName = writeType(type.valueType, schema, options);
      const valueFromJsonExpr = writeFromJsonExpr(
        type.valueType,
        "v",
        schema,
        options,
      );
      return `(${inputExpr} as Map).map<String, ${valueTypeName}>((k, v) => MapEntry(k.toString(), ${valueFromJsonExpr}))`;
    }
    case "shared-type-name":
    case "type-name": {
      const resolvedType = resolveType(type, schema);
      return writeFromJsonExpr(resolvedType, inputExpr, schema, options);
    }
  }
}

function makeNameFromHint(hint: NamingHint): string {
  const { namePieces } = hint;
  return namePieces
    .map((piece) => {
      switch (piece.kind) {
        case "type":
          return namePieces.length <= 1 ? toDartName(piece.name) : piece.name;
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
  const intMemberToUnionRefs = new Map<Interface, string[]>();
  const intMemberToStringDiscriminant = new Map<Interface, string>();
  const overrideFields = new Set<Field>();

  const processSchema = (schema: Schema, typePrefix: string): void => {
    for (const [
      type,
      namingHint,
    ] of schema.namingHints.defaultScope.entries()) {
      if (type.kind !== "union") continue;
      const members = schema.unionToMembers.get(type)!;
      if (members.kind !== "interfaces") continue;
      const unionRef = typePrefix.concat(makeNameFromHint(namingHint));
      for (const member of Object.values(members.members)) {
        const { discriminant, resolved } = member;
        const unionRefs = intMemberToUnionRefs.get(resolved) ?? [];
        if (unionRefs.length <= 0) {
          intMemberToUnionRefs.set(resolved, unionRefs);
        }
        unionRefs.push(unionRef);

        if (discriminant.kind === "string-literal") {
          intMemberToStringDiscriminant.set(resolved, discriminant.value);
        }

        for (const commonField of members.commonFields) {
          for (const memberField of commonField.memberFields) {
            overrideFields.add(memberField);
          }
        }
      }
    }
  };

  processSchema(compilationResult.metaSchema, "Meta_");
  for (const namespace of Object.values(compilationResult.namespaces)) {
    const typePrefixBase = compilationResult.singleNamespace
      ? ""
      : namespace.name.concat("_");
    processSchema(namespace.schema, typePrefixBase.concat("Shared_"));
    for (const template of namespace.templates) {
      const templateName = template.template.name.text;
      processSchema(template.schema, typePrefixBase.concat(templateName, "_"));
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = capitalize(tool.tool.name.text);
      processSchema(tool.schema, typePrefixBase.concat(toolName, "_"));
    }
  }

  processSchema(runtimeTypesSchema, "_Spec_");

  return {
    intMemberToUnionRefs,
    intMemberToStringDiscriminant,
    overrideFields,
  };
}

function toDartName(name: string): string {
  return RESERVED_NAMES.has(name) ? name.concat("_") : name;
}

function commentify(doc: string): readonly string[] {
  if (!doc) return [];
  const lines = doc.split("\n");
  return lines.map((l) => (l ? `/// ${l}` : "///"));
}

const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "abstract",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "covariant",
  "default",
  "deferred",
  "do",
  "dynamic",
  "else",
  "enum",
  "export",
  "extends",
  "extension",
  "external",
  "factory",
  "false",
  "final",
  "finally",
  "for",
  "Function",
  "get",
  "hide",
  "if",
  "implements",
  "import",
  "in",
  "interface",
  "is",
  "late",
  "library",
  "mixin",
  "new",
  "null",
  "on",
  "operator",
  "part",
  "required",
  "rethrow",
  "return",
  "set",
  "show",
  "static",
  "super",
  "switch",
  "sync",
  "this",
  "throw",
  "true",
  "try",
  "typedef",
  "var",
  "void",
  "while",
  "with",
  "yield",
  // Symbols on Object
  "hashCode",
  "noSuchMethod",
  "runtimeType",
  "toString",
  // Generated symbols
  "toJson",
  "copyWith",
] as const);
