import type {
  Template,
  Tool,
  ValidatedTool,
  ValidCompilationResult,
  ValidTemplate,
} from "../../compiler/compiler-types.js";
import { DEFAULT_NAMESPACE } from "../../compiler/default-namespace.js";
import { getId } from "../../compiler/ids.js";
import type { Config } from "../../config/config-parser.js";
import { NullableType } from "../../expression/expression-types.js";
import { resolveFieldType } from "../../expression/get-field-type.js";
import { runtimeTypesSchema } from "../../runtime/runtime-types-schema.js";
import { makeTemplates } from "../../runtime/spec-maker.js";
import { NamingHint, Schema, Type } from "../../schema/schema-types.js";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import { camelToSnakeCase, capitalize } from "../../util/casing.js";
import type { OutputFile } from "../codegen-types.js";

export function generatePythonCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const pyConfig = config.gen.python;
  if (!pyConfig || pyConfig.enabled === false) {
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
  const { metaSchema, namespaces, templates, tools } = compilationResult;

  return [
    STATIC_SNIPPETS["python-imports"],
    scaleIndenting(writePromptMaker(Object.values(templates))),
    STATIC_SNIPPETS["python-public-types"],
    scaleIndenting(
      [
        writeTemplateIdEnum(Object.values(templates)),
        writeUserDefinedDatatypes(compilationResult),
        writeToolImplProtocols(compilationResult),
        writeToolNameToMethodName(Object.values(tools)),
        writePydanticTypeAdapters(
          Object.values(templates),
          Object.values(tools),
        ),
        writeSpecDatatypes(),
        writeTemplatesData(compilationResult),
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

function writePromptMaker(templates: readonly ValidTemplate[]): string {
  const writeOverloadSig = (t: ValidTemplate): readonly string[] => {
    const id = getId(t.template);
    const typePrefix = getTypePrefix(t.template);
    let toolImpls: readonly string[];
    if (Object.keys(t.tools).length <= 0) {
      toolImpls = [];
    } else {
      const ref = getToolImplsRef(t.template);
      toolImpls = [`  ${ref},`];
    }
    return [
      " def get_template(",
      "  self,",
      `  id: Literal['${id}'],`,
      " ) -> Template[",
      `  ${typePrefix}Input,`,
      `  ${typePrefix}Output,`,
      ...toolImpls,
      " ]:",
    ];
  };

  const lines = [
    "@dataclass(frozen=True)",
    "class PromptMaker:",
    " _data: _internal.Templates | None = None",
  ];
  if (templates.length <= 0) {
    // pass
  } else {
    lines.push("");
    if (templates.length === 1) {
      const template = templates[0]!;
      lines.push(...writeOverloadSig(template));
    } else {
      for (const template of templates) {
        lines.push(" @overload");
        lines.push(...writeOverloadSig(template));
        lines.push("  ...");
      }
      lines.push(" def get_template(self, id: TemplateId) -> Template:");
    }
    lines.push("  return _get_template_impl(id, self._data)");
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
  const lines = [
    "@final",
    "class schema(_StaticClass):",
    ' """Contains the user-defined datatypes organized by namespace."""',
    "",
    " @final",
    " class meta(_StaticClass):",
    writeSchema(compilationResult.metaSchema, {
      typePrefix: "schema.meta.",
      indent: "  ",
      requiredTypes: ["Meta"],
    }),
  ];
  for (const namespace of Object.values(compilationResult.namespaces)) {
    if (
      namespace.schema.namingHints.defaultScope.size <= 0 &&
      namespace.templates.length <= 0 &&
      Object.keys(namespace.tools).length <= 0
    ) {
      continue;
    }
    const namespaceName = toPyName(namespace.name, "snake_case_class_name");
    lines.push(` @final`);
    lines.push(` class ${namespaceName}(_StaticClass):`);
    if (namespace.schema.namingHints.defaultScope.size >= 1) {
      lines.push(`  @final`);
      lines.push("  class shared(_StaticClass):");
      lines.push(
        writeSchema(namespace.schema, {
          typePrefix: `schema.${namespaceName}.shared.`,
          indent: "  ",
        }),
      );
    }
    for (const template of namespace.templates) {
      const templateName = toPyName(
        template.template.name.text,
        "snake_case_class_name",
      );
      lines.push(`  @final`);
      lines.push(`  class ${templateName}(_StaticClass):`);
      lines.push(
        writeSchema(template.schema, {
          typePrefix: `schema.${namespaceName}.${templateName}.`,
          sharedTypePrefix: `schema.${namespaceName}.shared.`,
          indent: "   ",
          requiredTypes: ["Input", "Output"],
        }),
      );
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = toPyName(tool.tool.name.text, "snake_case_class_name");
      lines.push(`  @final`);
      lines.push(`  class ${toolName}(_StaticClass):`);
      lines.push(
        writeSchema(tool.schema, {
          typePrefix: `schema.${namespaceName}.${toolName}.`,
          sharedTypePrefix: `schema.${namespaceName}.shared.`,
          indent: "   ",
          requiredTypes: ["Input", "Output"],
        }),
      );
    }
  }
  return lines.join("\n");
}

function writeToolImplProtocols(
  compilationResult: ValidCompilationResult,
): string {
  const namespaces = Object.values(compilationResult.namespaces).filter(
    (namespace) => namespace.templates.length >= 1,
  );
  if (namespaces.length <= 0) return "";
  const lines = ["@final", "class tools(_StaticClass):"];
  for (const namespace of namespaces) {
    const namespaceName = toPyName(namespace.name, "snake_case_class_name");
    lines.push(` @final`);
    lines.push(` class ${namespaceName}(_StaticClass):`);
    for (const template of namespace.templates) {
      const { tools } = template;
      const toolNames = Object.keys(tools);
      const templateName = toPyName(
        template.template.name.text,
        "snake_case_class_name",
      );
      lines.push(`  @final`);
      lines.push(`  class ${templateName}(_StaticClass):`);
      if (toolNames.length > 0) {
        lines.push("   class ToolImpls(Protocol):");
        lines.push(
          '    """Protocol for object implementing the tools callable by the LLM."""',
        );
        for (const [toolName, tool] of Object.entries(template.tools)) {
          const methodName = toPyName(toolName, "snake_case_class_name");
          const typePrefix = getTypePrefix(tool.tool.tool);
          lines.push(`    async def ${methodName}(`);
          lines.push(`     self,`);
          lines.push(`     input: ${typePrefix}Input,`);
          lines.push(`    ) -> ${typePrefix}Output:`);
          lines.push(`     ...`);
        }
        lines.push("");
      }
      if (toolNames.length <= 0) {
        lines.push("   type ToolName = Never");
      } else {
        const commaSeparatedToolNames = toolNames.map(
          (name) => `    '${name}',`,
        );
        lines.push("   type ToolName = Literal[");
        lines.push(...commaSeparatedToolNames);
        lines.push("   ]");
        lines.push("");
        lines.push(
          "   # Tuple of all tool names callable by the LLM for this template.",
        );
        lines.push("   TOOL_NAMES: Final = (");
        lines.push(...commaSeparatedToolNames);
        lines.push("   )");
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}

function writeToolNameToMethodName(tools: readonly ValidatedTool[]): string {
  if (tools.length <= 0) return "";
  const seenToolNames = new Set<string>();
  const lines = ["_TOOL_NAME_TO_METHOD_NAME: Mapping[str, str] = {"];
  for (const tool of tools) {
    const toolName = tool.tool.name.text;
    if (seenToolNames.has(toolName)) continue;
    seenToolNames.add(toolName);
    const methodName = toPyName(toolName, "snake_case_class_name");
    lines.push(` '${toolName}': '${methodName}',`);
  }
  lines.push(
    ...[
      "}",
      "",
      "",
      "def tool_name_to_method_name(tool_name: str) -> str:",
      " return _TOOL_NAME_TO_METHOD_NAME[tool_name]",
    ],
  );
  return lines.join("\n");
}

function writePydanticTypeAdapters(
  templates: readonly ValidTemplate[],
  tools: readonly ValidatedTool[],
): string {
  const lines = ["_type_adapters: Final = {"];
  const writeEntry = (
    input: ValidTemplate | ValidatedTool,
    named: Template | Tool,
  ): void => {
    const id = getId(named);
    const typePrefix = getTypePrefix(named);
    lines.push(` "${id}": (`);
    lines.push(`  pydantic.TypeAdapter(${typePrefix}Input),`);
    lines.push(`  pydantic.TypeAdapter(${typePrefix}Output),`);
    lines.push(" ),");
  };
  for (const template of templates) {
    writeEntry(template, template.template);
  }
  for (const tool of tools) {
    writeEntry(tool, tool.tool);
  }
  lines.push("}");
  return lines.join("\n");
}

function writeSpecDatatypes(): string {
  const lines = [
    "@final",
    "class _internal(_StaticClass):",
    writeSchema(runtimeTypesSchema, {
      typePrefix: "_internal.",
      indent: " ",
    }),
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
    readonly indent: " " | "  " | "   ";
    readonly requiredTypes?: readonly string[];
  },
): string {
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
            resolveFieldType(field, schema),
            schema,
            options,
          );
          lines.push(...writeComment(field.doc, " "));
          const pyName = toPyName(field.name.text, "field_name");
          if (pyName === field.name.text) {
            if (field.optional) {
              lines.push(` ${pyName}: ${type} = None`);
            } else {
              lines.push(` ${pyName}: ${type}`);
            }
          } else {
            lines.push(` ${pyName}: ${type} = pydantic.Field(`);
            if (field.optional) {
              lines.push("  default=None,");
            }
            const aliasChoices = [field.name.text, pyName]
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
              const memberType = writeType(member, schema, options);
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
        lines.push(...["", ""]);
      }
    } else {
      lines.push(`type ${requiredType} = Literal[None]`);
      lines.push(...["", ""]);
    }
  }

  const { indent } = options;
  return lines
    .map((line) => (line.length <= 0 ? line : indent.concat(line)))
    .join("\n");
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

function writeType(
  type: Type | NullableType,
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
    case "nullable": {
      const valueType = writeType(type.type, schema, options);
      return type.type.kind === "any" ? valueType : valueType.concat(" | None");
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
                capitalize(piece.discriminant.value),
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

function toPyName(
  camelCaseName: string,
  type: "field_name" | "ClassName" | "snake_case_class_name",
): string {
  let identifier: string;
  let conflict: boolean;
  switch (type) {
    case "field_name": {
      identifier = camelToSnakeCase(camelCaseName);
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
      identifier = camelToSnakeCase(camelCaseName);
      conflict = PYTHON_HARD_KEYWORDS.has(identifier);
      break;
    }
  }
  return conflict ? identifier.concat("_") : identifier;
}

function getTypePrefix(input: Template | Tool): string {
  return [
    "schema",
    toPyName(
      input.namespace?.text ?? DEFAULT_NAMESPACE,
      "snake_case_class_name",
    ),
    toPyName(input.name.text, "snake_case_class_name"),
    "",
  ].join(".");
}

function getToolImplsRef(input: Template): string {
  return [
    "tools",
    toPyName(
      input.namespace?.text ?? DEFAULT_NAMESPACE,
      "snake_case_class_name",
    ),
    toPyName(input.name.text, "snake_case_class_name"),
    "ToolImpls",
  ].join(".");
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
