import {
  capitalize,
  Config,
  FieldType,
  Interface,
  isLiteralType,
  NamingHint,
  Optional,
  resolveType,
  Schema,
  toPascalCase,
  toSnakeCase,
  Type,
  TypeNameView,
  Union,
  ValidCompilationResult,
  ValidNamespaceResult,
} from "@typeprompt/core";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import { OutputFile } from "../codegen-types.js";

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
  return coalesceEmptyLines(
    [
      STATIC_SNIPPETS["cpp-top-level"],
      // reformat(writePromptsClass(compilationResult)),
      `namespace ${config.rootNamespace} {`,
      STATIC_SNIPPETS["cpp-public-types"],
      // writeTemplateIdEnum(compilationResult),
      // writeToolExecutorClasses(compilationResult),
      // writePromptToolsEnums(compilationResult),
      writeUserDefinedDatatypes(compilationResult, config),
      // writeSpecDatatypes(unionContext),
      // writeTemplatesData(compilationResult),
      // writeExecuteToolCall(compilationResult),
      `}  // namespace ${config.rootNamespace}`,
    ].join("\n\n"),
  );
}

// function getTemplateTypes(
//   template: ValidTemplate,
//   compilationResult: ValidCompilationResult,
// ): {
//   readonly inputType: string;
//   readonly outputType: string;
//   readonly inputTypeNode: Type | Optional;
//   readonly outputTypeNode: Type | Optional;
//   readonly options: WriteSchemaOptions;
// } {
//   const { singleNamespace } = compilationResult;
//   const templateName = template.template.name.text;
//   const templateNamespace =
//     template.template.namespace?.text ?? DEFAULT_NAMESPACE;
//   const typePrefixBase = singleNamespace ? "" : templateNamespace.concat("_");
//   const sharedTypePrefix = typePrefixBase.concat("Shared_");
//   const templateTypePrefix = typePrefixBase.concat(templateName, "_");

//   const options: WriteSchemaOptions = {
//     typePrefix: templateTypePrefix,
//     sharedTypePrefix,
//   };

//   const inputTypeNode = resolveType(
//     { kind: "type-name", name: { text: "Input" } },
//     template.schema,
//   );
//   const outputTypeNode = resolveType(
//     { kind: "type-name", name: { text: "Output" } },
//     template.schema,
//   );

//   const inputType = writeType(inputTypeNode, template.schema, options);
//   const outputType = writeType(outputTypeNode, template.schema, options);

//   return { inputType, outputType, inputTypeNode, outputTypeNode, options };
// }

// function getToolExecutorRef(
//   template: ValidTemplate,
//   compilationResult: ValidCompilationResult,
// ): string {
//   const { singleNamespace } = compilationResult;
//   const toolEntries = Object.values(template.tools);
//   const [firstToolEntry] = toolEntries;
//   if (toolEntries.length === 1 && firstToolEntry) {
//     const tool = firstToolEntry.tool;
//     const toolName = tool.tool.name.text;
//     const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
//     const capitalizedToolName = capitalize(toolName);
//     return singleNamespace
//       ? `ToolExecutor_${capitalizedToolName}`
//       : `ToolExecutor_${toolNamespace}_${capitalizedToolName}`;
//   } else {
//     const templateName = template.template.name.text;
//     const templateNamespace =
//       template.template.namespace?.text ?? DEFAULT_NAMESPACE;
//     return singleNamespace
//       ? `ToolExecutor_${templateName}`
//       : `ToolExecutor_${templateNamespace}_${templateName}`;
//   }
// }

// function writePromptsClass(compilationResult: ValidCompilationResult): string {
//   const { singleNamespace, namespaces } = compilationResult;

