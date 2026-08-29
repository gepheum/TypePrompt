import type {
  Template,
  Tool,
  ValidatedTool,
  ValidCompilationResult,
  ValidNamespaceResult,
  ValidTemplate,
} from "../../compiler/compiler-types.js";
import { DEFAULT_NAMESPACE } from "../../compiler/default-namespace.js";
import { getId } from "../../compiler/ids.js";
import type { Config } from "../../config/config-parser.js";
import { runtimeTypesSchema } from "../../runtime/runtime-types-schema.js";
import { makeTemplates } from "../../runtime/spec-maker.js";
import { FieldType, NamingHint, Schema } from "../../schema/schema-types.js";
import { resolveType } from "../../schema/type-resolver.js";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import { capitalize, toPascalCase, toSnakeCase } from "../../util/casing.js";
import type { OutputFile } from "../codegen-types.js";

export function generatePythonCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const pyConfig = config.gen?.python;
  if (!pyConfig) {
    return [];
  }
  return [
    {
      path: pyConfig.file,
      content: writeAll(compilationResult),
    },
  ];
}

function writeAll(compilationResult: ValidCompilationResult): string {
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
        writeToolNameToMethodName(Object.values(tools)),
        writePydanticTypeAdapters(compilationResult),
        writeSpecDatatypes(),
        writeTemplatesData(compilationResult),
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
        const typePrefix = getTypePrefix(t.template, compilationResult);
        const fieldName = toPyName(t.template.name.text, "field_name");
        lines.push(
          ` # Defined in '${t.template.sourcePath}'`,
          ` ${fieldName}: Template[`,
          `  ${typePrefix}Input,`,
          `  ${typePrefix}Output,`,
        );
        if (Object.keys(t.tools).length > 0) {
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
    const namespaceName = toPyName(namespace.name, "snake_case_class_name");
    const schemaPrefix = singleNamespace
      ? "schema."
      : `schema.${namespaceName}.`;
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
      lines.push(` @final`);
      lines.push(` class ${templateName}(_StaticClass):`);
      lines.push(
        ...writeSchema(template.schema, {
          typePrefix: `${schemaPrefix}${templateName}.`,
          sharedTypePrefix: schemaPrefix.concat("shared."),
          requiredTypes: ["Input", "Output"],
        }).map((line) => indentLine(line, "  ")),
      );
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = toPyName(tool.tool.name.text, "snake_case_class_name");
      lines.push(` @final`);
      lines.push(` class ${toolName}(_StaticClass):`);
      lines.push(
        ...writeSchema(tool.schema, {
          typePrefix: `${schemaPrefix}${toolName}.`,
          sharedTypePrefix: schemaPrefix.concat("shared."),
          requiredTypes: ["Input", "Output"],
        }).map((line) => indentLine(line, "  ")),
      );
    }
    return lines;
  };
  const lines = [
    "@final",
    "class schema(_StaticClass):",
    ' """Contains the user-defined datatypes organized by namespace."""',
    "",
    " @final",
    " class meta(_StaticClass):",
    ...writeSchema(metaSchema, {
      typePrefix: "schema.meta.",
      requiredTypes: ["Meta"],
    }).map((line) => indentLine(line, "  ")),
  ];
  if (singleNamespace) {
    lines.push(...writeDatatypes(singleNamespace));
  } else {
    for (const namespace of Object.values(namespaces)) {
      const templateName = toPyName(namespace.name, "snake_case_class_name");
      lines.push(` @final`);
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
      if (toolNames.length > 0) {
        lines.push(
          "  class ToolExecutor(Protocol):",
          '   """Protocol for object implementing the tools callable by the LLM."""',
        );
        for (const [toolName, tool] of Object.entries(template.tools)) {
          const methodName = toPyName(toolName, "field_name");
          const typePrefix = getTypePrefix(tool.tool.tool, compilationResult);
          lines.push(
            `   async def ${methodName}(`,
            "    self,",
            `    input: ${typePrefix}Input,`,
            `   ) -> ${typePrefix}Output:`,
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
      const namespaceName = toPyName(namespace.name, "snake_case_class_name");
      lines.push(" @final");
      lines.push(` class ${namespaceName}(_StaticClass):`);
      lines.push(
        ...writeNamespace(namespace).map((line) => indentLine(line, " ")),
      );
    }
  }
  return lines.join("\n");
}

function writeToolNameToMethodName(tools: readonly ValidatedTool[]): string {
  const seenToolNames = new Set<string>();
  const lines = ["_TOOL_NAME_TO_METHOD_NAME: Final[Mapping[str, str]] = {"];
  for (const tool of tools) {
    const toolName = tool.tool.name.text;
    if (seenToolNames.has(toolName)) continue;
    seenToolNames.add(toolName);
    const methodName = toPyName(toolName, "field_name");
    lines.push(` '${toolName}': '${methodName}',`);
  }
  lines.push("}");
  if (tools.length > 0) {
    lines.push(
      "",
      "",
      "def tool_name_to_method_name(tool_name: str) -> str:",
      " return _TOOL_NAME_TO_METHOD_NAME[tool_name]",
    );
  }
  return lines.join("\n");
}

function writePydanticTypeAdapters(
  validationResult: ValidCompilationResult,
): string {
  const { templates, tools } = validationResult;
  const lines = ["_type_adapters: Final = {"];
  const writeEntry = (input: Template | Tool): void => {
    const id = getId(input);
    const typePrefix = getTypePrefix(input, validationResult);
    lines.push(
      ` "${id}": (`,
      `  pydantic.TypeAdapter(${typePrefix}Input),`,
      `  pydantic.TypeAdapter(${typePrefix}Output),`,
      " ),",
    );
  };
  for (const template of Object.values(templates)) {
    writeEntry(template.template);
  }
  for (const tool of Object.values(tools)) {
    writeEntry(tool.tool);
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
    readonly requiredTypes?: readonly string[];
  },
): readonly string[] {
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
        for (const field of Object.values(type.fields)) {
          const type = writeType(
            resolveType(field.type, schema),
            schema,
            options,
          );
          lines.push(...writeComment(field.doc, " "));
          const fieldName = toPyName(field.name.text, "field_name");
          if (fieldName === field.name.text) {
            if (field.type.kind === "optional") {
              lines.push(` ${fieldName}: ${type} = None`);
            } else {
              lines.push(` ${fieldName}: ${type}`);
            }
          } else {
            lines.push(` ${fieldName}: ${type} = pydantic.Field(`);
            if (field.type.kind === "optional") {
              lines.push("  default=None,");
            }
            const aliasChoices = [field.name.text, fieldName]
              .map((name) => `'${name}'`)
              .join(", ");
            lines.push(
              `  validation_alias=pydantic.AliasChoices(${aliasChoices}),`,
            );
            lines.push(`  serialization_alias='${field.name.text}',`);
            lines.push(" )");
          }
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

  for (const requiredType of options.requiredTypes ?? []) {
    const declaration = schema.typeDeclarations[requiredType];
    if (declaration) {
      if (
        declaration.valueType.kind !== "interface" &&
        declaration.valueType.kind !== "union"
      ) {
        const type = writeType(declaration.valueType, schema, options);
        lines.push(`type ${requiredType} = ${type}`);
        lines.push("");
      }
    } else {
      lines.push(`type ${requiredType} = Literal[None]`);
      lines.push("");
    }
  }

  return lines;
}

function indentLine(line: string, indent: " " | "  " | "   "): string {
  return line.length <= 0 ? "" : indent.concat(line);
}

function writeTemplatesData(compilationResult: ValidCompilationResult): string {
  const templatesData = makeTemplates(compilationResult, {
    includeJsonSchemas: false,
  });
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
    case "shared-type-name": {
      const declaration = schema.sharedDeclarations[type.name.text]!;
      return writeType(declaration.valueType, schema, options);
    }
    case "string-literal": {
      return `Literal['${type.value}']`;
    }
    case "type-name": {
      const declaration = schema.typeDeclarations[type.name.text]!;
      return writeType(declaration.valueType, schema, options);
    }
  }
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

function getTypePrefix(
  input: Template | Tool,
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace } = compilationResult;
  return [
    "schema",
    ...(singleNamespace
      ? []
      : [
          toPyName(
            input.namespace?.text ?? DEFAULT_NAMESPACE,
            "snake_case_class_name",
          ),
        ]),
    toPyName(input.name.text, "snake_case_class_name"),
    "",
  ].join(".");
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
