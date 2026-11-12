import {
  capitalize,
  makeTemplates,
  runtimeTypesSchema,
  toPascalCase,
  toSnakeCase,
  type Spec,
} from "@typeprompt/core";
import type {
  Template,
  ValidatedTool,
  ValidCompilationResult,
  ValidNamespaceResult,
  ValidTemplate,
  ValidTool,
} from "@typeprompt/core/compiler/compiler-types.js";
import { DEFAULT_NAMESPACE } from "@typeprompt/core/compiler/default-namespace.js";
import { getId } from "@typeprompt/core/compiler/ids.js";
import type { Config } from "@typeprompt/core/config/config-parser.js";
import type {
  FieldType,
  NamingHint,
  Schema,
} from "@typeprompt/core/schema/schema-types.js";
import {
  resolveType,
  resolveTypeWithOmitDefault,
} from "@typeprompt/core/schema/type-resolver.js";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import type { OutputFile } from "../codegen-types.js";

export function generatePythonCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const pyConfig = config.gen?.python;
  if (!pyConfig) {
    return [];
  }
  const templatesData = makeTemplates(compilationResult);
  return [
    {
      path: pyConfig.file,
      content: writeAll(compilationResult, templatesData),
    },
  ];
}

function writeAll(
  compilationResult: ValidCompilationResult,
  templatesData: Spec.Templates,
): string {
  const { templates, tools } = compilationResult;

  return [
    STATIC_SNIPPETS["python-imports"],
    scaleIndenting(writePromptsClass(compilationResult)),
    STATIC_SNIPPETS["python-public-types"],
    scaleIndenting(
      [
        writeTemplateIdEnum(Object.values(templates)),
        writeUserDefinedDatatypes(compilationResult),
        writeToolExecutorProtocols(compilationResult),
        writeToolIdToMethodName(Object.values(tools)),
        writePydanticTypeAdapters(compilationResult),
        writeSpecDatatypes(),
        writeTemplatesData(templatesData),
        writeCreatePromptsFunction(compilationResult),
      ]
        .map((code) => code.trimEnd())
        .join("\n\n\n"),
    ),
    STATIC_SNIPPETS["python-logic"],
  ]
    .map((code) => code.trimEnd())
    .join("\n\n\n")
    .concat("\n");
}