//   const writeNamespaceMembers = (
//     className: string,
//     namespace: ValidNamespaceResult,
//   ): readonly string[] => {
//     const lines: string[] = [
//       `final class ${className} {`,
//       "final _Spec_Templates _spec;",
//       "",
//       `const ${className}._(this._spec);`,
//       "",
//     ];
//     const templateCount = namespace.templates.length;
//     for (let i = 0; i < templateCount; i++) {
//       const t = namespace.templates[i]!;
//       const { inputType, outputType, inputTypeNode, outputTypeNode, options } =
//         getTemplateTypes(t, compilationResult);
//       const methodName = "render".concat(capitalize(t.template.name.text));
//       const templateId = getId(t.template);
//       let toolExecutorRef: string;
//       if (Object.keys(t.tools).length <= 0) {
//         toolExecutorRef = "NoTools";
//       } else {
//         toolExecutorRef = getToolExecutorRef(t, compilationResult);
//       }
//       const inputToJsonExpr = writeToJsonExpr(
//         inputTypeNode,
//         "input",
//         t.schema,
//         options,
//       );
//       const fromJsonExpr = writeFromJsonExpr(
//         outputTypeNode,
//         "json",
//         t.schema,
//         options,
//       );
//       const isJsonOutput = (t.template.outputFormat?.text ?? "json") === "json";

//       if (isJsonOutput) {
//         lines.push(
//           `// Defined in '${t.template.sourcePath}'`,
//           `Prompt<${outputType}, ${toolExecutorRef}> ${methodName}(${inputType} input) {`,
//           `final fromJson = (json) => ${fromJsonExpr};`,
//           `return _doRender(_spec, "${templateId}", ${inputToJsonExpr}, fromJson);`,
//           "}",
//           "",
//         );
//       } else {
//         lines.push(
//           `// Defined in '${t.template.sourcePath}'`,
//           `Prompt<${outputType}, ${toolExecutorRef}> ${methodName}(${inputType} input) {`,
//           `final fromJson = (str) => str as String;`,
//           `return _doRender(_spec, "${templateId}", ${inputToJsonExpr}, fromJson);`,
//           "}",
//           "",
//         );
//       }
//     }
//     lines.push("}");
//     return lines;
//   };

//   const sections: string[] = [];
//   if (singleNamespace) {
//     sections.push(
//       [
//         "/// Entry point for building prompts.",
//         ...writeNamespaceMembers("Prompts", singleNamespace),
//         "",
//         "/// Entry point for building prompts.",
//         "final prompts = Prompts._(_templatesData);",
//       ].join("\n"),
//     );
//   } else {
//     const nsList = Object.values(namespaces);
//     const promptsLines: string[] = [
//       "/// Entry point for building prompts.",
//       "final class Prompts {",
//       "final _Spec_Templates _spec;",
//       "",
//       "const Prompts._(this._spec);",
//       "",
//     ];
//     for (const ns of nsList) {
//       const namespaceClassName = ns.name.concat("Prompts");
//       const propertyName = toDartName(uncapitalize(ns.name));
//       promptsLines.push(
//         `${namespaceClassName} get ${propertyName} => ${namespaceClassName}._(_spec);`,
//       );
//     }
//     promptsLines.push(
//       "}",
//       "",
//       "/// Entry point for building prompts.",
//       "final prompts = Prompts._(_templatesData);",
//     );
//     sections.push(promptsLines.join("\n"));

//     for (const namespace of nsList) {
//       const namespaceClassName = namespace.name.concat("Prompts");
//       sections.push(
//         [
//           `/// Prompts in the '${namespace.name}' namespace.`,
//           ...writeNamespaceMembers(namespaceClassName, namespace),
//         ].join("\n"),
//       );
//     }
//   }

//   return sections.join("\n\n");
// }

// function writeTemplateIdEnum(
//   compilationResult: ValidCompilationResult,
// ): string {
//   const { singleNamespace, templates } = compilationResult;
//   const templateList = Object.values(templates);
//   if (templateList.length <= 0) {
//     return [
//       "/// Uniquely identifies a prompt template.",
//       "enum TemplateId {",
//       'none("");',
//       "",
//       "final String _id;",
//       "const TemplateId(this._id);",
//       "",
//       "@override",
//       "String toString() => _id;",
//       "}",
//     ].join("\n");
//   }
//   const lines = [
//     "/// Uniquely identifies a prompt template.",
//     "enum TemplateId {",
//   ];
//   for (const template of templateList) {
//     const isLast = template === templateList.at(-1);
//     const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
//     const templateName = template.template.name.text;
//     const rawMemberName = singleNamespace
//       ? uncapitalize(templateName)
//       : `${uncapitalize(namespace)}_${templateName}`;
//     const caseName = toDartName(rawMemberName);
//     const templateId = getId(template.template);
//     lines.push(`${caseName}("${templateId}")${isLast ? ";" : ","}`);
//   }
//   lines.push(
//     "",
//     "final String _id;",
//     "const TemplateId(this._id);",
//     "",
//     "@override",
//     "String toString() => _id;",
//     "}",
//   );
//   return lines.join("\n");
// }

