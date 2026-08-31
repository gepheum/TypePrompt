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
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import { capitalize, toCamelCase, toPascalCase } from "../../util/casing.js";
import type { OutputFile } from "../codegen-types.js";

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
  return coalesceEmptyLines(
    [
      STATIC_SNIPPETS["dart-imports"],
      "",
      // STATIC_SNIPPETS["dart-imports"],
      // reformat(writePromptsInterface(compilationResult)),
      // STATIC_SNIPPETS["typescript-top-level"],
      reformat(
        [
          // writeTemplateIdEnum(Object.values(templates)),
          // writeToolsType(compilationResult),
          // writeInputOutputTypes(compilationResult),
          writeUserDefinedDatatypes(compilationResult),
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

  // const metaType = anyTypes(metaSchema)
  //   ? writeType(
  //       {
  //         kind: "type-name",
  //         name: { text: "Meta" },
  //       },
  //       metaSchema,
  //       {
  //         context: "top-level",
  //         typePrefix: "Schema.Meta.",
  //       },
  //     )
  //   : "Nothing?";
  lines.push(
    // `typealias Meta = ${metaType}\n`,
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
    const namespaceName = namespace.name;
    const typePrefixBase = singleNamespace ? "" : namespaceName.concat("_");
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
};

function writeSchema(
  schema: Schema,
  unionContext: UnionContext,
  options: WriteSchemaOptions,
): string {
  const lines: string[] = [];
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const name = makeNameFromHint(namingHint);
    lines.push(...wrapDocComment(namingHint.doc));
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
    const name = toDartName(field.name.text);
    const fieldType = writeType(type, schema, options);
    lines.push(...wrapDocComment(field.doc));
    if (unionContext.overrideFields.has(field)) {
      lines.push("@override");
    }
    lines.push(`final ${fieldType} ${name};`);
  }
  lines.push("");
  if (hasNonLiteralFields) {
    lines.push(`${className}({`);
    for (const field of fields) {
      const type = resolveType(field.type, schema);
      if (isLiteralType(type)) continue;
      const name = toDartName(field.name.text);
      const isOptional = type.kind === "optional";
      const required = isOptional ? "" : "required ";
      lines.push(`${required}this.${name},`);
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
    const name = field.name.text;
    const dartName = toDartName(name);
    const resolvedFieldType = resolveType(field.type, schema);
    if (isLiteralType(resolvedFieldType)) {
      const value = JSON.stringify(
        resolvedFieldType.value satisfies string | boolean,
      );
      lines.push(`"${name}": ${value},`);
    } else {
      const toJsonExpr = writeToJsonExpr(
        resolvedFieldType,
        dartName,
        schema,
        options,
      );
      lines.push(`"${name}": ${toJsonExpr},`);
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
    const name = field.name.text;
    const dartName = toDartName(name);
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
      lines.push(`factory ${className}.fromJson(String json) {`);
      lines.push("switch (json) {");
      for (const member of members.members) {
        const name = member.value;
        const dartName = toDartName(toCamelCase(name));
        lines.push(`case "${name}":`, `return ${dartName};`);
      }
      lines.push(
        "default:",
        'throw FormatException("Unknown json value: $json");',
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
      lines.push(`sealed class ${typePrefix}${typeName} {`);
      for (const commonField of members.commonFields) {
        const name = toDartName(commonField.name);
        if (isLiteralType(commonField.type)) continue;
        const type = writeType(commonField.type, schema, options);
        lines.push(
          ...wrapDocComment(commonField.doc ?? ""),
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
  type: Type | Optional,
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
      return writeType(type.innerType, schema, options).concat("?");
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
      const elementFromJsonExpr = writeFromJsonExpr(
        type.elementType,
        "e",
        schema,
        options,
      );
      if (elementFromJsonExpr === "e") {
        return inputExpr;
      } else if (elementFromJsonExpr.endsWith("(e)")) {
        return `${inputExpr}.map(${elementFromJsonExpr.slice(0, -3)}).toList()`;
      } else {
        return `${inputExpr}.map((e) => ${elementFromJsonExpr}).toList()`;
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
      const valueFromJsonExpr = writeFromJsonExpr(
        type.valueType,
        "v",
        schema,
        options,
      );
      return inputExpr.concat(
        `.map((k, v) => MapEntry(k, ${valueFromJsonExpr}))`,
      );
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

  return {
    intMemberToUnionRefs,
    intMemberToStringDiscriminant,
    overrideFields,
  };
}

function toDartName(name: string): string {
  return RESERVED_NAMES.has(name) ? name.concat("_") : name;
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
    } else if (line.endsWith(";")) {
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
