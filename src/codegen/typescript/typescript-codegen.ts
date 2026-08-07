import type {
  CompilationResult,
  NamespaceResult,
  Template,
  Tool,
  ValidatedTemplate,
  ValidatedTool,
  ValidCompilationResult,
  ValidNamespaceResult,
  ValidTemplate,
} from "../../compiler/compiler-types.js";
import { DEFAULT_NAMESPACE } from "../../compiler/default-namespace.js";
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
      STATIC_SNIPPETS["typescript-top-level"],
      reformat(writePromptMaker(Object.values(namespaces))),
      STATIC_SNIPPETS["typescript-public-types"],
      reformat(
        [
          writeTemplateIdEnum(Object.values(templates), Object.values(tools)),
          writeToolsType(Object.values(templates), Object.values(tools)),
          writeInputOutputTypes(Object.values(templates)),
          writeUserDefinedDatatypes(metaSchema, Object.values(namespaces)),
          writeZodSchemas(Object.values(templates), Object.values(tools)),
          writeSpecDatatypes(),
          writeTemplatesData(compilationResult),
        ].join("\n\n"),
      ),
      STATIC_SNIPPETS["typescript-logic"],
    ].join("\n\n"),
  ).concat("\n");
}

function writePromptMaker(namespaces: readonly NamespaceResult[]): string {
  const lines = [
    "/**",
    " * Entry point for building prompts. Each property corresponds to a namespace,",
    " * and each nested property corresponds to a template within that namespace.",
    " */",
    "export type PromptMaker = {",
  ];
  for (const namespace of namespaces) {
    if (namespace.templates.length <= 0) continue;
    if (namespace.name === DEFAULT_NAMESPACE) {
      lines.push("/** Templates defined in the default namespace. */");
    }
    const namespaceProperty = uncapitalize(namespace.name);
    lines.push(`readonly ${namespaceProperty}: {`);
    for (const template of namespace.templates) {
      const templateName = template.template.name.text;
      const templateProperty = uncapitalize(templateName);
      const templateId = `${namespace.name}:${templateName}`;
      lines.push(`readonly ${templateProperty}: Template<"${templateId}">;`);
    }
    lines.push("};");
  }
  lines.push("};");
  return lines.join("\n");
}

function writeUserDefinedDatatypes(
  metaSchema: Schema,
  namespaces: readonly ValidNamespaceResult[],
): string {
  const anyTypes = (schema: Schema): boolean =>
    Object.keys(schema.typeDeclarations).length > 0;
  const lines = [
    "export type Meta = $.Meta.Meta;\n",
    "export namespace $ {",
    "export namespace Meta {",
  ];
  if (anyTypes(metaSchema)) {
    lines.push(writeSchema(metaSchema, { sharedTypePrefix: "Never." }));
  } else {
    lines.push("export type Meta = never;\n");
  }
  lines.push("}\n");
  for (const namespace of namespaces) {
    lines.push(`export namespace ${namespace.name} {`);
    if (anyTypes(namespace.schema)) {
      lines.push("export namespace Shared {");
      lines.push(writeSchema(namespace.schema, { sharedTypePrefix: "Never." }));
      lines.push("}\n");
    }
    for (const template of namespace.templates) {
      const templateName = template.template.name.text;
      lines.push(`export namespace ${templateName} {`);
      lines.push(
        writeSchema(template.schema, {
          sharedTypePrefix: `$.${namespace.name}.Shared.`,
        }),
      );
      lines.push("}\n");
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = tool.tool.name.text;
      lines.push(`export namespace ${capitalize(toolName)} {\n`);
      lines.push(
        writeSchema(tool.schema, {
          sharedTypePrefix: `$.${namespace.name}.Shared.`,
        }),
      );
      lines.push("}\n");
    }
    lines.push("}\n");
  }
  lines.push("}\n");
  return lines.join("\n");
}

function writeZodSchemas(
  templates: readonly ValidatedTemplate[],
  tools: readonly ValidatedTool[],
): string {
  const lines = ["const zodSchemas = {"];
  const writeEntry = (
    input: ValidatedTemplate | ValidatedTool,
    named: Template | Tool,
  ): void => {
    const namespace = named.namespace?.text ?? DEFAULT_NAMESPACE;
    const name = named.name.text;
    const zodInputType = writeZodType(input.schema, "Input", {
      defaultScopeTypePrefix: `$.${namespace}.${capitalize(name)}.`,
      sharedTypePrefix: `$.${namespace}.Shared.`,
    });
    const zodOutputType = writeZodType(input.schema, "Output", {
      defaultScopeTypePrefix: `$.${namespace}.${capitalize(name)}.`,
      sharedTypePrefix: `$.${namespace}.Shared.`,
    });
    lines.push(`"${namespace}:${name}": {`);
    lines.push(`input: ${zodInputType},`);
    lines.push(`output: ${zodOutputType},`);
    lines.push("},");
  };
  for (const template of templates) {
    writeEntry(template, template.template);
  }
  for (const tool of tools) {
    writeEntry(tool, tool.tool);
  }
  lines.push("} as const;");
  return lines.join("\n");
}

function writeTemplateIdEnum(
  templates: readonly ValidatedTemplate[],
  tools: readonly ValidatedTool[],
): string {
  const lines = [
    "/** Uniquely identifies a prompt template. */",
    "export type TemplateId = (",
  ];
  if (templates.length <= 0) {
    lines.push(" never");
  } else {
    for (const template of templates) {
      const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
      const templateName = template.template.name.text;
      lines.push(`| "${namespace}:${templateName}"`);
    }
  }
  lines.push(");");
  return lines.join("\n");
}

function writeToolsType(
  templates: readonly ValidTemplate[],
  tools: readonly ValidatedTool[],
): string {
  const lines = [
    "/** The tools available from the given template. */",
    "export type Tools<Id extends TemplateId> = {",
  ];
  for (const template of templates) {
    const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const templateName = template.template.name.text;
    const templateId = `${namespace}:${templateName}`;
    lines.push(`"${templateId}": {`);
    for (const tool of Object.values(template.tools)) {
      const toolName = tool.tool.tool.name.text;
      const typePrefix = `$.${namespace}.${capitalize(toolName)}.`;
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
  templates: readonly ValidatedTemplate[],
): string {
  const lines: string[] = [];

  for (const what of ["Input", "Output"]) {
    lines.push(`export type ${what}<Id extends TemplateId> = {`);
    for (const template of templates) {
      const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
      const templateName = template.template.name.text;
      const templateId = `${namespace}:${templateName}`;
      lines.push(`"${templateId}": $.${namespace}.${templateName}.${what};`);
    }
    lines.push("}[Id];");
    lines.push("");
  }

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

function writeTemplatesData(compilationResult: CompilationResult): string {
  return (
    "const TEMPLATES_DATA: Spec.Templates = " +
    JSON.stringify(makeTemplates(compilationResult), undefined, 2) +
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
    lines.push(wrapJsdoc(typeDeclaration.doc));
    lines.push(
      `export type ${name} = ${writeType(typeDeclaration.valueType, options)};`,
    );
  }
  return lines.join("\n");
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