// function writeToolExecutorClasses(
//   compilationResult: ValidCompilationResult,
// ): string {
//   if (Object.keys(compilationResult.tools).length <= 0) return "";
//   const { singleNamespace, namespaces } = compilationResult;
//   const lines: string[] = [];

//   const writeNamespace = (namespace: ValidNamespaceResult): void => {
//     for (const tool of Object.values(namespace.tools)) {
//       const { interfaceName, methodName, inputType, outputType } = getToolInfo(
//         tool,
//         compilationResult,
//       );

//       const rawToolName: string = tool.tool.name.text;
//       lines.push(
//         `/// Tool executor interface for the '${rawToolName}' tool.`,
//         `abstract class ${interfaceName} {`,
//         `Future<${outputType}> ${methodName}(${inputType} input);`,
//         "}",
//         "",
//       );
//     }
//     for (const template of namespace.templates) {
//       const toolEntries = Object.values(template.tools);
//       if (toolEntries.length < 2) continue;
//       const templateName = template.template.name.text;
//       const templateNamespace =
//         template.template.namespace?.text ?? DEFAULT_NAMESPACE;
//       const templateInterface = singleNamespace
//         ? `ToolExecutor_${templateName}`
//         : `ToolExecutor_${templateNamespace}_${templateName}`;
//       const toolInfoList = toolEntries.map((t) => {
//         const { interfaceName, methodName, inputType, outputType } =
//           getToolInfo(t.tool, compilationResult);
//         const rawToolName = t.tool.tool.name.text;
//         const paramName = toDartName(rawToolName);
//         return {
//           rawToolName,
//           interfaceName,
//           paramName,
//           methodName,
//           inputType,
//           outputType,
//         };
//       });

//       const inherited = toolInfoList.map((t) => t.interfaceName).join(", ");
//       const toolNamesList = toolInfoList
//         .map((t) => `'${t.rawToolName}'`)
//         .join(", ");
//       const callArgs = toolInfoList.map((t) => t.paramName).join(", ");

//       lines.push(
//         `/// Composite executor interface for the '${templateName}' prompt template.`,
//         `/// Requires implementations for tools: ${toolNamesList}.`,
//         `abstract class ${templateInterface} implements ${inherited} {`,
//         `/// Creates a composite executor for the '${templateName}' prompt template from individual tool implementations.`,
//         `factory ${templateInterface}.create(`,
//         ...toolInfoList.map((t) => `${t.interfaceName} ${t.paramName},`),
//         `) => _${templateInterface}Forwarding(${callArgs});`,
//         "}",
//         "",
//         `class _${templateInterface}Forwarding implements ${templateInterface} {`,
//         ...toolInfoList.map((t) => `final ${t.interfaceName} _${t.paramName};`),
//         "",
//         `_${templateInterface}Forwarding(`,
//         ...toolInfoList.map((t) => `this._${t.paramName},`),
//         `);`,
//         "",
//       );

//       for (const t of toolInfoList) {
//         lines.push(
//           "@override",
//           `Future<${t.outputType}> ${t.methodName}(`,
//           `${t.inputType} input`,
//           `) => _${t.paramName}.${t.methodName}(input);`,
//           "",
//         );
//       }

//       lines.push("}", "");
//     }
//   };

//   if (singleNamespace) {
//     writeNamespace(singleNamespace);
//   } else {
//     for (const namespace of Object.values(namespaces)) {
//       writeNamespace(namespace);
//     }
//   }

//   return lines.join("\n");
// }

// function writePromptToolsEnums(
//   compilationResult: ValidCompilationResult,
// ): string {
//   if (Object.keys(compilationResult.tools).length <= 0) return "";
//   const { singleNamespace, namespaces } = compilationResult;
//   const lines: string[] = [];