function writePromptsClass(compilationResult: ValidCompilationResult): string {
  const { singleNamespace, namespaces } = compilationResult;

  const lines = ["@dataclass(frozen=True)", "class Prompts:"];

  const writeTemplatesAttributes = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const lines: string[] = [];
    if (namespace.templates.length <= 0) {
      lines.push(" pass");
    } else {
      for (const t of namespace.templates) {
        const { input, output } = writeInputOutputTypes(t, compilationResult);
        const fieldName = toPyName(t.template.name.text, "field_name");
        lines.push(
          ` # Defined in '${t.template.sourcePath}'`,
          ` ${fieldName}: Template[`,
          `  ${input},`,
          `  ${output},`,
        );
        if (Object.keys(t.tools).length >= 1) {
          const toolExecutorRef = getToolExecutorRef(
            t.template,
            compilationResult,
          );
          lines.push(`  ${toolExecutorRef},`);
        }
        lines.push(" ]");
      }
    }
    return lines;
  };
  lines.push(' """Entry point for building prompts."""');
  lines.push("");
  if (singleNamespace) {
    lines.push(...writeTemplatesAttributes(singleNamespace));
  } else {
    for (const namespace of Object.values(namespaces)) {
      const fieldName = toPyName(namespace.name, "field_name");
      lines.push(" @dataclass(frozen=True)");
      lines.push(` class ${namespace.name}Namespace:`);
      lines.push(
        ...writeTemplatesAttributes(namespace).map((line) =>
          indentLine(line, " "),
        ),
      );
      lines.push(` ${fieldName}: ${namespace.name}Namespace`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function writeTemplateIdEnum(templates: readonly ValidTemplate[]): string {
  const lines = ["# Uniquely identifies a prompt template."];
  if (templates.length <= 0) {
    lines.push("type TemplateId = Never");
  } else {
    lines.push("type TemplateId = Literal[");
    for (const template of templates) {
      const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
      const templateName = template.template.name.text;
      lines.push(` '${namespace}:${templateName}',`);
    }
    lines.push("]");
  }
  return lines.join("\n");
}

function writeUserDefinedDatatypes(
  compilationResult: ValidCompilationResult,
): string {
  const { metaSchema, namespaces, singleNamespace } = compilationResult;
  const writeDatatypes = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    if (
      namespace.schema.namingHints.defaultScope.size <= 0 &&
      namespace.templates.length <= 0 &&
      Object.keys(namespace.tools).length <= 0
    ) {
      return [" pass"];
    }
    const lines = [];
    const pyNamespace = toPyName(namespace.name, "snake_case_class_name");
    const schemaPrefix = singleNamespace ? "schema." : `schema.${pyNamespace}.`;
    if (namespace.schema.namingHints.defaultScope.size >= 1) {
      lines.push(" @final");
      lines.push(" class shared(_StaticClass):");
      lines.push(
        ...writeSchema(namespace.schema, {
          typePrefix: schemaPrefix.concat("shared."),
        }).map((line) => indentLine(line, "  ")),
      );
    }
    for (const template of namespace.templates) {
      const templateName = toPyName(
        template.template.name.text,
        "snake_case_class_name",
      );
      lines.push(" @final");
      lines.push(` class ${templateName}(_StaticClass):`);
      lines.push(
        ...writeSchema(template.schema, {
          typePrefix: `${schemaPrefix}${templateName}.`,
          sharedTypePrefix: schemaPrefix.concat("shared."),
        }).map((line) => indentLine(line, "  ")),
      );
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = toPyName(tool.tool.name.text, "snake_case_class_name");
      lines.push(" @final");
      lines.push(` class ${toolName}(_StaticClass):`);
      lines.push(
        ...writeSchema(tool.schema, {
          typePrefix: `${schemaPrefix}${toolName}.`,
          sharedTypePrefix: schemaPrefix.concat("shared."),
        }).map((line) => indentLine(line, "  ")),
      );
    }
    return lines;
  };
  const metaTypedef: string =
    metaSchema.namingHints.defaultScope.size <= 0
      ? "None"
      : writeType(metaSchema.typeDeclarations["Meta"]!.valueType, metaSchema, {
          typePrefix: "schema.meta.",
        });
  const lines = [
    "# Metadata associated with a prompt.",
    `type Meta = ${metaTypedef}`,
    "",
    "@final",
    "class schema(_StaticClass):",
    ' """Contains the user-defined datatypes organized by namespace."""',
    "",
    " @final",
    " class meta(_StaticClass):",
    ...writeSchema(metaSchema, {
      typePrefix: "schema.meta.",
    }).map((line) => indentLine(line, "  ")),
  ];
  if (singleNamespace) {
    lines.push(...writeDatatypes(singleNamespace));
  } else {
    for (const namespace of Object.values(namespaces)) {
      const templateName = toPyName(namespace.name, "snake_case_class_name");
      lines.push(" @final");
      lines.push(` class ${templateName}(_StaticClass):`);
      lines.push(
        ...writeDatatypes(namespace).map((line) => indentLine(line, " ")),
      );
    }
  }
  return lines.join("\n");
}

function writeToolExecutorProtocols(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, namespaces } = compilationResult;
  const writeNamespace = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const { templates } = namespace;
    if (templates.length <= 0) {
      return [" pass"];
    }
    const lines: string[] = [];
    for (const template of namespace.templates) {
      const { tools } = template;
      const toolNames = Object.keys(tools);
      const templateName = toPyName(
        template.template.name.text,
        "snake_case_class_name",
      );
      lines.push(" @final");
      lines.push(` class ${templateName}(_StaticClass):`);
      if (toolNames.length >= 1) {
        lines.push(
          "  class ToolExecutor(Protocol):",
          '   """Protocol for object implementing the tools callable by the LLM."""',
        );
        for (const [toolName, tool] of Object.entries(template.tools)) {
          const methodName = toPyName(toolName, "field_name");
          const { input, output } = writeInputOutputTypes(
            tool.tool,
            compilationResult,
          );
          lines.push(
            `   async def ${methodName}(`,
            "    self,",
            `    input: ${input},`,
            `   ) -> ${output}:`,
            "    ...",
          );
        }
        lines.push("");
      }
      if (toolNames.length <= 0) {
        lines.push("  type ToolName = Never");
      } else {
        const commaSeparatedToolNames = toolNames.map(
          (name) => `   '${name}',`,
        );
        lines.push("  type ToolName = Literal[");
        lines.push(...commaSeparatedToolNames);
        lines.push("  ]");
        lines.push("");
        lines.push(
          "  # Tuple of all tool names callable by the LLM for this template.",
        );
        lines.push("  TOOL_NAMES: Final = (");
        lines.push(...commaSeparatedToolNames);
        lines.push("  )");
        lines.push("");
      }
    }
    return lines;
  };
  const lines = ["@final", "class tools(_StaticClass):"];
  if (singleNamespace) {
    lines.push(...writeNamespace(singleNamespace));
  } else {
    for (const namespace of Object.values(namespaces)) {
      const pyNamespace = toPyName(namespace.name, "snake_case_class_name");
      lines.push(" @final");
      lines.push(` class ${pyNamespace}(_StaticClass):`);
      lines.push(
        ...writeNamespace(namespace).map((line) => indentLine(line, " ")),
      );
    }
  }
  return lines.join("\n");
}

