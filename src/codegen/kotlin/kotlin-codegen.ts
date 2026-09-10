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
  Field,
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
  toPascalCase,
  toScreamCase,
  uncapitalize,
} from "../../util/casing.js";
import type { OutputFile } from "../codegen-types.js";

export function generateKotlinCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const kotlinConfig = config.gen?.kotlin;
  if (!kotlinConfig) {
    return [];
  }
  return [
    {
      path: kotlinConfig.file,
      content: writeAll(compilationResult, kotlinConfig),
    },
  ];
}

function writeAll(
  compilationResult: ValidCompilationResult,
  kotlinConfig: { package: string },
): string {
  const unionContext = makeUnionContext(compilationResult);

  return coalesceEmptyLines(
    [
      STATIC_SNIPPETS["kotlin-top-level"],
      `package ${kotlinConfig.package};`,
      STATIC_SNIPPETS["kotlin-imports"],
      reformat(writePromptsClass(compilationResult)),
      STATIC_SNIPPETS["kotlin-public-types"],
      reformat(
        [
          writeTemplateIdEnum(compilationResult),
          writeToolExecutorInterfaces(compilationResult),
          writeUserDefinedDatatypes(compilationResult, unionContext),
          writeSpecDatatypes(unionContext),
          writeTemplatesData(compilationResult),
          writeExecuteToolCall(compilationResult),
        ].join("\n\n"),
      ),
      STATIC_SNIPPETS["kotlin-logic"],
    ].join("\n\n"),
  ).concat("\n");
}

function getTemplateTypes(
  template: ValidTemplate,
  compilationResult: ValidCompilationResult,
): { readonly inputType: string; readonly outputType: string } {
  const { singleNamespace } = compilationResult;
  const templateKtName = toKotlinName(template.template.name.text);
  const templateNamespace =
    template.template.namespace?.text ?? DEFAULT_NAMESPACE;
  const namespaceKtName = toKotlinName(templateNamespace);
  const sharedTypePrefix = singleNamespace
    ? "Schema.Shared."
    : `Schema.${namespaceKtName}.Shared.`;
  const typePrefixBase = singleNamespace
    ? "Schema."
    : `Schema.${namespaceKtName}.`;

  const templateTypePrefix = typePrefixBase.concat(templateKtName, ".");
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
  const [firstToolEntry] = toolEntries;
  if (toolEntries.length === 1 && firstToolEntry) {
    const tool = firstToolEntry.tool;
    const toolKtName = toKotlinName(capitalize(tool.tool.name.text));
    const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
    const namespaceBase = singleNamespace
      ? "ToolExecutor"
      : `ToolExecutor.${toKotlinName(toolNamespace)}`;
    return `${namespaceBase}.${toolKtName}`;
  } else {
    const templateKtName = toKotlinName(template.template.name.text);
    const templateNamespace =
      template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const namespaceBase = singleNamespace
      ? "ToolExecutor"
      : `ToolExecutor.${toKotlinName(templateNamespace)}`;
    return `${namespaceBase}.${templateKtName}`;
  }
}