//   const writeNamespace = (namespace: ValidNamespaceResult): void => {
//     for (const template of namespace.templates) {
//       const toolEntries = Object.values(template.tools);
//       if (toolEntries.length <= 0) continue;
//       const rawTemplateName = template.template.name.text;
//       const enumName = singleNamespace
//         ? `PromptTools_${rawTemplateName}`
//         : `PromptTools_${namespace.name}_${rawTemplateName}`;

//       lines.push(
//         "/// Tools available for the '" +
//         rawTemplateName +
//         "' prompt template.",
//         `enum ${enumName} {`,
//       );

//       for (const t of toolEntries) {
//         const isLast = t === toolEntries.at(-1);
//         const rawToolName = t.tool.tool.name.text;
//         const entryName = toDartName(toCamelCase(rawToolName));
//         lines.push(`${entryName}${isLast ? ";" : ","}`);
//       }

//       lines.push("", "String get toolName {", "switch (this) {");

//       for (const t of toolEntries) {
//         const rawToolName = t.tool.tool.name.text;
//         const entryName = toDartName(toCamelCase(rawToolName));
//         lines.push(
//           `case ${enumName}.${entryName}:`,
//           `return "${rawToolName}";`,
//         );
//       }

//       lines.push(
//         "}",
//         "}",
//         "",
//         "@override",
//         "String toString() => toolName;",
//         "}",
//         "",
//       );
//     }
//   };

//   if (singleNamespace) {
//     writeNamespace(singleNamespace);
//   } else {
//     for (const namespace of Object.values(namespaces)) {
//       writeNamespace(namespace);
//     }
//   }