function writeToolIdToMethodName(tools: readonly ValidatedTool[]): string {
  const seenToolIds = new Set<string>();
  const lines = ["_TOOL_ID_TO_METHOD_NAME: Final[Mapping[str, str]] = {"];
  for (const tool of tools) {
    const toolId = getId(tool.tool);
    if (seenToolIds.has(toolId)) continue;
    seenToolIds.add(toolId);
    const methodName = toPyName(tool.tool.name.text, "field_name");
    lines.push(` '${toolId}': '${methodName}',`);
  }
  lines.push("}");
  return lines.join("\n");
}

function writePydanticTypeAdapters(
  validationResult: ValidCompilationResult,
): string {
  const { templates, tools } = validationResult;
  const lines = ["_type_adapters: Final = {"];
  const writeEntry = (input: ValidTemplate | ValidTool): void => {
    const id = getId(input.kind === "template" ? input.template : input.tool);
    const { input: inputType, output: outputType } = writeInputOutputTypes(
      input,
      validationResult,
    );
    lines.push(
      ` "${id}": (`,
      `  pydantic.TypeAdapter(${inputType}),`,
      `  pydantic.TypeAdapter(${outputType}),`,
      " ),",
    );
  };
  for (const template of Object.values(templates)) {
    writeEntry(template);
  }
  for (const tool of Object.values(tools)) {
    writeEntry(tool);
  }
  lines.push("}");
  return lines.join("\n");
}

function writeSpecDatatypes(): string {
  const lines = [
    "@final",
    "class _internal(_StaticClass):",
    ...writeSchema(runtimeTypesSchema, {
      typePrefix: "_internal.",
    }).map((line) => indentLine(line, " ")),
    "",
    "",
  ];
  return lines.join("\n");
}

