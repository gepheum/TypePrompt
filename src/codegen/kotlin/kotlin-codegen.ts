import type {
  ValidCompilationResult,
  ValidNamespaceResult,
} from "../../compiler/compiler-types.js";
import type { Config } from "../../config/config-parser.js";
import type {
  Field,
  Interface,
  NamingHint,
  Optional,
  Schema,
  Type,
  TypeNameView,
  Union,
} from "../../schema/schema-types.js";
import { isLiteralType } from "../../schema/schema-utils.js";
import { resolveType } from "../../schema/type-resolver.js";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import { capitalize, toPascalCase } from "../../util/casing.js";
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
  const { templates } = compilationResult;

  return coalesceEmptyLines(
    [
      `package ${kotlinConfig.package};`,
      STATIC_SNIPPETS["kotlin-imports"],
      // reformat(writePromptsInterface(compilationResult)),
      // STATIC_SNIPPETS["typescript-top-level"],
      reformat(
        [
          // writeTemplateIdEnum(Object.values(templates)),
          // writeToolsType(compilationResult),
          // writeInputOutputTypes(compilationResult),
          writeUserDefinedDatatypes(compilationResult),
          // writeZodSchemas(compilationResult),
          // writeSpecDatatypes(),
          // writeTemplatesData(compilationResult),
        ].join("\n\n"),
      ),
      // STATIC_SNIPPETS["typescript-logic"],
    ].join("\n\n"),
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
): string {
  const unionContext = makeUnionContext(compilationResult);
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
          context: "top-level",
          typePrefix: "Schema.Meta.",
        },
      )
    : "Nothing?";
  lines.push(
    `typealias Meta = ${metaType}\n`,
    "/** Namespace containing the user-defined datatypes. */",
    "object Schema {",
  );
  if (anyTypes(metaSchema)) {
    lines.push(
      "object Meta {",
      writeSchema(metaSchema, unionContext, {
        typePrefix: "Schema.Meta.",
        context: "meta",
      }),
      "}\n",
    );
  }

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    const namespaceName = toKotlinName(namespace.name);
    const typePrefixBase = singleNamespace
      ? "Schema."
      : `Schema.${namespaceName}.`;
    const sharedTypePrefix = typePrefixBase.concat("Shared.");
    if (anyTypes(namespace.schema)) {
      lines.push("object Shared {");
      lines.push(
        writeSchema(namespace.schema, unionContext, {
          context: "namespace",
          typePrefix: sharedTypePrefix,
        }),
      );
      lines.push("}\n");
    }
    for (const template of namespace.templates) {
      const templateName = toKotlinName(template.template.name.text);
      const typePrefix = typePrefixBase.concat(templateName, ".");
      lines.push(`object ${templateName} {`);
      lines.push(
        writeSchema(template.schema, unionContext, {
          context: "template",
          typePrefix,
          sharedTypePrefix,
        }),
      );
      lines.push("}\n");
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = toKotlinName(capitalize(tool.tool.name.text));
      const typePrefix = typePrefixBase.concat(toolName, ".");
      lines.push(`object ${toolName} {\n`);
      lines.push(
        writeSchema(tool.schema, unionContext, {
          context: "tool",
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
      const namespaceName = toKotlinName(namespace.name);
      lines.push(`object ${namespaceName} {`);
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

type WriteSchemaOptions =
  | {
      readonly context: "meta" | "namespace" | "top-level";
      readonly typePrefix: string;
    }
  | {
      readonly context: "template" | "tool";
      readonly typePrefix: string;
      readonly sharedTypePrefix: string;
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
  const isDataClass = fields.some((f) => !isLiteralType(f.type));
  const lines = [
    "@OptIn(ExperimentalSerializationApi::class)",
    "@Serializable",
  ];
  const discriminant = unionContext.intMemberToStringDiscriminant.get(type);
  if (discriminant) {
    lines.push(`@SerialName("${discriminant}")`);
  }
  lines.push((isDataClass ? "data " : "").concat(`class ${typeName}(`));

  for (const field of fields) {
    const type = resolveType(field.type, schema);
    if (isLiteralType(type)) continue;
    const name = toKotlinName(field.name.text);
    const fieldType = writeType(type, schema, options);
    const override = unionContext.overrideFields.has(field) ? "override " : "";
    lines.push(...wrapKDoc(field.doc));
    lines.push(`${override}val ${name}: ${fieldType},`);
  }
  const interfaces = unionContext.intMemberToUnionRefs.get(type);
  const implementClause = interfaces ? " : ".concat(interfaces.join(", ")) : "";
  lines.push(`)${implementClause} {`);
  for (const field of fields) {
    const type = resolveType(field.type, schema);
    if (!isLiteralType(type)) continue;
    const name = toKotlinName(field.name.text);
    const fieldType = type.kind === "string-literal" ? "String" : "Boolean";
    const literal = JSON.stringify(type.value);
    const override = unionContext.overrideFields.has(field) ? "override " : "";
    lines.push(...wrapKDoc(field.doc));
    lines.push("@EncodeDefault");
    lines.push(`${override}val ${name}: ${fieldType} get() = ${literal}`);
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
        const kotlinName = toPascalCase(member.value);
        if (kotlinName !== member.value) {
          lines.push(`@SerialName("${member.value}")`);
        }
        lines.push(kotlinName.concat(","));
      }
      lines.push("}");
      break;
    }
    case "interfaces": {
      const { discriminants, discriminator } = members;
      if (discriminants.type === "string") {
        lines.push(
          "@OptIn(ExperimentalSerializationApi::class)",
          "@Serializable",
          `@JsonClassDiscriminator("${discriminator}")`,
        );
      } else {
        // kotlinx.serialization only supports String values for discriminator fields
        // out of the box
        const _: "boolean" = discriminants.type;
        lines.push(`@Serializable(with = ${typeName}_Serializer::class)`);
      }
      lines.push(`sealed interface ${typeName} {`);
      for (const member of members.commonFields) {
        const name = toKotlinName(member.name);
        if (isLiteralType(member.type)) continue;
        const type = writeType(member.type, schema, options);
        lines.push(`val ${name}: ${type}`);
      }
      lines.push("}");
      if (discriminants.type === "boolean") {
        const writeSerializer = (discriminant: boolean): string => {
          const { resolved } = members.members[String(discriminant)]!;
          return writeType(resolved, schema, options).concat(".serializer()");
        };
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
            `return if (element.jsonObject["${discriminator}"]`,
            `jsonPrimitive?.booleanOrNull == true) {`,
          ].join("?."),
          writeSerializer(true),
          "} else {",
          writeSerializer(false),
          "}",
          "}",
          "}\n",
        );
      }
    }
  }
  return lines.join("\n");
}

function writeType(
  type: Type | Optional | TypeNameView,
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
    case "interface":
    case "union": {
      const { context, typePrefix } = options;
      let namingHint = schema.namingHints.defaultScope.get(type);
      if (namingHint) {
        if (context === "top-level") {
          return typePrefix.concat(makeNameFromHint(namingHint));
        } else {
          return makeNameFromHint(namingHint!);
        }
      } else if (options.context === "template" || options.context === "tool") {
        namingHint = schema.namingHints.shared.get(type);
        return options.sharedTypePrefix.concat(makeNameFromHint(namingHint!));
      } else {
        throw new Error();
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
      const templateName = template.template.name.text;
      processSchema(template.schema, typePrefixBase.concat(templateName, "."));
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = capitalize(tool.tool.name.text);
      processSchema(tool.schema, typePrefixBase.concat(toolName, "."));
    }
  }

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
  "EncodeDefault",
  "ExperimentalSerializationApi",
  "Int",
  "JsonClassDiscriminator",
  "JsonContentPolymorphicSerializer",
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