//   return lines.join("\n");
// }

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
      "",
      writeSchema(metaSchema, {
        typePrefix: "meta::",
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
        "",
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
        "",
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
        "",
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

  // const metaType = anyTypes(metaSchema)
  //   ? writeType(
  //     {
  //       kind: "type-name",
  //       name: { text: "Meta" },
  //     },
  //     metaSchema,
  //     {
  //       typePrefix: "meta::",
  //       rootNamespace
  //     },
  //   )
  //   : "std::nullopt_t";

  return lines.join("\n");
}

// function writeSpecDatatypes(unionContext: UnionContext): string {
//   const options = {
//     typePrefix: "_Spec_",
//   } as const;
//   return writeSchema(runtimeTypesSchema, unionContext, options);
// }

// function writeTemplatesData(compilationResult: ValidCompilationResult): string {
//   const templatesData = makeTemplates(compilationResult);
//   const stringifiedJson = JSON.stringify(JSON.stringify(templatesData)).replace(
//     /\$/g,
//     "\\$",
//   );
//   const lines = [
//     `final _templatesData = _Spec_Templates.fromJson(`,
//     `jsonDecode(${stringifiedJson}) as Map<String, dynamic>,`,
//     `);`,
//   ];
//   return lines.join("\n");
// }

// function getToolInfo(
//   tool: ValidatedTool,
//   compilationResult: ValidCompilationResult,
// ): {
//   readonly interfaceName: string;
//   readonly methodName: string;
//   readonly inputTypeNode: Type | Optional;
//   readonly outputTypeNode: Type | Optional;
//   readonly options: WriteSchemaOptions;
//   readonly inputType: string;
//   readonly outputType: string;
// } {
//   const { singleNamespace } = compilationResult;
//   const toolName = tool.tool.name.text;
//   const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
//   const capitalizedToolName = capitalize(toolName);
//   const typePrefixBase = singleNamespace ? "" : toolNamespace.concat("_");
//   const sharedTypePrefix = typePrefixBase.concat("Shared_");
//   const interfaceName = singleNamespace
//     ? `ToolExecutor_${capitalizedToolName}`
//     : `ToolExecutor_${toolNamespace}_${capitalizedToolName}`;
//   const toolTypePrefix = typePrefixBase.concat(capitalizedToolName, "_");
//   const options: WriteSchemaOptions = {
//     typePrefix: toolTypePrefix,
//     sharedTypePrefix,
//   };

//   const inputTypeNode = resolveType(
//     { kind: "type-name", name: { text: "Input" } },
//     tool.schema,
//   );
//   const outputTypeNode = resolveType(
//     { kind: "type-name", name: { text: "Output" } },
//     tool.schema,
//   );

//   const inputType = writeType(inputTypeNode, tool.schema, options);
//   const outputType = writeType(outputTypeNode, tool.schema, options);

//   return {
//     interfaceName,
//     methodName: toDartName(toolName),
//     inputTypeNode,
//     outputTypeNode,
//     options,
//     inputType,
//     outputType,
//   };
// }

// function writeExecuteToolCall(
//   compilationResult: ValidCompilationResult,
// ): string {
//   const { tools } = compilationResult;
//   const toolList = Object.values(tools);

//   const lines = [
//     "Future<ToolCallResponse> _executeToolCall(",
//     "ToolCall toolCall,",
//     "String namespace,",
//     "Object executor,",
//     ") async {",
//     "var stringifiedOutput = '';",
//     "try {",
//     'switch ("$namespace:${toolCall.toolName}") {',
//   ];

//   for (const tool of toolList) {
//     const toolId = getId(tool.tool);
//     const {
//       interfaceName,
//       methodName,
//       inputTypeNode,
//       outputTypeNode,
//       options,
//     } = getToolInfo(tool, compilationResult);

//     const inputFromJson = writeFromJsonExpr(
//       inputTypeNode,
//       "jsonDecode(toolCall.stringifiedInput)",
//       tool.schema,
//       options,
//     );
//     const outputToJson = writeToJsonExpr(
//       outputTypeNode,
//       "rawOutput",
//       tool.schema,
//       options,
//     );

//     lines.push(
//       `case "${toolId}": {`,
//       `if (executor is! ${interfaceName}) break;`,
//       `final input = ${inputFromJson};`,
//       `final rawOutput = await executor.${methodName}(input);`,
//       `final json = ${outputToJson};`,
//       "stringifiedOutput = jsonEncode(json);",
//       "break;",
//       "}",
//     );
//   }

//   lines.push(
//     "default: {",
//     "break;",
//     "}",
//     "}",
//     "} catch (e) {",
//     'final callInfo = \'{"callId": "${toolCall.callId}", "toolName": "${toolCall.toolName}"}\';',
//     "throw Exception('Tool call failed: $callInfo — $e');",
//     "}",
//     "if (stringifiedOutput.isEmpty) {",
//     'throw ArgumentError("Tool not found: ${toolCall.toolName}");',
//     "}",
//     "return ToolCallResponse(callId: toolCall.callId, stringifiedOutput: stringifiedOutput);",
//     "}",
//   );

//   return lines.join("\n");
// }

type WriteSchemaOptions = {
  readonly typePrefix: string;
  readonly sharedTypePrefix?: string;
  readonly rootNamespace: string;
};

function writeSchema(schema: Schema, options: WriteSchemaOptions): string {
  const { rootNamespace, typePrefix } = options;
  const lines: string[] = [];

  // First, declare all the types in the schema.
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

  // Second, define all the types in the schema.
  // Make sure define each type *after* all its dependencies have been defined.
  const definedTypes = new Set<Interface | Union>();
  const defineType = (type: FieldType): void => {
    type = resolveType(type, schema);
    if (type.kind === "optional") {
      type = type.innerType;
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
    lines.push(`// Exported as '${rootNamespace}::${typePrefix}${typeCName}'`);
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
    lines.push("", "");
  };

  for (const type of schema.namingHints.defaultScope.keys()) {
    defineType(type);
  }

  return lines.join("\n");
}

function writeTypepromptInterface(
  type: Interface,
  typeCName: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  // const { typePrefix } = options;

  const lines = [`struct ${typeCName} {`];
  const fields = Object.values(type.fields);

  for (const field of fields) {
    const type = resolveType(field.type, schema);
    if (isLiteralType(type)) continue;
    const cName = toCName(toSnakeCase(field.name.text));
    const fieldType = writeType(type, schema, options);
    lines.push(...commentify(field.doc, "  "));
    lines.push(`  ${fieldType} ${cName}{};`);
  }
  // lines.push("");
  // if (hasNonLiteralFields) {
  //   lines.push(`${className}({`);
  //   for (const field of fields) {
  //     const type = resolveType(field.type, schema);
  //     if (isLiteralType(type)) continue;
  //     const dartName = toDartName(field.name.text);
  //     const isOptional = type.kind === "optional";
  //     const required = isOptional ? "" : "required ";
  //     lines.push(`${required}this.${dartName},`);
  //   }
  //   lines.push("});");
  // } else {
  //   lines.push(`${className}();`);
  // }
  // lines.push("");
  // if (interfaces) {
  //   lines.push("@override");
  // }
  // lines.push("Map<String, dynamic> toJson() {");
  // lines.push("return {");
  // for (const field of fields) {
  //   const rawName = field.name.text;
  //   const dartName = toDartName(rawName);
  //   const resolvedFieldType = resolveType(field.type, schema);
  //   if (isLiteralType(resolvedFieldType)) {
  //     const value = JSON.stringify(
  //       resolvedFieldType.value satisfies string | boolean,
  //     );
  //     lines.push(`"${rawName}": ${value},`);
  //   } else {
  //     const toJsonExpr = writeToJsonExpr(
  //       resolvedFieldType,
  //       dartName,
  //       schema,
  //       options,
  //     );
  //     lines.push(`"${rawName}": ${toJsonExpr},`);
  //   }
  // }
  // lines.push(
  //   "};", // Map literal
  //   "}", // toJson()
  //   "",
  // );
  // lines.push(
  //   "@override",
  //   "String toString() {",
  //   'return JsonEncoder.withIndent("  ").convert(toJson());',
  //   "}",
  //   "",
  // );
  // lines.push(
  //   `factory ${className}.fromJson(Map<String, dynamic> json) {`,
  //   `return ${className}(`,
  // );
  // for (const field of fields) {
  //   const type = resolveType(field.type, schema);
  //   if (isLiteralType(type)) continue;
  //   const rawName = field.name.text;
  //   const dartName = toDartName(rawName);
  //   const valueExpr = `json["${field.name.text}"]`;
  //   const valueFromJsonExpr = writeFromJsonExpr(
  //     type,
  //     valueExpr,
  //     schema,
  //     options,
  //   );
  //   lines.push(`${dartName}: ${valueFromJsonExpr},`);
  // }
  // lines.push(`);`, `}`);

  lines.push("};"); // struct

  return lines.join("\n");
}

function writeTypepromptUnion(
  type: Union,
  typeCName: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  const members = schema.unionToMembers.get(type)!;
  const lines: string[] = [];
  switch (members.kind) {
    case "strings": {
      lines.push(`enum class ${typeCName} {`);
      for (const member of members.members) {
        const cName = toCName("k".concat(toPascalCase(member.value)));
        lines.push(`  ${cName},`);
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
        "  using variant_type = std::variant<",
      );
      for (const memberType of memberTypes) {
        lines.push(`      internal::box<${memberType}>,`);
      }
      lines.push(lines.pop()!.slice(0, -1).concat(">;"), "");
      const firstMember = members.first;
      const firstType = writeType(firstMember, schema, options);
      lines.push(
        `  ${typeCName}() : data_(${firstType}()) {}`,
        "  // Expects one of:",
      );
      for (const member of memberTypes) {
        lines.push(`  //   - a ${member} rvalue`);
      }
      lines.push(
        `  ${typeCName}(variant_type data) : data_(std::move(data)) {}`,
        "",
        `  ${typeCName}(const ${typeCName}&) = default;`,
        `  ${typeCName}(${typeCName}&&) = default;`,
        "",
        `  ${typeCName}& operator=(const ${typeCName}&) = default;`,
        `  ${typeCName}& operator=(${typeCName}&&) = default;`,
        "",
      );
      const discriminatorCName = toCName(toSnakeCase(discriminator));
      if (discriminants.type === "string") {
        lines.push(`  enum class ${discriminatorCName} {`);
        for (const discriminant of Object.values(discriminants.values)) {
          const cName = toCName("k".concat(toPascalCase(discriminant.value)));
          lines.push(`    ${cName},`);
        }
        lines.push(
          "  };",
          `  ${discriminatorCName} ${discriminatorCName}() const {`,
          `    return static_cast<enum ${discriminatorCName}>(data_.index());`,
          "  };",
        );
      } else {
        const firstDiscriminant: boolean = discriminants.values[0]!.value;
        lines.push(
          `  bool ${discriminatorCName}() const {`,
          `    return data_.index() == ${firstDiscriminant ? 1 : 0};`,
          "  };",
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
          const type = memberTypes[i];
          lines.push(
            `  const ${type}& ${methodCName}() const& { return *std::get<${i}>(data_); }`,
            `  ${type}& ${methodCName}() & { return *std::get<${i}>(data_); }`,
            `  internal::box<${type}> ${methodCName}() && { return std::move(std::get<${i}>(data_)); }`,
            "",
          );
        }
      }
      lines.push(" private:", "  variant_type data_;", "};"); // struct
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
      return `::${options.rootNamespace}::JsonNode`;
    }
    case "array": {
      const { elementType } = type;
      const writtenElement = writeType(elementType, schema, options);
      return `std::vector<${writtenElement}>`;
    }
    case "interface":
    case "union": {
      let namingHint = schema.namingHints.defaultScope.get(type);
      let typePrefix = "";
      if (!namingHint) {
        namingHint = schema.namingHints.shared.get(type)!;
        typePrefix = options.sharedTypePrefix!;
      }
      return typePrefix.concat(makeNameFromHint(namingHint));
    }
    case "optional": {
      const { innerType } = type;
      const writtenInner = writeType(innerType, schema, options);
      return `std::optional<${writtenInner}>`;
    }
    case "primitive": {
      if (type.primitive.text === "integer") {
        return "int32_t";
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
      const writtenValue = writeType(type.valueType, schema, options);
      return `std::unordered_map<std::string, ${writtenValue}>`;
    }
    case "shared-type-name":
    case "type-name": {
      const resolvedType = resolveType(type, schema);
      return writeType(resolvedType, schema, options);
    }
  }
}

// function writeToJsonExpr(
//   type: Type | Optional,
//   inputExpr: string,
//   schema: Schema,
//   options: WriteSchemaOptions,
// ): string {
//   switch (type.kind) {
//     case "any":
//     case "primitive": {
//       return inputExpr;
//     }
//     case "array": {
//       const elementToJsonExpr = writeToJsonExpr(
//         type.elementType,
//         "e",
//         schema,
//         options,
//       );
//       if (elementToJsonExpr === "e") {
//         return inputExpr;
//       } else if (elementToJsonExpr.endsWith("(e)")) {
//         return `${ inputExpr }.map(${ elementToJsonExpr.slice(0, -3) }).toList()`;
//       } else {
//         return `${ inputExpr }.map((e) => ${ elementToJsonExpr }).toList()`;
//       }
//     }
//     case "interface":
//     case "union": {
//       return inputExpr.concat(".toJson()");
//     }
//     case "optional": {
//       const innerToJsonExpr = writeToJsonExpr(
//         type.innerType,
//         inputExpr,
//         schema,
//         options,
//       );
//       if (innerToJsonExpr === inputExpr) {
//         return inputExpr;
//       } else if (innerToJsonExpr.startsWith(inputExpr.concat("."))) {
//         return innerToJsonExpr.replace(".", "?.");
//       } else {
//         return `${ inputExpr } == null ? null : ${ innerToJsonExpr }`;
//       }
//     }
//     case "record": {
//       const valueToJsonExpr = writeToJsonExpr(
//         type.valueType,
//         "v",
//         schema,
//         options,
//       );
//       return inputExpr.concat(
//         `.map((k, v) => MapEntry(k, ${ valueToJsonExpr }))`,
//       );
//     }
//     case "shared-type-name":
//     case "type-name": {
//       const resolvedType = resolveType(type, schema);
//       return writeToJsonExpr(resolvedType, inputExpr, schema, options);
//     }
//   }
// }

// function writeFromJsonExpr(
//   type: Type | Optional,
//   inputExpr: string,
//   schema: Schema,
//   options: WriteSchemaOptions,
// ): string {
//   switch (type.kind) {
//     case "any": {
//       return inputExpr;
//     }
//     case "array": {
//       const elementTypeName = writeType(type.elementType, schema, options);
//       const elementFromJsonExpr = writeFromJsonExpr(
//         type.elementType,
//         "e",
//         schema,
//         options,
//       );
//       if (elementFromJsonExpr === "e") {
//         return `(${ inputExpr } as List).cast < ${ elementTypeName } > ()`;
//       } else {
//         return `(${ inputExpr } as List).map < ${ elementTypeName } > ((e) => ${ elementFromJsonExpr }).toList()`;
//       }
//     }
//     case "interface":
//     case "union": {
//       const typeName = writeType(type, schema, options);
//       return `${ typeName }.fromJson(${ inputExpr })`;
//     }
//     case "optional": {
//       const innerFromJsonExpr = writeFromJsonExpr(
//         type.innerType,
//         inputExpr,
//         schema,
//         options,
//       );
//       if (innerFromJsonExpr === inputExpr) {
//         return inputExpr;
//       } else if (innerFromJsonExpr.startsWith(inputExpr.concat("."))) {
//         return innerFromJsonExpr.replace(".", "?.");
//       } else {
//         return `${ inputExpr } == null ? null : ${ innerFromJsonExpr } `;
//       }
//     }
//     case "primitive": {
//       switch (type.primitive.text) {
//         case "boolean":
//         case "string":
//           return inputExpr;
//         case "integer":
//           return `(${ inputExpr } as num).toInt()`;
//         case "number":
//           return `(${ inputExpr } as num).toDouble()`;
//         default:
//           throw new Error(type.primitive.text satisfies never);
//       }
//     }
//     case "record": {
//       const valueTypeName = writeType(type.valueType, schema, options);
//       const valueFromJsonExpr = writeFromJsonExpr(
//         type.valueType,
//         "v",
//         schema,
//         options,
//       );
//       return `(${ inputExpr } as Map).map < String, ${ valueTypeName }> ((k, v) => MapEntry(k.toString(), ${ valueFromJsonExpr }))`;
//     }
//     case "shared-type-name":
//     case "type-name": {
//       const resolvedType = resolveType(type, schema);
//       return writeFromJsonExpr(resolvedType, inputExpr, schema, options);
//     }
//   }
// }

function makeNameFromHint(hint: NamingHint): string {
  const { namePieces } = hint;
  return namePieces
    .map((piece) => {
      switch (piece.kind) {
        case "type":
          return piece.name;
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

// type UnionContext = {
//   readonly intMemberToUnionRefs: Map<Interface, readonly string[]>;
//   readonly intMemberToStringDiscriminant: Map<Interface, string>;
//   readonly overrideFields: Set<Field>;
// };

function toCName(name: string): string {
  return KEYWORDS.has(name) ? name.concat("_") : name;
}

function commentify(doc: string, indent = ""): readonly string[] {
  if (!doc) return [];
  const lines = doc.split("\n");
  return lines.map((l) => (l ? `${indent}// ${l}` : "//"));
}

// function reformat(code: string): string {
//   const inputLines: readonly string[] = code.split("\n");
//   const outputLines: string[] = [];
//   let indent = "";
//   let continuationIndent = "";
//   for (const inputLine of inputLines) {
//     const line = inputLine.trim();
//     if (
//       line.startsWith("}") ||
//       line.startsWith(")") ||
//       line.startsWith("]") ||
//       line.startsWith(">")
//     ) {
//       indent = indent.slice(0, -2);
//     }
//     const starPrefix = line.startsWith("*") ? " " : "";
//     outputLines.push(
//       line.length <= 0
//         ? line
//         : [indent, continuationIndent, starPrefix, line].join(""),
//     );
//     if (
//       line.endsWith("{") ||
//       line.endsWith("(") ||
//       line.endsWith("[") ||
//       line.endsWith("<")
//     ) {
//       indent = indent + "  ";
//     } else if (line.endsWith(":")) {
//       continuationIndent = "  ";
//     } else if (line.endsWith(";")) {
//       continuationIndent = "";
//     }
//   }
//   return outputLines.join("\n");
// }

function coalesceEmptyLines(code: string): string {
  return (
    code
      // Remove spaces enclosed within curly brackets if that's all there is.
      .replace(/\{\s+\}/g, "{}")
      // Remove spaces enclosed within round brackets if that's all there is.
      .replace(/\(\s+\)/g, "()")
      // Remove spaces enclosed within square brackets if that's all there is.
      .replace(/\[\s+\]/g, "[]")
      // Coalesce consecutive empty lines.
      .replace(/\n\n\n+/g, "\n\n")
      .replace(/\n*$/g, "\n")
  );
}

const KEYWORDS: ReadonlySet<string> = new Set([
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
]);
