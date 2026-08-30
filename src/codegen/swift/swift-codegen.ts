import type {
  ValidCompilationResult,
  ValidNamespaceResult,
} from "../../compiler/compiler-types.js";
import type { Config } from "../../config/config-parser.js";
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
import { capitalize, toCamelCase, toPascalCase } from "../../util/casing.js";
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
  config: { swiftNamespace: string },
): string {
  const { templates } = compilationResult;
  const { swiftNamespace } = config;

  return coalesceEmptyLines(
    reformat(
      [
        STATIC_SNIPPETS["swift-imports"],
        // reformat(writePromptsInterface(compilationResult)),
        // STATIC_SNIPPETS["typescript-top-level"],
        `enum ${swiftNamespace} {`,
        // writeTemplateIdEnum(Object.values(templates)),
        // writeToolsType(compilationResult),
        // writeInputOutputTypes(compilationResult),
        writeUserDefinedDatatypes(compilationResult, config),
        // writeZodSchemas(compilationResult),
        // writeSpecDatatypes(),
        // writeTemplatesData(compilationResult),
        STATIC_SNIPPETS["swift-logic"],
        "}",
      ].join("\n\n"),
    ),
  ).concat("\n");
}

// function writePromptsInterface(
//   compilationResult: ValidCompilationResult,
// ): string {
//   const writeTemplates = (namespace: ValidNamespaceResult): string => {
//     const { templates } = namespace;
//     if (templates.length <= 0) {
//       return "ReadonlyRecord<string, never>";
//     } else {
//       return [
//         "{",
//         ...Object.values(
//           namespace.templates.map((t) =>
//             [
//               "// Defined in '",
//               t.template.sourcePath,
//               "'\nreadonly ",
//               uncapitalize(t.template.name.text),
//               ': Template<"',
//               getId(t.template),
//               '">;',
//             ].join(""),
//           ),
//         ),
//         "}",
//       ].join("\n");
//     }
//   };
//   const lines = ["/** Entry point for building prompts. */"];
//   if (compilationResult.singleNamespace) {
//     const templates = writeTemplates(compilationResult.singleNamespace);
//     lines.push(`export type Prompts = ${templates};`);
//   } else {
//     lines.push("export type Prompts = {");
//     for (const namespace of Object.values(compilationResult.namespaces)) {
//       const namespaceName = uncapitalize(namespace.name);
//       const templates = writeTemplates(namespace);
//       lines.push(`readonly ${namespaceName}: ${templates};`);
//     }
//     lines.push("};");
//   }
//   return lines.join("\n");
// }

// function writeTemplateIdEnum(templates: readonly ValidTemplate[]): string {
//   const lines = [
//     "/** Uniquely identifies a prompt template. */",
//     "export type TemplateId = (",
//   ];
//   if (templates.length <= 0) {
//     lines.push(" never");
//   } else {
//     for (const template of templates) {
//       const templateId = getId(template.template);
//       lines.push(`| "${templateId}"`);
//     }
//   }
//   lines.push(");");
//   return lines.join("\n");
// }

// function writeToolsType(compilationResult: ValidCompilationResult): string {
//   const { singleNamespace, templates } = compilationResult;
//   const lines = [
//     "/** The tools available from the given template. */",
//     "export type Tools<Id extends TemplateId> = {",
//   ];
//   for (const template of Object.values(templates)) {
//     const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
//     const templateId = getId(template.template);
//     lines.push(`"${templateId}": {`);
//     for (const tool of Object.values(template.tools)) {
//       const toolName = tool.tool.tool.name.text;
//       const typePrefix = singleNamespace
//         ? `$.${capitalize(toolName)}.`
//         : `$.${namespace}.${capitalize(toolName)}.`;
//       lines.push(`${toolName}: Tool<`);
//       lines.push(`${typePrefix}Input,`);
//       lines.push(`${typePrefix}Output`);
//       lines.push(">,");
//     }
//     lines.push("},");
//   }
//   lines.push("}[Id];");
//   return lines.join("\n");
// }

// function writeInputOutputTypes(
//   compilationResult: ValidCompilationResult,
// ): string {
//   const { singleNamespace, templates } = compilationResult;
//   const lines: string[] = [];