function writePromptsClass(compilationResult: ValidCompilationResult): string {
  const { singleNamespace, namespaces } = compilationResult;

  const writeTemplateRenderMethods = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const methodLines: string[] = [];
    const templateCount = namespace.templates.length;
    for (let i = 0; i < templateCount; i++) {
      const t = namespace.templates[i]!;
      const { inputType, outputType } = getTemplateTypes(t, compilationResult);
      const methodName = "render".concat(capitalize(t.template.name.text));
      const templateId = getId(t.template);
      let toolExecutorRef: string;
      if (Object.keys(t.tools).length <= 0) {
        toolExecutorRef = "NoTools";
      } else {
        toolExecutorRef = getToolExecutorRef(t, compilationResult);
      }
      methodLines.push(
        `// Defined in '${t.template.sourcePath}'`,
        `fun ${methodName}(input: ${inputType}): Prompt<${outputType}, ${toolExecutorRef}> {`,
        `return doRender(spec, "${templateId}", input)`,
        "}",
        "",
      );
    }
    return methodLines;
  };

  const lines = ["/** Entry point for building prompts. */"];

  if (singleNamespace) {
    lines.push(
      "class Prompts internal constructor(",
      "private val spec: Spec.Templates,",
      ") {",
      "companion object {",
      "val default: Prompts = Prompts(templatesData)",
      "}",
      "",
    );
    const renderMethods = writeTemplateRenderMethods(singleNamespace);
    if (renderMethods.length > 0) {
      lines.push(...renderMethods);
    }
    lines.push("}");
  } else {
    const nsList = Object.values(namespaces);
    lines.push(
      "class Prompts internal constructor(",
      "private val spec: Spec.Templates,",
      ") {",
      "companion object {",
      "val default: Prompts = Prompts(templatesData)",
      "}",
      "",
    );
    for (const ns of nsList) {
      const namespaceClassName = ns.name.concat("Prompts");
      const propertyName = toKotlinName(uncapitalize(ns.name));
      lines.push(
        `val ${propertyName}: ${namespaceClassName} = ${namespaceClassName}(spec)`,
      );
    }
    lines.push("");
    for (const namespace of nsList) {
      const namespaceClassName = namespace.name.concat("Prompts");
      lines.push(
        "/**",
        ` * Prompts in the '${namespace.name}' namespace.`,
        " */",
        `class ${namespaceClassName} internal constructor(`,
        "private val spec: Spec.Templates,",
        ") {",
      );
      const renderMethods = writeTemplateRenderMethods(namespace);
      if (renderMethods.length > 0) {
        lines.push(...renderMethods);
      }
      lines.push("}", "");
    }
    lines.push("}");
  }

  return lines.join("\n");
}

function writeTemplateIdEnum(
  compilationResult: ValidCompilationResult,
): string {
  const templates = Object.values(compilationResult.templates);
  if (templates.length <= 0) {
    return [
      "/** Uniquely identifies a prompt template. */",
      "enum class TemplateId",
    ].join("\n");
  }
  const { singleNamespace } = compilationResult;
  const lines = [
    "/** Uniquely identifies a prompt template. */",
    "enum class TemplateId(private val id: String) {",
  ];
  for (const template of templates) {
    const isLast = template === templates.at(-1);
    const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const templateName = template.template.name.text;
    const rawMemberName = singleNamespace
      ? toKotlinName(toScreamCase(templateName))
      : `${toScreamCase(namespace)}__${toScreamCase(templateName)}`;
    const entryName = toKotlinName(rawMemberName);
    const templateId = getId(template.template);
    const comma = isLast ? ";" : ",";
    lines.push(`${entryName}("${templateId}")${comma}`);
  }
  lines.push("", "override fun toString(): String = id", "}");
  return lines.join("\n");
}

