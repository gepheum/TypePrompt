import type { Config } from "@typeprompt/core/config/config-parser.js";
import type {
  Literal,
  Schema,
  Type,
  TypeDeclarations,
} from "@typeprompt/core/schema/schema-types.js";
import {
  getNameDependencies,
  NAME_SCOPES,
  NameScope,
  unwrapNullable as unwrapOptional,
} from "@typeprompt/core/schema/schema-utils.js";
import { capitalize, uncapitalize } from "@typeprompt/core/util/casing.js";
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
import { runtimeTypesSchema } from "../../runtime/runtime-types-schema.js";
import { makeTemplates } from "../../runtime/spec-maker.js";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import type { OutputFile } from "../codegen-types.js";

export function generateTypescriptCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const tsConfig = config.gen?.typescript;
  if (!tsConfig) {
    return [];
  }
  return [
    {
      path: tsConfig.file,
      content: writeAll(compilationResult),
    },
  ];
}

function writeAll(compilationResult: ValidCompilationResult): string {
  const { templates } = compilationResult;

  return coalesceEmptyLines(
    [
      STATIC_SNIPPETS["typescript-imports"],
      reformat(writePromptsInterface(compilationResult)),
      STATIC_SNIPPETS["typescript-public-types"],
      reformat(
        [
          writeTemplateIdEnum(Object.values(templates)),
          writeToolsType(compilationResult),
          writeInputOutputTypes(compilationResult),
          writeUserDefinedDatatypes(compilationResult),
          writeZodSchemas(compilationResult),
          writeSpecDatatypes(),
          writeTemplatesData(compilationResult),
        ].join("\n\n"),
      ),
      STATIC_SNIPPETS["typescript-logic"],
    ].join("\n\n"),
  );
}

function writePromptsInterface(
  compilationResult: ValidCompilationResult,
): string {
  const writeTemplates = (namespace: ValidNamespaceResult): string => {
    const { templates } = namespace;
    if (templates.length <= 0) {
      return "ReadonlyRecord<string, never>";
    } else {
      return [
        "{",
        ...Object.values(
          namespace.templates.map((t) =>
            [
              "// Defined in '",
              t.template.sourcePath,
              "'\nreadonly ",
              uncapitalize(t.template.name.text),
              ': Template<"',
              getId(t.template),
              '">;',
            ].join(""),
          ),
        ),
        "}",
      ].join("\n");
    }
  };
  const lines = ["/** Entry point for building prompts. */"];
  if (compilationResult.singleNamespace) {
    const templates = writeTemplates(compilationResult.singleNamespace);
    lines.push(`export type Prompts = ${templates};`);
  } else {
    lines.push("export type Prompts = {");
    for (const namespace of Object.values(compilationResult.namespaces)) {
      const tsNamespace = uncapitalize(namespace.name);
      const templates = writeTemplates(namespace);
      lines.push(`readonly ${tsNamespace}: ${templates};`);
    }
    lines.push("};");
  }
  return lines.join("\n");
}

function writeTemplateIdEnum(templates: readonly ValidTemplate[]): string {
  const lines = [
    "/** Uniquely identifies a prompt template. */",
    "export type TemplateId = (",
  ];
  if (templates.length <= 0) {
    lines.push(" never");
  } else {
    for (const template of templates) {
      const templateId = getId(template.template);
      lines.push(`| "${templateId}"`);
    }
  }
  lines.push(");");
  return lines.join("\n");
}

function writeToolsType(compilationResult: ValidCompilationResult): string {
  const { singleNamespace, templates } = compilationResult;
  const lines = [
    "/** The tools available from the given template. */",
    "export type Tools<Id extends TemplateId> = {",
  ];
  for (const template of Object.values(templates)) {
    const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const templateId = getId(template.template);
    lines.push(`"${templateId}": {`);
    for (const tool of Object.values(template.tools)) {
      const toolName = tool.tool.tool.name.text;
      const typePrefix = singleNamespace
        ? `Schema.${capitalize(toolName)}.`
        : `Schema.${namespace}.${capitalize(toolName)}.`;
      lines.push(`${toolName}: Tool<`);
      lines.push(`${typePrefix}Input,`);
      lines.push(`${typePrefix}Output`);
      lines.push(">,");
    }
    lines.push("},");
  }
  lines.push("}[Id];");
  return lines.join("\n");
}