//   for (const what of ["Input", "Output"]) {
//     lines.push(`export type ${what}<Id extends TemplateId> = {`);
//     for (const template of Object.values(templates)) {
//       const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
//       const templateName = template.template.name.text;
//       const templateId = `${namespace}:${templateName}`;
//       lines.push(
//         singleNamespace
//           ? `"${templateId}": $.${templateName}.${what};`
//           : `"${templateId}": $.${namespace}.${templateName}.${what};`,
//       );
//     }
//     lines.push("}[Id];");
//     lines.push("");
//   }

//   return lines.join("\n");
// }

function writeUserDefinedDatatypes(
  compilationResult: ValidCompilationResult,
  config: { swiftNamespace: string },
): string {
  const { metaSchema, namespaces, singleNamespace } = compilationResult;
  const anyTypes = (schema: Schema): boolean =>
    Object.keys(schema.typeDeclarations).length > 0;
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
          typePrefix: `${config.swiftNamespace}.Schema.Meta.`,
        },
      )
    : "Nothing?";
  lines.push(
    "/// Namespace containing the user-defined datatypes.",
    "enum Schema {",
  );
  if (anyTypes(metaSchema)) {
    lines.push(
      "enum Meta {",
      writeSchema(metaSchema, {
        typePrefix: `${config.swiftNamespace}.Schema.Meta.`,
      }),
      "}\n",
    );
  }

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    const namespaceName = toSwiftName(namespace.name);
    const typePrefixBase = singleNamespace
      ? `${config.swiftNamespace}.Schema.`
      : `${config.swiftNamespace}.Schema.${namespaceName}.`;
    const sharedTypePrefix = `${config.swiftNamespace}.Schema.Shared.`;
    if (anyTypes(namespace.schema)) {
      lines.push("enum Shared {");
      lines.push(
        writeSchema(namespace.schema, {
          typePrefix: sharedTypePrefix,
        }),
      );
      lines.push("}\n");
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
      lines.push("}\n");
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
      lines.push("}\n");
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
  lines.push("}\n");
  return lines.join("\n");
}

// function writeZodSchemas(compilationResult: ValidCompilationResult): string {
//   const { templates, tools, singleNamespace } = compilationResult;
//   const lines = ["const zodSchemas = {"];

//   const writeEntry = (
//     input: ValidTemplate | ValidatedTool,
//     named: Template | Tool,
//   ): void => {
//     const namespace = named.namespace?.text ?? DEFAULT_NAMESPACE;
//     const typePrefixBase = singleNamespace ? "$." : `$.${namespace}.`;
//     const name = named.name.text;
//     const options = {
//       defaultScopeTypePrefix: `${typePrefixBase}${capitalize(name)}.`,
//       sharedTypePrefix: `${typePrefixBase}Shared.`,
//     } as const;
//     const zodInputType = writeZodType(input.schema, "Input", options);
//     const zodOutputType = writeZodType(input.schema, "Output", options);
//     lines.push(`"${namespace}:${name}": {`);
//     lines.push(`input: ${zodInputType},`);
//     lines.push(`output: ${zodOutputType},`);
//     lines.push("},");
//   };

//   for (const template of Object.values(templates)) {
//     writeEntry(template, template.template);
//   }
//   for (const tool of Object.values(tools)) {
//     writeEntry(tool, tool.tool);
//   }
//   lines.push("} as const;");
//   return lines.join("\n");
// }

// function writeSpecDatatypes(): string {
//   const options = {
//     defaultScopeTypePrefix: "Spec.",
//     sharedTypePrefix: "Never.",
//   } as const;
//   const lines = [
//     "namespace Spec {",
//     writeSchema(runtimeTypesSchema, options),
//     "}",
//     "",
//     "const templatesSchema = " +
//       writeZodType(runtimeTypesSchema, "Templates", options) +
//       ";",
//   ];
//   return lines.join("\n");
// }