function writeSchema(
  schema: Schema,
  options: {
    readonly typePrefix: string;
    readonly sharedTypePrefix?: string;
  },
): readonly string[] {
  if (schema.namingHints.defaultScope.size <= 0) {
    return ["pass", ""];
  }
  const { typePrefix } = options;
  const lines: string[] = [];
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const name = makeNameFromHint(namingHint);
    if (!typePrefix.startsWith("_")) {
      lines.push(`# Exported as '${typePrefix}${name}'`);
    }
    switch (type.kind) {
      case "interface": {
        lines.push(`class ${name}(pydantic.BaseModel):`);
        lines.push(...writeDocstring(namingHint.doc, " "));
        const hasAliasedFields = Object.values(type.fields).some(
          (f) => toPyName(f.name.text, "field_name") !== f.name.text,
        );
        if (hasAliasedFields) {
          lines.push(
            " model_config = pydantic.ConfigDict(populate_by_name=True)",
          );
        } else if (Object.keys(type.fields).length <= 0) {
          lines.push(" pass");
        }
        const fields = Object.values(type.fields);
        const omitDefaultFields = fields.filter((f) => f.omitDefault);
        for (const field of fields) {
          const resolved = resolveType(field.type, schema);
          const pyType = writeType(resolved, schema, options);
          lines.push(...writeComment(field.doc, " "));
          const fieldName = toPyName(field.name.text, "field_name");
          const rawName = field.name.text;
          const isAliased = fieldName !== rawName;
          const isOptional = field.type.kind === "optional";
          if (isAliased) {
            lines.push(
              ` ${fieldName}: ${pyType} = pydantic.Field(`,
              ...(isOptional ? ["  default=None,"] : []),
              `  validation_alias=pydantic.AliasChoices('${rawName}', '${fieldName}'),`,
              `  serialization_alias='${rawName}',`,
              " )",
            );
          } else {
            lines.push(
              ` ${fieldName}: ${pyType}${isOptional ? " = None" : ""}`,
            );
          }
        }
        if (omitDefaultFields.length >= 1) {
          lines.push(
            "",
            ' @pydantic.model_serializer(mode="wrap")',
            " def _serialize(self, handler):",
            "  data = handler(self)",
            "  if isinstance(data, dict):",
          );
          for (const omitDefaultField of omitDefaultFields) {
            const rawName = omitDefaultField.name.text;
            const fieldName = toPyName(rawName, "field_name");
            const keys =
              fieldName === rawName ? [rawName] : [rawName, fieldName];
            const type = resolveTypeWithOmitDefault(
              omitDefaultField.type,
              schema,
            );
            for (const key of keys) {
              let condition: string;
              if (type.kind === "optional") {
                condition = `'${key}' in data and data['${key}'] is None`;
              } else if (type.kind === "array") {
                condition = `data.get('${key}') == []`;
              } else if (type.primitive.text === "string") {
                condition = `data.get('${key}') == ""`;
              } else if (type.primitive.text === "boolean") {
                condition = `data.get('${key}') is False`;
              } else {
                const _: "number" | "integer" = type.primitive.text;
                condition = `data.get('${key}') == 0 and not isinstance(data.get('${key}'), bool)`;
              }
              lines.push(`   if ${condition}:`, `    del data['${key}']`);
            }
          }
          lines.push("  return data");
        }

        const nonOptionalDefaultFields = omitDefaultFields.filter(
          (od) => od.type.kind !== "optional",
        );
        if (nonOptionalDefaultFields.length >= 1) {
          lines.push(
            "",
            ' @pydantic.model_validator(mode="before")',
            " @classmethod",
            " def _fill_json_defaults(cls, data, info):",
            '  if getattr(info, "mode", None) == "json" and isinstance(data, dict):',
          );
          for (const field of nonOptionalDefaultFields) {
            if (field.type.kind === "optional") continue;
            const rawName = field.name.text;
            const fieldName = toPyName(rawName, "field_name");
            const type = resolveTypeWithOmitDefault(field.type, schema);
            let defVal: string;
            if (type.kind === "array") {
              defVal = "[]";
            } else if (type.primitive.text === "boolean") {
              defVal = "False";
            } else if (type.primitive.text === "integer") {
              defVal = "0";
            } else if (type.primitive.text === "number") {
              defVal = "0.0";
            } else {
              const _: "string" = type.primitive.text;
              defVal = '""';
            }
            const check =
              fieldName === rawName
                ? `'${rawName}' not in data`
                : `'${rawName}' not in data and '${fieldName}' not in data`;
            lines.push(`   if ${check}:`, `    data['${rawName}'] = ${defVal}`);
          }
          lines.push("  return data");
        }
        break;
      }
      case "union": {
        const members = schema.unionToMembers.get(type)!;
        switch (members.kind) {
          case "interfaces": {
            lines.push(...writeComment(namingHint.doc, ""));
            lines.push(`type ${name} = Annotated[`);
            lines.push(" Union[");
            for (const member of Object.values(members.members)) {
              const memberType = writeType(member.resolved, schema, options);
              lines.push(`  ${memberType},`);
            }
            lines.push(" ],");
            lines.push(
              ` pydantic.Field(discriminator="${members.discriminator}"),`,
            );
            lines.push("]");
            break;
          }
          case "strings": {
            lines.push(`type ${name} = Literal[`);
            for (const member of Object.values(members.members)) {
              lines.push(` '${member.value}',`);
            }
            lines.push("]");
            break;
          }
          default: {
            throw new Error(members satisfies never);
          }
        }
        break;
      }
      default: {
        throw new Error(type satisfies never);
      }
    }
    lines.push("");
  }

  return lines;
}