function writeInputOutputTypes(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, templates } = compilationResult;
  const lines: string[] = [];

  for (const what of ["Input", "Output"]) {
    lines.push(`export type ${what}<Id extends TemplateId> = {`);
    for (const template of Object.values(templates)) {
      const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
      const templateName = template.template.name.text;
      const templateId = `${namespace}:${templateName}`;
      lines.push(
        singleNamespace
          ? `"${templateId}": Schema.${templateName}.${what};`
          : `"${templateId}": Schema.${namespace}.${templateName}.${what};`,
      );
    }
    lines.push("}[Id];");
    lines.push("");
  }

  return lines.join("\n");
}

function writeUserDefinedDatatypes(
  compilationResult: ValidCompilationResult,
): string {
  const { metaSchema, namespaces, singleNamespace } = compilationResult;
  const anyTypes = (schema: Schema): boolean =>
    Object.keys(schema.typeDeclarations).length >= 1;
  const lines = [
    "/** Metadata associated with a prompt. */",
    "export type Meta = Schema.Meta.Meta;\n",
    "/** Namespace containing the user-defined datatypes. */",
    "export namespace Schema {",
    "export namespace Meta {",
  ];
  if (anyTypes(metaSchema)) {
    lines.push(writeSchema(metaSchema, { sharedTypePrefix: "Never." }));
  } else {
    lines.push("export type Meta = never;\n");
  }
  lines.push("}\n");

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    if (anyTypes(namespace.schema)) {
      lines.push("export namespace Shared {");
      lines.push(writeSchema(namespace.schema, { sharedTypePrefix: "Never." }));
      lines.push("}\n");
    }
    const sharedTypePrefix = singleNamespace
      ? "Schema.Shared."
      : `Schema.${namespace.name}.Shared.`;
    for (const template of namespace.templates) {
      const templateName = template.template.name.text;
      lines.push(`export namespace ${templateName} {`);
      lines.push(writeSchema(template.schema, { sharedTypePrefix }));
      lines.push("}\n");
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = tool.tool.name.text;
      lines.push(`export namespace ${capitalize(toolName)} {\n`);
      lines.push(writeSchema(tool.schema, { sharedTypePrefix }));
      lines.push("}\n");
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace);
  } else {
    for (const namespace of Object.values(namespaces)) {
      lines.push(`export namespace ${namespace.name} {`);
      writeNamespace(namespace);
      lines.push("}\n");
    }
  }
  lines.push("}\n");
  return lines.join("\n");
}

function writeZodSchemas(compilationResult: ValidCompilationResult): string {
  const { templates, tools, singleNamespace } = compilationResult;
  const lines = ["const zodSchemas = {"];

  const writeEntry = (
    input: ValidTemplate | ValidatedTool,
    named: Template | Tool,
  ): void => {
    const namespace = named.namespace?.text ?? DEFAULT_NAMESPACE;
    const typePrefixBase = singleNamespace ? "Schema." : `Schema.${namespace}.`;
    const name = named.name.text;
    const options = {
      defaultScopeTypePrefix: `${typePrefixBase}${capitalize(name)}.`,
      sharedTypePrefix: `${typePrefixBase}Shared.`,
    } as const;
    const zodInputType = writeZodType(input.schema, "Input", options);
    const zodOutputType = writeZodType(input.schema, "Output", options);
    lines.push(`"${namespace}:${name}": {`);
    lines.push(`input: ${zodInputType},`);
    lines.push(`output: ${zodOutputType},`);
    lines.push("},");
  };

  for (const template of Object.values(templates)) {
    writeEntry(template, template.template);
  }
  for (const tool of Object.values(tools)) {
    writeEntry(tool, tool.tool);
  }
  lines.push("} as const;");
  return lines.join("\n");
}

function writeSpecDatatypes(): string {
  const options = {
    defaultScopeTypePrefix: "Spec.",
    sharedTypePrefix: "Never.",
  } as const;
  const lines = [
    "namespace Spec {",
    writeSchema(runtimeTypesSchema, options),
    "}",
    "",
    "const templatesSchema = " +
      writeZodType(runtimeTypesSchema, "Templates", options) +
      ";",
  ];
  return lines.join("\n");
}

