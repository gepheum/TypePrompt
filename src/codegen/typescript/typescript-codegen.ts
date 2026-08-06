import type {
  CompilationResult,
  NamespaceResult,
  Template,
  Tool,
  ValidatedTemplate,
  ValidatedTool,
  ValidCompilationResult,
  ValidNamespaceResult,
} from "../../compiler/compiler-types.js";
import type { Config } from "../../config/config-parser.js";
import { runtimeTypesSchema } from "../../runtime/runtime-types-schema.js";
import { makeTemplates } from "../../runtime/spec-maker.js";
import type {
  Schema,
  Type,
  TypeDeclarations,
} from "../../schema/schema-types.js";
import {
  getNameDependencies,
  NAME_SCOPES,
  NameScope,
} from "../../schema/schema-utils.js";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import type { OutputFile } from "../codegen-types.js";

export function generateTypescriptCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const { generatedDotTsPath } = config;
  if (!generatedDotTsPath) {
    return [];
  }
  return [
    {
      path: generatedDotTsPath,
      content: writeAll(compilationResult),
    },
  ];
}

function writeAll(compilationResult: ValidCompilationResult): string {
  const { metaSchema, namespaces, templates, tools } = compilationResult;

  return coalesceEmptyLines(
    [
      "// This file is auto-generated. Do not edit it directly.",
      "",
      'import { encode as encodeToon } from "@toon-format/toon";',
      'import YAML from "yaml";',
      'import * as z from "zod";\n',
      reformat(writePromptMaker(Object.values(namespaces))),
      STATIC_SNIPPETS["typescript-public-types"],
      "",
      reformat(
        [
          writeEnums(Object.values(templates), Object.values(tools)),
          writeDatatypes(metaSchema, Object.values(namespaces)),
          writeDataZodTypes(Object.values(templates), Object.values(tools)),
          writeSpecDatatypes(),
          writeSpec(compilationResult),
        ].join(""),
      ),
      STATIC_SNIPPETS["typescript-logic"],
      "",
    ].join("\n"),
  );
}

function writePromptMaker(namespaces: readonly NamespaceResult[]): string {
  let code = "export type PromptMaker = {\n";
  for (const namespace of namespaces) {
    const namespaceProperty = uncapitalize(namespace.name);
    code += `readonly ${namespaceProperty}: {\n`;
    for (const template of namespace.templates) {
      const templateName = template.template.name.text;
      const templateProperty = uncapitalize(templateName);
      const templateId = `${namespace.name}:${templateName}`;
      code += `readonly ${templateProperty}: Template<"${templateId}">;\n`;
    }
    code += "};\n";
  }
  code += "};\n\n";
  return code;
}

function writeDatatypes(
  metaSchema: Schema,
  namespaces: readonly ValidNamespaceResult[],
): string {
  const anyTypes = (schema: Schema): boolean =>
    Object.keys(schema.typeDeclarations).length > 0;
  let code = "";
  if (anyTypes(metaSchema)) {
    code += "export type Meta = $.Meta.Meta;\n\n";
  }
  code += "export namespace $ {\n";
  if (anyTypes(metaSchema)) {
    code += "export namespace Meta {\n";
    code += writeSchema(metaSchema, { sharedTypePrefix: "Never." });
    code += "}\n\n";
  }
  for (const namespace of namespaces) {
    code += `export namespace ${namespace.name} {\n`;
    if (anyTypes(namespace.schema)) {
      code += "export namespace Shared {\n";
      code += writeSchema(namespace.schema, { sharedTypePrefix: "Never." });
      code += "}\n\n";
    }
    for (const template of namespace.templates) {
      const templateName = template.template.name.text;
      code += `export namespace ${templateName} {\n`;
      code += writeSchema(template.schema, {
        sharedTypePrefix: `$.${namespace.name}.Shared.`,
      });
      code += "}\n\n";
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = tool.tool.name.text;
      code += `export namespace ${capitalize(toolName)} {\n`;
      code += writeSchema(tool.schema, {
        sharedTypePrefix: `$.${namespace.name}.Shared.`,
      });
      code += "}\n\n";
    }
    code += "}\n\n";
  }
  code += "}\n\n";
  return code;
}

function writeDataZodTypes(
  templates: readonly ValidatedTemplate[],
  tools: readonly ValidatedTool[],
): string {
  let code = "const zodSchemas = {\n";
  const writeEntry = (
    input: ValidatedTemplate | ValidatedTool,
    named: Template | Tool,
  ): void => {
    const namespace = named.namespace?.text ?? "Default";
    const name = named.name.text;
    const zodInputType = writeZodType(input.schema, "Input", {
      defaultScopeTypePrefix: `$.${namespace}.${capitalize(name)}.`,
      sharedTypePrefix: `$.${namespace}.Shared.`,
    });
    const zodOutputType = writeZodType(input.schema, "Output", {
      defaultScopeTypePrefix: `$.${namespace}.${capitalize(name)}.`,
      sharedTypePrefix: `$.${namespace}.Shared.`,
    });
    code += `"${namespace}:${name}": {\n`;
    code += `input: ${zodInputType},\n`;
    code += `output: ${zodOutputType},\n`;
    code += "},\n";
  };
  for (const template of templates) {
    writeEntry(template, template.template);
  }
  for (const tool of tools) {
    writeEntry(tool, tool.tool);
  }
  code += "} as const;\n\n";
  return code;
}