function indentLine(line: string, indent: " " | "  " | "   "): string {
  return line.length <= 0 ? "" : indent.concat(line);
}

function writeTemplatesData(templatesData: Spec.Templates): string {
  const stringifiedJson = JSON.stringify(JSON.stringify(templatesData));
  return [
    "_templates_data: Final = _internal.Templates.model_validate_json(",
    ` ${stringifiedJson},`,
    " by_alias=True,",
    ")",
  ].join("\n");
}

function writeCreatePromptsFunction(
  compilationResult: ValidCompilationResult,
): string {
  const { namespaces, singleNamespace } = compilationResult;
  const lines = [
    "def _create_prompts(data: _internal.Templates) -> Prompts:",
    " return Prompts(",
  ];
  const writeArgs = (namespace: ValidNamespaceResult): readonly string[] =>
    Object.values(namespace.templates).map((t) => {
      const fieldName = toPyName(t.template.name.text, "field_name");
      const templateId = getId(t.template);
      return `  ${fieldName}=_get_template_impl("${templateId}", data),`;
    });
  if (singleNamespace) {
    lines.push(...writeArgs(singleNamespace));
  } else {
    for (const namespace of Object.values(namespaces)) {
      const fieldName = toPyName(namespace.name, "field_name");
      lines.push(`  ${fieldName}=Prompts.${namespace.name}Namespace(`);
      lines.push(...writeArgs(namespace).map((line) => indentLine(line, " ")));
      lines.push("  ),");
    }
  }
  lines.push(" )");
  return lines.join("\n");
}

function writeType(
  type: FieldType,
  schema: Schema,
  options: {
    readonly typePrefix: string;
    readonly sharedTypePrefix?: string;
  },
): string {
  switch (type.kind) {
    case "any": {
      return "Any";
    }
    case "array": {
      const { elementType } = type;
      const writtenElement = writeType(elementType, schema, options);
      return `list[${writtenElement}]`;
    }
    case "boolean-literal": {
      return type.value ? "Literal[True]" : "Literal[False]";
    }
    case "interface":
    case "union": {
      let namingHint = schema.namingHints.defaultScope.get(type);
      let shared: boolean;
      if (namingHint) {
        shared = false;
      } else {
        namingHint = schema.namingHints.shared.get(type);
        shared = true;
      }
      const typePrefix = shared
        ? options.sharedTypePrefix!
        : options.typePrefix;
      if (!typePrefix) throw new Error();
      return typePrefix.concat(makeNameFromHint(namingHint!));
    }
    case "optional": {
      const valueType = writeType(type.innerType, schema, options);
      return type.innerType.kind === "any"
        ? valueType
        : valueType.concat(" | None");
    }
    case "primitive": {
      switch (type.primitive.text) {
        case "boolean":
          return "bool";
        case "integer":
          return "int";
        case "number":
          return "float";
        case "string":
          return "str";
        default:
          throw new Error(type.primitive.text satisfies never);
      }
    }
    case "record": {
      const valueType = writeType(type.valueType, schema, options);
      return `dict[str, ${valueType}]`;
    }
    case "shared-type-name":
    case "type-name": {
      const resolvedType = resolveType(type, schema);
      return writeType(resolvedType, schema, options);
    }
    case "string-literal": {
      return `Literal['${type.value}']`;
    }
  }
}