function writeTemplatesData(compilationResult: ValidCompilationResult): string {
  const templatesData = makeTemplates(compilationResult);
  return (
    "const TEMPLATES_DATA: Spec.Templates = " +
    JSON.stringify(templatesData, undefined, 2) +
    " as const;"
  );
}

function writeSchema(
  schema: Schema,
  options: { readonly sharedTypePrefix: string },
): string {
  const lines: string[] = [];
  for (const typeDeclaration of Object.values(schema.typeDeclarations)) {
    const name = typeDeclaration.name.text;
    const jsdoc = wrapJsdoc(typeDeclaration.doc);
    const type = writeType(typeDeclaration.valueType, options);
    lines.push(`${jsdoc}export type ${name} = ${type};\n`);
  }
  return lines.join("\n");
}

function writeType(
  type: Type | Literal,
  options: {
    readonly sharedTypePrefix: string;
  },
): string {
  switch (type.kind) {
    case "any": {
      return "unknown";
    }
    case "array": {
      const { elementType } = type;
      const writtenElement = writeType(elementType, options);
      if (elementType.kind === "union") {
        return `readonly (${writtenElement})[]`;
      } else {
        return `readonly ${writtenElement}[]`;
      }
    }
    case "boolean-literal": {
      return type.span.text satisfies "true" | "false";
    }
    case "interface": {
      const fields = Object.entries(type.fields);
      if (fields.length <= 0) {
        return "ReadonlyRecord<string, never>";
      }
      let result = "{\n";
      for (const [fieldName, field] of fields) {
        const { type, isOptional } = unwrapOptional(field.type);
        result += [
          wrapJsdoc(field.doc),
          "readonly ",
          fieldName,
          isOptional ? "?: " : ": ",
          writeType(type, options),
          ";\n",
        ].join("");
      }
      result += "}";
      return result;
    }
    case "primitive": {
      if (type.primitive.text === "integer") {
        return "number";
      } else {
        return type.primitive.text;
      }
    }
    case "record": {
      return `{ [${type.keyName}: string]: ${writeType(type.valueType, options)} }`;
    }
    case "shared-type-name": {
      return options.sharedTypePrefix.concat(type.name.text);
    }
    case "string-literal": {
      return type.quotedName.text;
    }
    case "type-name": {
      return type.name.text;
    }
    case "union": {
      return "(\n"
        .concat(
          type.members.map((m) => `| ${writeType(m, options)}\n`).join(""),
        )
        .concat(")");
    }
  }
}

