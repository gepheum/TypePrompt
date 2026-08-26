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
  Union,
} from "../../schema/schema-types.js";
import { isLiteralType } from "../../schema/schema-utils.js";
import { resolveType } from "../../schema/type-resolver.js";
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
      content: writeAll(compilationResult),
    },
  ];
}

function writeAll(compilationResult: ValidCompilationResult): string {
  const { templates } = compilationResult;

  return coalesceEmptyLines(
    [
      // STATIC_SNIPPETS["typescript-imports"],
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
  const lines = [
    "typealias Meta = Schema.Meta.Meta;\n",
    "/** Namespace containing the user-defined datatypes. */",
    "object Schema {",
    "object Meta {",
  ];
  if (anyTypes(metaSchema)) {
    lines.push(
      writeSchema(
        metaSchema,
        {
          typePrefix: "Schema.Meta.",
          requiredTypes: ["Meta"],
        },
        unionContext,
      ),
    );
  } else {
    lines.push("export type Meta = Nothing?;\n");
  }
  lines.push("}\n");

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    const namespaceName: string = namespace.name;
    const typePrefixBase = singleNamespace
      ? "Schema."
      : `Schema.${namespaceName}.`;
    const sharedTypePrefix = typePrefixBase.concat("Shared.");
    if (anyTypes(namespace.schema)) {
      lines.push("object Shared {");
      lines.push(
        writeSchema(
          namespace.schema,
          {
            typePrefix: sharedTypePrefix,
          },
          unionContext,
        ),
      );
      lines.push("}\n");
    }
    for (const template of namespace.templates) {
      const templateName = template.template.name.text;
      lines.push(`object ${templateName} {`);
      lines.push(
        writeSchema(
          template.schema,
          {
            typePrefix: typePrefixBase.concat(templateName, "."),
            sharedTypePrefix,
            requiredTypes: ["Input", "Output"],
          },
          unionContext,
        ),
      );
      lines.push("}\n");
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = capitalize(tool.tool.name.text);
      lines.push(`export namespace ${toolName} {\n`);
      lines.push(
        writeSchema(
          tool.schema,
          {
            typePrefix: typePrefixBase.concat(toolName, "."),
            sharedTypePrefix,
            requiredTypes: ["Input", "Output"],
          },
          unionContext,
        ),
      );
      lines.push("}\n");
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace);
  } else {
    for (const namespace of Object.values(namespaces)) {
      lines.push(`object ${namespace.name} {`);
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
  readonly typePrefix: string;
  readonly sharedTypePrefix?: string;
  readonly requiredTypes?: readonly string[];
  readonly isPrivate?: true;
};

function writeSchema(
  schema: Schema,
  options: WriteSchemaOptions,
  context: UnionContext,
): string {
  const { isPrivate, typePrefix } = options;
  const lines: string[] = [];
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const name = makeNameFromHint(namingHint);
    if (!isPrivate) {
      lines.push(`// Exported as '${typePrefix}${name}'`);
    }
    lines.push(...wrapKDoc(namingHint.doc));
    switch (type.kind) {
      case "interface": {
        lines.push(
          writeTypepromptInterface(type, name, schema, options, context),
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

  for (const requiredType of options.requiredTypes ?? []) {
    const declaration = schema.typeDeclarations[requiredType];
    if (declaration) {
      if (
        declaration.valueType.kind !== "interface" &&
        declaration.valueType.kind !== "union"
      ) {
        const type = writeType(declaration.valueType, schema, options);
        lines.push(`typealias ${requiredType} = ${type}\n`);
      }
    } else {
      lines.push(`typealias ${requiredType} = Unknown?\n`);
    }
  }

  return lines.join("\n");
}

function writeTypepromptInterface(
  type: Interface,
  typeName: string,
  schema: Schema,
  options: WriteSchemaOptions,
  context: UnionContext,
): string {
  const fields = Object.values(type.fields);
  const isDataClass = fields.some((f) => !isLiteralType(f.type));
  const lines = [
    "@Serializable",
    (isDataClass ? "data " : "").concat(`class ${typeName}(`),
  ];
  for (const field of fields) {
    const type = resolveType(field.type, schema);
    if (isLiteralType(type)) continue;
    lines.push(...wrapKDoc(field.doc));
    const name = toKotlinName(field.name.text);
    const fieldType = writeType(type, schema, options);
    lines.push(`val ${name}: ${fieldType}`);
  }
  const interfaces = context.interfaceMemberToUnionRefs.get(type);
  const implementClause = interfaces ? ": ".concat(interfaces.join(", ")) : "";
  lines.push(`)${implementClause} {`);
  for (const field of fields) {
    const type = resolveType(field.type, schema);
    if (!isLiteralType(type)) continue;
    const name = toKotlinName(field.name.text);
    const fieldType = type.kind === "string-literal" ? "String" : "Bool";
    const literal = JSON.stringify(type.value);
    lines.push(...wrapKDoc(field.doc));
    lines.push(`val ${name}: ${fieldType} get() = ${literal}`);
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
        lines.push(kotlinName);
      }
      lines.push("}");
      break;
    }
    case "interfaces": {
      lines.push(`sealed interface ${typeName} {`);
      for (const member of members.commonFields) {
        const name = toKotlinName(member.name);
        if (isLiteralType(member.type)) continue;
        const type = writeType(member.type, schema, options);
        lines.push(`val ${name}: ${type}`);
      }
      lines.push("}");
    }
  }
  return lines.join("\n");
}

function writeType(
  type: Type | Optional,
  schema: Schema,
  options: {
    readonly sharedTypePrefix?: string;
  },
): string {
  switch (type.kind) {
    case "any": {
      return "unknown";
    }
    case "array": {
      const { elementType } = type;
      const writtenElement = writeType(elementType, schema, options);
      if (elementType.kind === "union") {
        return `readonly (${writtenElement})[]`;
      } else {
        return `readonly ${writtenElement}[]`;
      }
    }
    case "interface": {
      const fields = Object.entries(type.fields);
      if (fields.length <= 0) {
        return "ReadonlyRecord<string, never>";
      }
      let result = "{\n";
      for (const [fieldName, field] of fields) {
        // result += [
        //   wrapKDoc(field.doc),
        //   "readonly ",
        //   fieldName,
        //   field.optional ? "?: " : ": ",
        //   writeType(field.type, schema, options),
        //   ";\n",
        // ].join("");
      }
      result += "}";
      return result;
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
    case "shared-type-name": {
      if (!options.sharedTypePrefix) throw new Error();
      return options.sharedTypePrefix.concat(type.name.text);
    }
    case "type-name": {
      return type.name.text;
    }
    case "union": {
      return "";
      // return "(\n"
      //   .concat(
      //     type.members
      //       .map((m) => `| ${writeType(m, schema, options)}\n`)
      //       .join(""),
      //   )
      //   .concat(")");
    }
  }
}

function makeNameFromHint(hint: NamingHint): string {
  return hint.namePieces
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
  readonly interfaceMemberToUnionRefs: Map<Interface, readonly string[]>;
  readonly overrideFields: Set<Field>;
};

function makeUnionContext(
  compilationResult: ValidCompilationResult,
): UnionContext {
  const interfaceMemberToUnionRefs = new Map<Interface, string[]>();
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
        const unionRefs = interfaceMemberToUnionRefs.get(member) ?? [];
        if (unionRefs.length <= 0) {
          interfaceMemberToUnionRefs.set(member, unionRefs);
        }
        unionRefs.push(unionRef);

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
    interfaceMemberToUnionRefs,
    overrideFields,
  };
}

function toKotlinName(name: string): string {
  return KOTLIN_HARD_KEYWORDS.has(name) ? `\`${name}\`` : name;
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
      indent = indent.slice(0, -2);
    }
    const starPrefix = line.startsWith("*") ? " " : "";
    outputLines.push(line.length <= 0 ? line : `${indent}${starPrefix}${line}`);
    if (
      line.endsWith("{") ||
      line.endsWith("(") ||
      line.endsWith("[") ||
      line.endsWith("<")
    ) {
      indent = indent + "  ";
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