function writeInputOutputTypes(
  input: ValidTemplate | ValidTool,
  compilationResult: ValidCompilationResult,
): {
  readonly input: string;
  readonly output: string;
} {
  const { schema, inputType, outputType } = input;

  const options: {
    readonly typePrefix: string;
    readonly sharedTypePrefix: string;
  } = ((): {
    readonly typePrefix: string;
    readonly sharedTypePrefix: string;
  } => {
    const { singleNamespace } = compilationResult;
    const rawNamespace =
      (input.kind === "template"
        ? input.template.namespace?.text
        : input.tool.namespace?.text) ?? DEFAULT_NAMESPACE;
    const pyNamespace = toPyName(rawNamespace, "snake_case_class_name");
    const typePrefixBase = singleNamespace
      ? "schema."
      : "schema.".concat(pyNamespace, ".");
    const rawName =
      input.kind === "template"
        ? input.template.name.text
        : input.tool.name.text;
    const name = toPyName(rawName, "snake_case_class_name");
    return {
      typePrefix: typePrefixBase.concat(name, "."),
      sharedTypePrefix: typePrefixBase.concat("shared."),
    };
  })();

  return {
    input: writeType(inputType.valueType, schema, options),
    output: writeType(outputType.valueType, schema, options),
  };
}

function makeNameFromHint(hint: NamingHint): string {
  const name = hint.namePieces
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
  if (hint.namePieces.length === 1) {
    return toPyName(name, "ClassName");
  } else {
    return name;
  }
}

function getToolExecutorRef(
  input: Template,
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace } = compilationResult;
  return [
    "tools",
    ...(singleNamespace
      ? []
      : [
          toPyName(
            input.namespace?.text ?? DEFAULT_NAMESPACE,
            "snake_case_class_name",
          ),
        ]),
    toPyName(input.name.text, "snake_case_class_name"),
    "ToolExecutor",
  ].join(".");
}

function toPyName(
  camelCaseName: string,
  type: "field_name" | "ClassName" | "snake_case_class_name",
): string {
  let identifier: string;
  let conflict: boolean;
  switch (type) {
    case "field_name": {
      identifier = toSnakeCase(camelCaseName);
      conflict =
        PYTHON_HARD_KEYWORDS.has(identifier) || identifier.startsWith("model_");
      break;
    }
    case "ClassName": {
      identifier = camelCaseName;
      conflict = PYTHON_HARD_KEYWORDS.has(identifier);
      break;
    }
    case "snake_case_class_name": {
      identifier = toSnakeCase(camelCaseName);
      conflict = PYTHON_HARD_KEYWORDS.has(identifier);
      break;
    }
  }
  return conflict ? identifier.concat("_") : identifier;
}

function writeDocstring(doc: string, indent: " "): readonly string[] {
  if (doc.length <= 0) {
    return [];
  } else if (doc.length <= 68 && !doc.includes("\n")) {
    return [`${indent}"""${doc}"""`, ""];
  } else {
    return [
      `${indent}"""`,
      ...doc
        .split("\n")
        .map((line) => `${indent}${line.replace(/"""/g, "'''")}`),
      `${indent}"""`,
      "",
    ];
  }
}

function writeComment(doc: string, indent: "" | " "): readonly string[] {
  if (doc.length <= 0) {
    return [];
  } else {
    return doc.split("\n").map((line) => `${indent}# ${line}`);
  }
}

function scaleIndenting(input: string): string {
  return input.replace(/^ +/gm, (match) => match.repeat(4));
}

const PYTHON_HARD_KEYWORDS: ReadonlySet<string> = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);