function writeEnums(
  templates: readonly ValidatedTemplate[],
  tools: readonly ValidatedTool[],
): string {
  let code = "export type TemplateId = (\n";
  if (templates.length <= 0) {
    code += " never\n";
  } else {
    for (const template of templates) {
      const namespace = template.template.namespace?.text ?? "Default";
      const templateName = template.template.name.text;
      code += `| "${namespace}:${templateName}"\n`;
    }
  }
  code += ");\n\n";

  code += "export type ToolId = (\n";
  if (tools.length <= 0) {
    code += " never\n";
  } else {
    for (const tool of tools) {
      const namespace = tool.tool.namespace?.text ?? "Default";
      const toolName = tool.tool.name.text;
      code += `| "${namespace}:${toolName}"\n`;
    }
  }
  code += ");\n\n";

  code += "export type ToolName<Id extends ToolId> = {\n";
  if (tools.length <= 0) {
    code += " never\n";
  } else {
    for (const tool of tools) {
      const toolId = (tool.tool.namespace?.text ?? "Default").concat(
        ":",
        tool.tool.name.text,
      );
      const toolName = tool.tool.name.text;
      code += `"${toolId}": "${toolName}",\n`;
    }
  }
  code += "}[Id];\n\n";

  for (const what of ["Input", "Output"]) {
    code += `export type ${what}<Id extends TemplateId | ToolId> = {\n`;
    for (const template of templates) {
      const namespace = template.template.namespace?.text ?? "Default";
      const templateName = template.template.name.text;
      const templateId = `${namespace}:${templateName}`;
      code += `"${templateId}": $.${namespace}.${templateName}.${what};\n`;
    }
    for (const tool of tools) {
      const namespace = tool.tool.namespace?.text ?? "Default";
      const toolName = tool.tool.name.text;
      const toolId = `${namespace}:${toolName}`;
      code += `"${toolId}": $.${namespace}.${capitalize(toolName)}.${what};\n`;
    }
    code += "}[Id];\n\n";
  }

  code += "export type ToolsHelper<Id extends TemplateId> = {\n";
  for (const template of templates) {
      const namespace = template.template.namespace?.text ?? "Default";
      const templateName = template.template.name.text;
      const templateId = `${namespace}:${templateName}`;
    code += `"${templateId}": {\n`;
    for (const tool of Object.values(template.tools)) {
      const toolName = tool.tool.kind;
      const toolId = `${namespace}:${toolName}`;
      code += `${toolName}: "${toolId}",\n`;
    }
    code += "},\n";
  }
  code += "}[Id];\n\n";

  return code;
}

function writeSpecDatatypes(): string {
  const options = {
    defaultScopeTypePrefix: "Spec.",
    sharedTypePrefix: "Never.",
  } as const;
  let code = "namespace Spec {\n";
  code += writeSchema(runtimeTypesSchema, options);
  code += "}\n\n";
  code += "const templatesSchema = ";
  code += writeZodType(runtimeTypesSchema, "Templates", options);
  code += ";\n\n";
  return code;
}

function writeSpec(compilationResult: CompilationResult): string {
  return (
    "const TEMPLATES_DATA: Spec.Templates = " +
    JSON.stringify(makeTemplates(compilationResult), undefined, 2) +
    " as const;\n\n"
  );
}

function writeSchema(
  schema: Schema,
  options: { readonly sharedTypePrefix: string },
): string {
  let code = "";
  for (const typeDeclaration of Object.values(schema.typeDeclarations)) {
    const name = typeDeclaration.name.text;
    code += wrapJsdoc(typeDeclaration.doc);
    code += `export type ${name} = ${writeType(typeDeclaration.valueType, options)};\n\n`;
  }
  return code;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function writeType(
  type: Type,
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
    case "interface": {
      const fields = Object.entries(type.fields);
      if (fields.length <= 0) {
        return "{}";
      }
      let result = "{\n";
      for (const [fieldName, field] of fields) {
        result += [
          wrapJsdoc(field.doc),
          "readonly ",
          fieldName,
          field.optional ? "?: " : ": ",
          writeType(field.type, options),
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
    case "union": {
      return "(\n"
        .concat(
          type.members.map((m) => `| ${writeType(m, options)}\n`).join(""),
        )
        .concat(")");
    }
    case "type-name": {
      return type.name.text;
    }
    case "shared-type-name": {
      return options.sharedTypePrefix.concat(type.name.text);
    }
    case "string-literal": {
      return type.quotedName.text;
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

  const write = (type: Type, scope: NameScope): string => {
    switch (type.kind) {
      case "any": {
        return "z.any()";
      }
      case "array": {
        return write(type.elementType, scope).concat(".array()");
      }
      case "interface": {
        const fieldDefs: string[] = [];
        for (const field of Object.values(type.fields)) {
          const doc: string = field.doc;
          fieldDefs.push(
            [
              field.name.text,
              ": ",
              write(field.type, scope),
              field.optional ? ".optional()" : "",
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
        return [
          "z.union([",
          ...Object.values(type.members).map((m) =>
            write(m, scope).concat(","),
          ),
          "])",
        ].join("\n");
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
    if (line.startsWith("}") || line.startsWith(")") || line.startsWith("]")) {
      indent = indent.slice(0, -2);
    }
    const starPrefix = line.startsWith("*") ? " " : "";
    outputLines.push(line.length <= 0 ? line : `${indent}${starPrefix}${line}`);
    if (line.endsWith("{") || line.endsWith("(") || line.endsWith("[")) {
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