// function writeTemplatesData(compilationResult: ValidCompilationResult): string {
//   const templatesData = makeTemplates(compilationResult, {
//     includeJsonSchemas: false,
//   });
//   return (
//     "const TEMPLATES_DATA: Spec.Templates = " +
//     JSON.stringify(templatesData, undefined, 2) +
//     " as const;"
//   );
// }

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
    lines.push(`// Exported as '${typePrefix}${name}'`);
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
  const hasLiteralField = fields.some((f) => isLiteralType(f.type));
  lines.push(`struct ${typeName} : Codable {`);

  for (const field of fields) {
    const { type } = field;
    const name = toSwiftName(field.name.text);
    const fieldType = writeType(type, schema, options);
    lines.push(...wrapDocComment(field.doc));
    lines.push(`let ${name}: ${fieldType}`);
  }

  if (hasLiteralField) {
    lines.push("", "init(");
    for (const field of fields) {
      const { type } = field;
      if (isLiteralType(type)) continue;
      const name = toSwiftName(field.name.text);
      const fieldType = writeType(type, schema, options);
      lines.push(`${name}: ${fieldType},`);
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
    lines.push("}");
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
      lines.push(`enum ${typeName} : String, Codable {\n`);
      for (const member of members.members) {
        const swiftName = toSwiftName(toCamelCase(member.value));
        lines.push(`case ${swiftName} = ${JSON.stringify(member.value)}`);
      }
      lines.push("}");
      break;
    }
    case "interfaces": {
      const { discriminants, discriminator } = members;
      lines.push(`indirect enum ${typeName} : Codable {`);
      const caseEntries = Object.entries(members.members).map(
        ([discriminant, member]) => {
          const caseName = toSwiftName(
            ((): string => {
              switch (discriminants.type) {
                case "string":
                  return discriminator.concat(toPascalCase(discriminant));
                case "boolean":
                  return discriminant === "true"
                    ? discriminator
                    : "not".concat(capitalize(discriminator));
              }
            })(),
          );
          const type = writeType(member.resolved, schema, options);
          return { discriminant, caseName, type };
        },
      );

      for (const { caseName, type } of caseEntries) {
        lines.push(`case ${caseName}(${type})`);
      }

      for (const member of members.commonFields) {
        if (isLiteralType(member.type)) continue;
        const name = toSwiftName(member.name);
        const type = writeType(member.type, schema, options);
        lines.push("");
        if (member.doc) {
          lines.push(...wrapDocComment(member.doc));
        }
        lines.push(`var ${name}: ${type} {`);
        lines.push("switch self {");
        for (const { caseName } of caseEntries) {
          lines.push(`case .${caseName}(let value):`);
          lines.push(`return value.${name}`);
        }
        lines.push("}", "}");
      }

      lines.push("", "func encode(to encoder: any Encoder) throws {");
      lines.push("var container = encoder.singleValueContainer()");
      lines.push("switch self {");
      for (const { caseName } of caseEntries) {
        lines.push(`case .${caseName}(let value):`);
        lines.push("try container.encode(value)");
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
        for (const { discriminant, caseName, type } of caseEntries) {
          lines.push(
            `case "${discriminant}":`,
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
        for (const { discriminant, caseName, type } of caseEntries) {
          lines.push(
            `case ${discriminant}:`,
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

// function writeZodType(
//   schema: Schema,
//   typeName: string,
//   options: {
//     readonly defaultScopeTypePrefix: string;
//     readonly sharedTypePrefix: string;
//   },
// ): string {
//   const { defaultScopeTypePrefix, sharedTypePrefix } = options;

//   const makeTypeId = (name: string, scope: NameScope): string => {
//     switch (scope) {
//       case "defaultScope":
//         return name;
//       case "shared":
//         return "_".concat(name);
//     }
//   };

//   const getTypePrefix = (scope: NameScope): string => {
//     switch (scope) {
//       case "defaultScope":
//         return defaultScopeTypePrefix;
//       case "shared":
//         return sharedTypePrefix;
//     }
//   };

//   const getQualifiedTypeName = (typeName: string, scope: NameScope): string => {
//     return getTypePrefix(scope).concat(typeName);
//   };

//   const getTypeDeclarations = (scope: NameScope): TypeDeclarations => {
//     switch (scope) {
//       case "defaultScope":
//         return schema.typeDeclarations;
//       case "shared":
//         return schema.sharedDeclarations;
//     }
//   };

//   const typeIdToStatus: { [id: string]: "pending" | "done" } = {};
//   const defs: string[] = [];

//   const getVarName = (typeName: string, scope: NameScope): string => {
//     const uncapitalized = uncapitalize(makeTypeId(typeName, scope));
//     const prefix = ((): string => {
//       switch (scope) {
//         case "defaultScope":
//           return "";
//         case "shared":
//           return "_";
//       }
//     })();
//     return `${prefix}${uncapitalized}Schema`;
//   };

//   const populateVarDef = (typeName: string, scope: NameScope): void => {
//     const typeId = makeTypeId(typeName, scope);
//     if (typeIdToStatus[typeId]) return;
//     typeIdToStatus[typeId] = "pending";
//     const declarations = getTypeDeclarations(scope);
//     const declaration = declarations[typeName];
//     if (!declaration) {
//       throw new Error(`Type declaration not found for '${typeName}'`);
//     }
//     const { valueType } = declaration;
//     const directDeps = getNameDependencies(valueType, scope, schema, "direct");
//     for (const s of NAME_SCOPES) {
//       for (const dep of directDeps[s]) {
//         populateVarDef(dep, s);
//       }
//     }
//     const doc: string = declaration.doc;
//     const def = [
//       "const ",
//       getVarName(typeName, scope),
//       ": z.ZodType<",
//       getQualifiedTypeName(typeName, scope),
//       "> = ",
//       write(valueType, scope),
//       doc ? `.describe(${JSON.stringify(doc)})` : "",
//       ";",
//     ].join("");
//     typeIdToStatus[typeId] = "done";
//     defs.push(def);
//   };

//   const write = (type: Type, scope: NameScope): string => {
//     switch (type.kind) {
//       case "any": {
//         return "z.any()";
//       }
//       case "array": {
//         return write(type.elementType, scope).concat(".array()");
//       }
//       case "boolean-literal": {
//         return `z.literal(${type.value satisfies boolean})`;
//       }
//       case "interface": {
//         const fieldDefs: string[] = [];
//         for (const field of Object.values(type.fields)) {
//           const doc: string = field.doc;
//           fieldDefs.push(
//             [
//               field.name.text,
//               ": ",
//               write(field.type, scope),
//               field.optional ? ".optional()" : "",
//               doc ? `.describe(${JSON.stringify(doc)})` : "",
//               ",",
//             ].join(""),
//           );
//         }
//         return ["z.object({", ...fieldDefs, "})"].join("\n");
//       }
//       case "primitive": {
//         if (type.primitive.text === "integer") {
//           return "z.int32()";
//         } else {
//           return `z.${type.primitive.text}()`;
//         }
//       }
//       case "record": {
//         return [
//           "z.record(\n",
//           "z.string(),\n",
//           write(type.valueType, scope),
//           ",\n)",
//         ].join("");
//       }
//       case "shared-type-name": {
//         return getVarName(type.name.text, "shared");
//       }
//       case "string-literal": {
//         return `z.literal(${type.quotedName.text})`;
//       }
//       case "type-name": {
//         const typeName = type.name.text;
//         const typeId = makeTypeId(typeName, scope);
//         if (typeIdToStatus[typeId] === "done") {
//           return getVarName(typeName, scope);
//         } else {
//           // Need to use lazy
//           const varName = getVarName(typeName, scope);
//           const qualifiedTypeName = getQualifiedTypeName(typeName, scope);
//           return `z.lazy((): z.ZodType<${qualifiedTypeName}> => ${varName})`;
//         }
//       }
//       case "union": {
//         const members = schema.unionToMembers.get(type)!;
//         if (members.kind === "interfaces") {
//           return [
//             "z.discriminatedUnion(",
//             JSON.stringify(members.discriminator).concat(","),
//             "[",
//             ...Object.values(type.members).map((m) =>
//               write(m, scope).concat(","),
//             ),
//             "],",
//             ")",
//           ].join("\n");
//         } else {
//           return [
//             "z.enum([",
//             ...members.members.map((v) =>
//               JSON.stringify(v.value satisfies string).concat(","),
//             ),
//             "])",
//           ].join("\n");
//         }
//       }
//     }
//   };

//   populateVarDef(typeName, "defaultScope");
//   const qualifiedTypeName = getQualifiedTypeName(typeName, "defaultScope");
//   return [
//     `((): z.ZodType<${qualifiedTypeName}> => {`,
//     ...defs,
//     `return ${getVarName(typeName, "defaultScope")};`,
//     "})()",
//   ].join("\n");
// }

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