function writeZodType(
  schema: Schema,
  typeName: string,
  options: {
    readonly defaultScopeTypePrefix: string;
    readonly sharedTypePrefix: string;
  },
): string {
  const { defaultScopeTypePrefix, sharedTypePrefix } = options;

  const makeTypeId = (name: string, scope: NameScope): string => {
    switch (scope) {
      case "defaultScope":
        return name;
      case "shared":
        return "_".concat(name);
    }
  };

  const getTypePrefix = (scope: NameScope): string => {
    switch (scope) {
      case "defaultScope":
        return defaultScopeTypePrefix;
      case "shared":
        return sharedTypePrefix;
    }
  };

  const getQualifiedTypeName = (typeName: string, scope: NameScope): string => {
    return getTypePrefix(scope).concat(typeName);
  };

  const getTypeDeclarations = (scope: NameScope): TypeDeclarations => {
    switch (scope) {
      case "defaultScope":
        return schema.typeDeclarations;
      case "shared":
        return schema.sharedDeclarations;
    }
  };

  const typeIdToStatus: { [id: string]: "pending" | "done" } = {};
  const defs: string[] = [];

  const getVarName = (typeName: string, scope: NameScope): string => {
    const uncapitalized = uncapitalize(makeTypeId(typeName, scope));
    const prefix = ((): string => {
      switch (scope) {
        case "defaultScope":
          return "";
        case "shared":
          return "_";
      }
    })();
    return `${prefix}${uncapitalized}Schema`;
  };

  const populateVarDef = (typeName: string, scope: NameScope): void => {
    const typeId = makeTypeId(typeName, scope);
    if (typeIdToStatus[typeId]) return;
    typeIdToStatus[typeId] = "pending";
    const declarations = getTypeDeclarations(scope);
    const declaration = declarations[typeName];
    if (!declaration) {
      throw new Error(`Type declaration not found for '${typeName}'`);
    }
    const { valueType } = declaration;
    const directDeps = getNameDependencies(valueType, scope, schema, "direct");
    for (const s of NAME_SCOPES) {
      for (const dep of directDeps[s]) {
        populateVarDef(dep, s);
      }
    }
    const doc: string = declaration.doc;
    const def = [
      "const ",
      getVarName(typeName, scope),
      ": z.ZodType<",
      getQualifiedTypeName(typeName, scope),
      "> = ",
      write(valueType, scope),
      doc ? `.describe(${JSON.stringify(doc)})` : "",
      ";",
    ].join("");
    typeIdToStatus[typeId] = "done";
    defs.push(def);
  };

  const write = (type: Type | Literal, scope: NameScope): string => {
    switch (type.kind) {
      case "any": {
        return "z.any()";
      }
      case "array": {
        return write(type.elementType, scope).concat(".array()");
      }
      case "boolean-literal": {
        return `z.literal(${type.value satisfies boolean})`;
      }
      case "interface": {
        const fieldDefs: string[] = [];
        for (const field of Object.values(type.fields)) {
          const doc: string = field.doc;
          const { type, isOptional } = unwrapOptional(field.type);
          fieldDefs.push(
            [
              field.name.text,
              ": ",
              write(type, scope),
              isOptional ? ".optional()" : "",
              doc ? `.describe(${JSON.stringify(doc)})` : "",
              ",",
            ].join(""),
          );
        }
        return ["z.object({", ...fieldDefs, "})"].join("\n");
      }
      case "primitive": {
        if (type.primitive.text === "integer") {
          return "z.int32()";
        } else {
          return `z.${type.primitive.text}()`;
        }
      }
      case "record": {
        return [
          "z.record(\n",
          "z.string(),\n",
          write(type.valueType, scope),
          ",\n)",
        ].join("");
      }
      case "shared-type-name": {
        return getVarName(type.name.text, "shared");
      }
      case "string-literal": {
        return `z.literal(${type.quotedName.text})`;
      }
      case "type-name": {
        const typeName = type.name.text;
        const typeId = makeTypeId(typeName, scope);
        if (typeIdToStatus[typeId] === "done") {
          return getVarName(typeName, scope);
        } else {
          // Need to use lazy
          const varName = getVarName(typeName, scope);
          const qualifiedTypeName = getQualifiedTypeName(typeName, scope);
          return `z.lazy((): z.ZodType<${qualifiedTypeName}> => ${varName})`;
        }
      }
      case "union": {
        const members = schema.unionToMembers.get(type)!;
        if (members.kind === "interfaces") {
          return [
            "z.discriminatedUnion(",
            JSON.stringify(members.discriminator).concat(","),
            "[",
            ...Object.values(type.members).map((m) =>
              write(m, scope).concat(","),
            ),
            "],",
            ")",
          ].join("\n");
        } else {
          return [
            "z.enum([",
            ...members.members.map((v) =>
              JSON.stringify(v.value satisfies string).concat(","),
            ),
            "])",
          ].join("\n");
        }
      }
    }
  };

  populateVarDef(typeName, "defaultScope");
  const qualifiedTypeName = getQualifiedTypeName(typeName, "defaultScope");
  return [
    `((): z.ZodType<${qualifiedTypeName}> => {`,
    ...defs,
    `return ${getVarName(typeName, "defaultScope")};`,
    "})()",
  ].join("\n");
}

function wrapJsdoc(doc: string): string {
  if (!doc) return "";
  const lines = doc.split("\n");
  if (lines.length === 1) {
    return `/** ${doc} */\n`;
  } else {
    let result = `/**\n`;
    for (const line of lines) {
      result += line ? ` * ${line}\n` : ` *\n`;
    }
    result += ` */\n`;
    return result;
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
      .replace(/\n*$/g, "\n")
  );
}