function writeToolExecutorInterfaces(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, namespaces } = compilationResult;

  const writeNamespace = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const lines: string[] = [];
    for (const tool of Object.values(namespace.tools)) {
      const rawToolName = tool.tool.name.text;
      const interfaceName = toKotlinName(capitalize(rawToolName));
      const methodName = toKotlinName(rawToolName);
      const { inputType, outputType } = getToolTypes(tool, compilationResult);

      lines.push(
        `/** Tool executor interface for the '${rawToolName}' tool. */`,
        `interface ${interfaceName} {`,
        `suspend fun ${methodName}(`,
        `input: ${inputType},`,
        `): ${outputType}`,
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
        const interfaceRef = toKotlinName(capitalize(rawToolName));
        const paramName = toKotlinName(rawToolName);
        const { inputType, outputType } = getToolTypes(tool, compilationResult);
        return {
          rawToolName,
          interfaceRef,
          paramName,
          methodName: paramName,
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
        "/**",
        ` * Composite executor interface for the '${rawTemplateName}' prompt template.`,
        ` * Requires implementations for tools: ${toolNamesList}.`,
        " */",
        `interface ${rawTemplateName} : ${inherited} {`,
        "companion object {",
        "/**",
        ` * Creates a composite executor for the '${rawTemplateName}' prompt template from individual tool implementations.`,
        " */",
        "fun create(",
        ...toolInfoList.map((t) => `${t.paramName}: ${t.interfaceRef},`),
        `): ${rawTemplateName} = Forwarding(${callArgs})`,
        "}",
        "",
        "private class Forwarding(",
        ...toolInfoList.map(
          (t) => `private val ${t.paramName}: ${t.interfaceRef},`,
        ),
        `) : ${rawTemplateName} {`,
      );

      for (const t of toolInfoList) {
        lines.push(
          `override suspend fun ${t.methodName}(`,
          `input: ${t.inputType},`,
          `) = ${t.paramName}.${t.methodName} (input)`,
          "",
        );
      }

      lines.push("}", "}", "");
    }
    return lines;
  };

  const lines = [
    "/** Namespace containing tool executor interfaces. */",
    "object ToolExecutor {",
  ];
  if (singleNamespace) {
    lines.push(...writeNamespace(singleNamespace));
  } else {
    for (const namespace of Object.values(namespaces)) {
      const ktNamespace = toKotlinName(namespace.name);
      lines.push(`object ${ktNamespace} {`);
      lines.push(...writeNamespace(namespace));
      lines.push(`}  // object ${ktNamespace}`, "");
    }
  }
  lines.push("}  // object ToolExecutor");
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
        topLevel: true,
        typePrefix: "Schema.Meta.",
      },
    )
    : "Nothing?";
  lines.push(
    "/** Metadata associated with a prompt. */",
    `typealias Meta = ${metaType}\n`,
    "/** Namespace containing the user-defined datatypes. */",
    "object Schema {",
  );
  if (anyTypes(metaSchema)) {
    lines.push(
      "object Meta {",
      writeSchema(metaSchema, unionContext, {
        typePrefix: "Schema.Meta.",
      }),
      "}  // object Meta\n",
    );
  }

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    const ktNamespace = toKotlinName(namespace.name);
    const typePrefixBase = singleNamespace
      ? "Schema."
      : `Schema.${ktNamespace}.`;
    const sharedTypePrefix = typePrefixBase.concat("Shared.");
    if (anyTypes(namespace.schema)) {
      lines.push("object Shared {");
      lines.push(
        writeSchema(namespace.schema, unionContext, {
          typePrefix: sharedTypePrefix,
        }),
      );
      lines.push("}  // object Shared\n");
    }
    for (const template of namespace.templates) {
      const rawTemplateName = template.template.name.text;
      const templateKtName = toKotlinName(rawTemplateName);
      const typePrefix = typePrefixBase.concat(templateKtName, ".");
      lines.push(`object ${templateKtName} {`);
      lines.push(
        writeSchema(template.schema, unionContext, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
      lines.push(`}  // object ${templateKtName}\n`);
    }
    for (const tool of Object.values(namespace.tools)) {
      const rawToolName = tool.tool.name.text;
      const toolKtName = toKotlinName(capitalize(rawToolName));
      const typePrefix = typePrefixBase.concat(toolKtName, ".");
      lines.push(`object ${toolKtName} {\n`);
      lines.push(
        writeSchema(tool.schema, unionContext, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
      lines.push(`}  // object ${toolKtName}\n`);
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace);
  } else {
    for (const namespace of Object.values(namespaces)) {
      const ktNamespace = toKotlinName(namespace.name);
      lines.push(`object ${ktNamespace} {`);
      writeNamespace(namespace);
      lines.push(`}  // object ${ktNamespace}\n`);
    }
  }
  lines.push("}\n");
  return lines.join("\n");
}

function writeSpecDatatypes(unionContext: UnionContext): string {
  const options = {
    typePrefix: "Spec.",
  } as const;
  const lines = [
    "internal object Spec {",
    writeSchema(runtimeTypesSchema, unionContext, options),
    "}  // object Spec",
  ];
  return lines.join("\n");
}

function writeTemplatesData(compilationResult: ValidCompilationResult): string {
  const templatesData = makeTemplates(compilationResult, {
    includeJsonSchemas: true,
  });
  const stringifiedJson = JSON.stringify(JSON.stringify(templatesData)).replace(
    /\$/g,
    "\\$",
  );
  const lines = [
    "private val templatesData: Spec.Templates = JsonConfig.lenient.decodeFromString(",
    `${stringifiedJson},`,
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
  const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
  const namespaceKtName = toKotlinName(toolNamespace);
  const sharedTypePrefix = singleNamespace
    ? "Schema.Shared."
    : `Schema.${namespaceKtName}.Shared.`;
  const typePrefixBase = singleNamespace
    ? "Schema."
    : `Schema.${namespaceKtName}.`;

  const toolKtName = toKotlinName(capitalize(rawToolName));
  const toolTypePrefix = typePrefixBase.concat(toolKtName, ".");
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
    '@Suppress("unused")',
    "private suspend fun executeToolCall(",
    "toolCall: ToolCall,",
    "namespace: String,",
    "executor: Any,",
    "): ToolCallResponse {",
    'var stringifiedOutput = ""',
    "try {",
    'when ("$namespace:${toolCall.toolName}") {',
  ];

  for (const tool of toolList) {
    const rawToolName = tool.tool.name.text;
    const toolKtName = toKotlinName(capitalize(rawToolName));
    const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
    const toolId = getId(tool.tool);
    const { inputType } = getToolTypes(tool, compilationResult);

    const toolInterface = singleNamespace
      ? `ToolExecutor.${toolKtName}`
      : `ToolExecutor.${toKotlinName(toolNamespace)}.${toolKtName}`;
    const methodName = toKotlinName(rawToolName);

    lines.push(
      `"${toolId}" -> {`,
      `val toolExecutor = executor as? ${toolInterface}`,
      "if (toolExecutor != null) {",
      `val input = Json.decodeFromString<${inputType}>(toolCall.stringifiedInput)`,
      `val rawOutput = toolExecutor.${methodName}(input)`,
      "stringifiedOutput = Json.encodeToString(rawOutput)",
      "}",
      "}",
    );
  }

  lines.push(
    "}",
    "} catch (e: Exception) {",
    'val callInfo = "{\\"callId\\": \\"${toolCall.callId}\\", \\"toolName\\": \\"${toolCall.toolName}\\"}"',
    'throw RuntimeException("Tool call failed: $callInfo — ${e.message ?: e.toString()}", e)',
    "}",
    "if (stringifiedOutput.isEmpty()) {",
    'throw IllegalArgumentException("Tool not found: ${toolCall.toolName}")',
    "}",
    "return ToolCallResponse(toolCall.callId, stringifiedOutput)",
    "}",
  );

  return lines.join("\n");
}

type WriteSchemaOptions = {
  readonly topLevel?: true;
  readonly typePrefix: string;
  readonly sharedTypePrefix?: string;
};

function writeSchema(
  schema: Schema,
  unionContext: UnionContext,
  options: WriteSchemaOptions,
): string {
  const { typePrefix } = options;
  const lines: string[] = [];
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const name = makeNameFromHint(namingHint);
    lines.push(`// Exported as '${typePrefix}${name}'`);
    lines.push(...wrapKDoc(namingHint.doc));
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
  const fields = Object.values(type.fields);
  const isDataClass = fields.length >= 1;
  const lines = [
    "@OptIn(ExperimentalSerializationApi::class)",
    "@Serializable",
  ];
  const discriminant = unionContext.intMemberToStringDiscriminant.get(type);
  if (discriminant) {
    lines.push(`@SerialName("${discriminant}")`);
  }
  const hasLiteralField = fields.some((f) => isLiteralType(f.type));
  lines.push(
    [
      isDataClass ? "data class " : "class ",
      typeName,
      hasLiteralField ? " private constructor" : "",
      "(",
    ].join(""),
  );

  const writeCtorParams = (primary: boolean): void => {
    for (const field of fields) {
      const type = resolveType(field.type, schema);
      if (isLiteralType(type) && !primary) continue;
      const ktName = toKotlinName(field.name.text);
      const fieldType = writeType(type, schema, options);
      const override =
        primary && unionContext.overrideFields.has(field) ? "override " : "";
      const val = primary ? "val " : "";
      const isOptional = type.kind === "optional";
      const encodeDefault =
        primary && isOptional ? "@kotlinx.serialization.EncodeDefault " : "";
      const defaultVal = isOptional ? " = null" : "";
      lines.push(...wrapKDoc(field.doc));
      lines.push(
        `${encodeDefault}${override}${val}${ktName}: ${fieldType}${defaultVal},`,
      );
    }
  };
  writeCtorParams(true);
  const interfaces = unionContext.intMemberToUnionRefs.get(type);
  const implementsClause = interfaces
    ? " : ".concat(
      interfaces
        .map((i) =>
          i.startsWith(options.typePrefix)
            ? i.slice(options.typePrefix.length)
            : i,
        )
        .join(", "),
    )
    : "";
  lines.push(`)${implementsClause} {`);
  if (hasLiteralField) {
    lines.push("constructor(");
    writeCtorParams(false);
    lines.push(") : this(");
    for (const field of fields) {
      const type = resolveType(field.type, schema);
      const ktName = toKotlinName(field.name.text);
      if (isLiteralType(type)) {
        const literal = JSON.stringify(type.value);
        lines.push(`${ktName} = ${literal},`);
      } else {
        lines.push(`${ktName} = ${ktName},`);
      }
    }
    lines.push(")");
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
      lines.push("@Serializable");
      lines.push(`enum class ${typeName} {\n`);
      for (const member of members.members) {
        const kotlinName = toKotlinName(toPascalCase(member.value));
        lines.push(`@SerialName("${member.value}")`);
        lines.push(kotlinName.concat(","));
      }
      lines.push("}");
      break;
    }
    case "interfaces": {
      const { discriminator } = members;
      lines.push(`@Serializable(with = ${typeName}_Serializer::class)`);
      lines.push(`sealed interface ${typeName} {`);
      for (const commonField of members.commonFields) {
        const name = toKotlinName(commonField.name);
        if (isLiteralType(commonField.type)) continue;
        const type = writeType(commonField.type, schema, options);
        lines.push(...wrapKDoc(commonField.doc ?? ""), `val ${name}: ${type}`);
      }
      lines.push("}");

      // Write the custom serializer for the union type based on the discriminant
      lines.push(
        "\n",
        [
          `private object ${typeName}_Serializer`,
          `JsonContentPolymorphicSerializer<${typeName}>(${typeName}::class) {`,
        ].join(" : "),
        [
          "override fun selectDeserializer(element: JsonElement)",
          `DeserializationStrategy<${typeName}> {`,
        ].join(": "),
        [
          `return when (val kind = element.jsonObject["${discriminator}"]`,
          "jsonPrimitive?.contentOrNull) {",
        ].join("?."),
      );
      for (const [discriminant, member] of Object.entries(members.members)) {
        lines.push(
          [
            `"${discriminant}" -> `,
            writeType(member.resolved, schema, options),
            ".serializer()",
          ].join(""),
        );
      }
      lines.push(
        "else -> throw IllegalArgumentException(\"Unknown discriminant: '${kind}'\")",
      );
      lines.push("}", "}", "}\n");
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
      return `List<${writtenElement}>`;
    }
    case "boolean-literal": {
      return "Boolean";
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
        return sharedTypePrefix!.concat(makeNameFromHint(namingHint!));
      }
    }
    case "optional": {
      return writeType(type.innerType, schema, options).concat("?");
    }
    case "primitive": {
      if (type.primitive.text === "integer") {
        return "Int";
      } else {
        switch (type.primitive.text) {
          case "boolean":
            return "Boolean";
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
      return `Map<String, ${writeType(type.valueType, schema, options)}>`;
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
          return namePieces.length <= 1 ? toKotlinName(piece.name) : piece.name;
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

  processSchema(compilationResult.metaSchema, "Schema.Meta.");
  for (const namespace of Object.values(compilationResult.namespaces)) {
    const typePrefixBase = compilationResult.singleNamespace
      ? "Schema."
      : "Schema.".concat(namespace.name, ".");
    processSchema(namespace.schema, typePrefixBase.concat("Shared."));
    for (const template of namespace.templates) {
      const templateKtName = toKotlinName(template.template.name.text);
      processSchema(
        template.schema,
        typePrefixBase.concat(templateKtName, "."),
      );
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolKtName = toKotlinName(capitalize(tool.tool.name.text));
      processSchema(tool.schema, typePrefixBase.concat(toolKtName, "."));
    }
  }

  processSchema(runtimeTypesSchema, "Spec.");

  return {
    intMemberToUnionRefs,
    intMemberToStringDiscriminant,
    overrideFields,
  };
}

function toKotlinName(name: string): string {
  return RESERVED_NAMES.has(name)
    ? name.concat("_")
    : KOTLIN_HARD_KEYWORDS.has(name)
      ? `\`${name}\``
      : name;
}

function wrapKDoc(doc: string): readonly string[] {
  if (!doc) return [];
  const lines = doc.split("\n");
  if (lines.length === 1) {
    return [`/** ${doc} */`];
  } else {
    return ["/**", ...lines.map((line) => (line ? ` * ${line}` : " *")), " */"];
  }
}

function reformat(code: string): string {
  const inputLines: readonly string[] = code.split("\n");
  const outputLines: string[] = [];
  let indent = "";
  for (const inputLine of inputLines) {
    const line = inputLine.trim();
    if (
      line.startsWith("}") ||
      line.startsWith(")") ||
      line.startsWith("]") ||
      line.startsWith(">")
    ) {
      indent = indent.slice(0, -4);
    }
    const starPrefix = line.startsWith("*") ? " " : "";
    outputLines.push(line.length <= 0 ? line : `${indent}${starPrefix}${line}`);
    if (
      line.endsWith("{") ||
      line.endsWith("(") ||
      line.endsWith("[") ||
      line.endsWith("<")
    ) {
      indent = indent + "    ";
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
  "Boolean",
  "DeserializationStrategy",
  "Double",
  "ExperimentalSerializationApi",
  "Int",
  "JsonContentPolymorphicSerializer",
  "IllegalArgumentException",
  "JsonElement",
  "List",
  "Map",
  "OptIn",
  "Schema",
  "Serializable",
  "String",
] as const);

const KOTLIN_HARD_KEYWORDS: ReadonlySet<string> = new Set([
  "abstract",
  "annotation",
  "as",
  "break",
  "catch",
  "class",
  "const",
  "continue",
  "crossinline",
  "data",
  "else",
  "enum",
  "external",
  "final",
  "finally",
  "for",
  "fun",
  "if",
  "import",
  "in",
  "inline",
  "interface",
  "internal",
  "is",
  "lateinit",
  "noinline",
  "object",
  "open",
  "operator",
  "override",
  "package",
  "private",
  "protected",
  "public",
  "reified",
  "return",
  "sealed",
  "super",
  "suspend",
  "this",
  "throw",
  "try",
  "typealias",
  "val",
  "var",
  "when",
  "while",
]);
