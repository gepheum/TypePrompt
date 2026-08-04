import type {
  CompilationResult,
  NamespaceResult,
  TemplateValidationResult,
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
import type { OutputFile } from "../codegen-types.js";

export function generateTypescriptCode(
  compilationResult: CompilationResult,
  config: Config,
): readonly OutputFile[] {
  const { generatedDotTsPath } = config;
  if (!generatedDotTsPath) {
    return [];
  }
  return [
    {
      path: generatedDotTsPath,
      content: new TypescriptCodeGenerator().write(compilationResult),
    },
  ];
}

class TypescriptCodeGenerator {
  code = "";

  write(compilationResult: CompilationResult): string {
    const { metaSchema, namespaces, templates } = compilationResult;
    if (metaSchema.kind !== "success") throw new Error();

    this.writePromptMaker(Object.values(namespaces));
    this.writeDatatypes(metaSchema, Object.values(namespaces));
    this.writeTemplateIdTypeAlias(Object.values(templates));
    this.writeTemplateOutputZodTypes(Object.values(templates));
    this.writeSpecDatatypes();
    this.writeSpec(compilationResult);
    return [
      "// This file is auto-generated. Do not edit it directly.",
      "",
      'import { encode as encodeToon } from "@toon-format/toon";',
      'import YAML from "yaml";',
      'import * as z from "zod";\n',
      STATIC_TYPES,
      reformat(this.code),
      STATIC_LOGIC,
    ].join("\n");
  }

  private writePromptMaker(namespaces: readonly NamespaceResult[]): void {
    this.code += "export type PromptMaker = {\n";
    for (const namespace of namespaces) {
      const namespaceProperty = uncapitalize(namespace.name);
      this.code += `readonly ${namespaceProperty}: {\n`;
      for (const template of namespace.templates) {
        const templateName = template.template.name.text;
        const templateProperty = uncapitalize(templateName);
        const typePrefix = `$.${namespace.name}.${templateName}`;
        const inputType = typePrefix.concat(".Input");
        const outputType = typePrefix.concat(".Output");
        this.code += `readonly ${templateProperty}: Template<${inputType}, ${outputType}>;\n`;
      }
      this.code += "};\n";
    }
    this.code += "};\n\n";
  }

  private writeDatatypes(
    metaSchema: Schema,
    namespaces: readonly NamespaceResult[],
  ): void {
    if (metaSchema.kind !== "success") throw new Error();
    const anyTypes = (schema: Schema): boolean =>
      Object.keys(schema.typeDeclarations).length > 0;
    if (anyTypes(metaSchema)) {
      this.code += "export type Meta = $.Meta.Meta;\n\n";
    }
    this.code += "export namespace $ {\n";
    if (anyTypes(metaSchema)) {
      this.code += "export namespace Meta {\n";
      this.writeSchema(metaSchema, { sharedTypePrefix: "Never." });
      this.code += "}\n\n";
    }
    for (const namespace of namespaces) {
      this.code += `export namespace ${namespace.name} {\n`;
      if (namespace.schema.kind !== "success") throw new Error();
      if (anyTypes(namespace.schema)) {
        this.code += "export namespace Shared {\n";
        this.writeSchema(namespace.schema, {
          sharedTypePrefix: "Never.",
        });
        this.code += "}\n\n";
      }
      for (const template of namespace.templates) {
        const templateName = template.template.name.text;
        this.code += `export namespace ${templateName} {\n`;
        this.writeSchema(template.schema, {
          sharedTypePrefix: `$.${namespace.name}.Shared.`,
        });
        this.code += "}\n\n";
      }
      this.code += "}\n\n";
    }
    this.code += "}\n\n";
  }

  private writeTemplateOutputZodTypes(
    templates: readonly TemplateValidationResult[],
  ): void {
    this.code += "const templateOutputSchemas = {\n";
    for (const template of templates) {
      if (template.kind !== "success") throw new Error();
      const namespace = template.template.namespace?.text ?? "Default";
      const templateName = template.template.name.text;
      this.code += `"${namespace}:${templateName}": ${spellZodType(
        template.schema,
        "Output",
        {
          defaultScopeTypePrefix: `$.${namespace}.${templateName}.`,
          sharedTypePrefix: `$.${namespace}.Shared.`,
        },
      )},\n`;
    }
    this.code += "} as const;\n\n";
  }

  private writeTemplateIdTypeAlias(
    templates: readonly TemplateValidationResult[],
  ): void {
    this.code += "export type TemplateId = (\n";
    if (templates.length <= 0) {
      this.code += " never\n";
    } else {
      for (const template of templates) {
        if (template.kind !== "success") throw new Error();
        const namespace = template.template.namespace?.text ?? "Default";
        const templateName = template.template.name.text;
        this.code += `| "${namespace}:${templateName}"\n`;
      }
    }
    this.code += ");\n\n";
  }

  private writeSpecDatatypes(): void {
    const options = {
      defaultScopeTypePrefix: "Spec.",
      sharedTypePrefix: "Never.",
    } as const;
    this.code += "namespace Spec {\n";
    this.writeSchema(runtimeTypesSchema, options);
    this.code += "}\n\n";
    this.code += "const templatesSchema = ";
    this.code += spellZodType(runtimeTypesSchema, "Templates", options);
    this.code += ";\n\n";
  }

  private writeSpec(compilationResult: CompilationResult): void {
    this.code += "const TEMPLATES_DATA: Spec.Templates = ";
    this.code += JSON.stringify(makeTemplates(compilationResult), undefined, 2);
    this.code += " as const;\n\n";
  }

  private writeSchema(
    schema: Schema,
    options: {
      readonly sharedTypePrefix: string;
    },
  ): void {
    for (const typeDeclaration of Object.values(schema.typeDeclarations)) {
      const name = typeDeclaration.name.text;
      this.code += wrapJsdoc(typeDeclaration.doc);
      const type = spellType(typeDeclaration.valueType, options);
      this.code += `export type ${name} = ${type};\n\n`;
    }
  }
}

function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function spellType(
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
      const spelledElement = spellType(elementType, options);
      if (elementType.kind === "union") {
        return `readonly (${spelledElement})[]`;
      } else {
        return `readonly ${spelledElement}[]`;
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
          spellType(field.type, options),
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
      return `{ [${type.keyName}: string]: ${spellType(type.valueType, options)} }`;
    }
    case "union": {
      return "(\n"
        .concat(
          type.members.map((m) => `| ${spellType(m, options)}\n`).join(""),
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

function spellZodType(
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
      spell(valueType, scope),
      doc ? `.describe(${JSON.stringify(doc)})` : "",
      ";",
    ].join("");
    typeIdToStatus[typeId] = "done";
    defs.push(def);
  };

  const spell = (type: Type, scope: NameScope): string => {
    switch (type.kind) {
      case "any": {
        return "z.any()";
      }
      case "array": {
        return spell(type.elementType, scope).concat(".array()");
      }
      case "interface": {
        const fieldDefs: string[] = [];
        for (const field of Object.values(type.fields)) {
          const doc: string = field.doc;
          fieldDefs.push(
            [
              field.name.text,
              ": ",
              spell(field.type, scope),
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
          spell(type.valueType, scope),
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
          ...Object.values(type.members).map((m) => spell(m, scope).concat(",")),
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
  code = code.replace(/\n[ \t]*\n([ \t]*})/g, "\n$1");
  const inputLines: readonly string[] = code.split("\n");
  const outputLines: string[] = [];
  let indent = "";
  for (const inputLine of inputLines) {
    const line = inputLine.trim();
    if (line.startsWith("}") || line.startsWith(")") || line.startsWith("]")) {
      indent = indent.slice(0, -2);
    }
    outputLines.push(line.length <= 0 ? line : indent + line);
    if (line.endsWith("{") || line.endsWith("(") || line.endsWith("[")) {
      indent = indent + "  ";
    }
  }
  return outputLines.join("\n");
}

// Copy the static part from './runtime-logic.ts' then stringify with:
//   https://jsonformatter.org/json-stringify-online
const STATIC_TYPES =
  'export type Template<Input, Output> = {\n  readonly make: (input: Input) => Prompt<Output, Input>;\n};\n\nexport type Prompt<Output, Input = unknown> = {\n  readonly meta: Meta;\n  readonly systemInstructions: string;\n  readonly userInstructions: string;\n  readonly examples: readonly FewShotExample[];\n  readonly outputFormat: OutputFormat<Output>;\n  readonly templateId: TemplateId;\n  readonly templateInput: Input;\n};\n\nexport type FewShotExample = {\n  readonly userInstructions: string;\n  readonly assistantResponse: string;\n};\n\nexport type OutputFormat<Output> =\n  | {\n      readonly kind: "json";\n      readonly schema: z.ZodType<Output>;\n    }\n  | (Output extends string ? { readonly kind: "text" } : never);\n';
const STATIC_LOGIC =
  "export function newPromptMaker(): PromptMaker {\n  return newPromptMakerImpl(TEMPLATES_DATA);\n}\n\nfunction newPromptMakerImpl(templates: Spec.Templates): PromptMaker {\n  const result: {\n    [namespace: string]: {\n      [name: string]: Template<unknown, unknown>;\n    };\n  } = {};\n  for (const [templateId, templateSpec] of Object.entries(\n    templates.templates,\n  )) {\n    const namespace = uncapitalize(templateSpec.namespace);\n    const name = uncapitalize(templateSpec.name);\n    (result[namespace] ??= {})[name] = {\n      make: (input: unknown) =>\n        resolveTemplate(templateId as TemplateId, templates, input),\n    };\n  }\n  return result as PromptMaker;\n}\n\nexport function parseResponse<Output>(\n  response: string,\n  outputFormat: OutputFormat<Output>,\n): Output {\n  switch (outputFormat.kind) {\n    case \"json\": {\n      response = response.trim();\n      response = response.startsWith(\"```\")\n        ? response.replace(/^```(?:json)?\\s*\\n?([\\s\\S]*?)\\n?```$/, \"$1\").trim()\n        : response;\n      return outputFormat.schema.parse(JSON.parse(response));\n    }\n    case \"text\": {\n      return response as Output;\n    }\n  }\n}\n\nfunction resolveTemplate<Input, Output>(\n  templateId: TemplateId,\n  templates: Spec.Templates,\n  input: Input,\n): Prompt<Output, Input> {\n  const template = templates.templates[templateId];\n  if (!template) {\n    throw new Error(\"Template not found: \".concat(templateId));\n  }\n  const { contents, snippets } = template;\n  let meta: Meta;\n  let systemInstructions: string;\n  let userInstructions: string;\n  let examples: readonly FewShotExample[];\n  if (contents.kind === \"noVariants\") {\n    const { content } = contents;\n    meta = content.meta as Meta;\n    systemInstructions = resolveBody(content.system!, input, snippets);\n    userInstructions = resolveBody(content.user!, input, snippets);\n    examples = resolveExamples(content.examples!, content.user!, template);\n  } else {\n    const { defaultContent, variants } = contents;\n    const { variant } = input as { readonly variant: string };\n    const variantContent = variants[variant]!;\n    meta = (variantContent.meta ?? defaultContent.meta) as Meta;\n    const system = (variantContent.system ?? defaultContent.system)!;\n    const user = (variantContent.user ?? defaultContent.user)!;\n    systemInstructions = resolveBody(system, input, snippets);\n    userInstructions = resolveBody(user, input, snippets);\n    examples = resolveExamples(\n      (variantContent.examples ?? defaultContent.examples)!,\n      user,\n      template,\n    );\n  }\n  const outputSchema = templateOutputSchemas[templateId];\n  const outputFormat = (\n    template.outputFormat === \"json\"\n      ? { kind: \"json\", schema: outputSchema }\n      : { kind: \"text\" }\n  ) as OutputFormat<Output>;\n  return {\n    meta,\n    systemInstructions,\n    userInstructions,\n    examples,\n    outputFormat,\n    templateId,\n    templateInput: input,\n  };\n}\n\nfunction resolveBody<Input>(\n  body: Spec.Body,\n  input: Input,\n  snippets: { readonly [c: string]: Spec.Snippet },\n): string {\n  const resolvePiece = (piece: Spec.BodyPiece): string => {\n    switch (piece.kind) {\n      case \"text\": {\n        return piece.text;\n      }\n      case \"insertSnippet\": {\n        const snippet = snippets[piece.snippet];\n        if (!snippet) {\n          throw new Error(\"Snippet not found: \".concat(piece.snippet));\n        }\n        return indent(resolveSnippet(snippet, input, snippets), piece.indent);\n      }\n      case \"insertVal\": {\n        const val = evaluate(input, piece.val);\n        return indent(format(val, piece.format), piece.indent);\n      }\n    }\n  };\n  return body.map(resolvePiece).join(\"\");\n}\n\nfunction resolveSnippet<Input>(\n  snippet: Spec.Snippet,\n  input: Input,\n  snippets: { readonly [c: string]: Spec.Snippet },\n): string {\n  switch (snippet.kind) {\n    case \"snippet\": {\n      return resolveBody(snippet.body, input, snippets);\n    }\n    case \"snippetIf\": {\n      const { expression, then: thenBody, else: elseBody } = snippet;\n      const evalResult = evaluate(input, expression);\n      const condition = ((): boolean => {\n        switch (snippet.is) {\n          case \"notEmpty\": {\n            return (evalResult as { readonly length: number }).length > 0;\n          }\n          case \"notNull\": {\n            return evalResult === undefined || evalResult === null;\n          }\n          case \"true\": {\n            return !!evalResult;\n          }\n        }\n      })();\n      const body = condition ? thenBody : elseBody;\n      return resolveBody(body, input, snippets);\n    }\n    case \"snippetSwitch\": {\n      const { expression, branches } = snippet;\n      const evalResult = evaluate(input, expression);\n      const branch = branches[evalResult as string];\n      if (!branch) {\n        throw new Error(\"Branch not found: \".concat(evalResult as string));\n      }\n      return resolveBody(branch, input, snippets);\n    }\n  }\n}\n\nfunction indent(text: string, spaces: string): string {\n  if (spaces.length <= 0) {\n    return text;\n  } else {\n    return text.replace(/\\n/g, \"\\n\".concat(spaces));\n  }\n}\n\nfunction evaluate<Input>(input: Input, expression: Spec.Expression): unknown {\n  switch (expression.kind) {\n    case \"input\": {\n      return input;\n    }\n    case \"property\": {\n      const { property } = expression;\n      return (input as Record<string, unknown>)[property];\n    }\n  }\n}\n\nfunction resolveExamples(\n  inputs: ReadonlyArray<{\n    readonly input: unknown;\n    readonly output: unknown;\n  }>,\n  body: Spec.Body,\n  template: Spec.Template,\n): readonly FewShotExample[] {\n  return inputs.map(({ input, output }) => ({\n    userInstructions: resolveBody(body, input, template.snippets),\n    assistantResponse: format(output, template.outputFormat),\n  }));\n}\n\nfunction format(input: unknown, format?: Spec.InsertFormat): string {\n  switch (format) {\n    case undefined:\n    case \"text\": {\n      return String(input);\n    }\n    case \"json\": {\n      return JSON.stringify(input, undefined, 2);\n    }\n    case \"yaml\": {\n      return YAML.stringify(input);\n    }\n    case \"toon\": {\n      return encodeToon(input);\n    }\n    case \"csv\":\n    case \"tsv\": {\n      const separator = format === \"csv\" ? \",\" : \"\\t\";\n      const array = input as ReadonlyArray<{ [k: string]: string | number }>;\n      if (array.length <= 0) {\n        return \"\";\n      }\n      const firstElement = array[0]!;\n      const headerRow = Object.keys(firstElement).join(separator);\n      const rows: string[] = [\n        headerRow,\n        ...array.map((e) => {\n          return Object.values(e)\n            .map((cell) => {\n              const str = String(cell);\n              if (separator === \",\") {\n                // CSV per RFC 4180: wrap in double quotes if the cell contains a\n                // double quote, a comma, a newline, or a carriage return.\n                return /[\",\\n\\r]/.test(str)\n                  ? '\"'.concat(str.replace(/\"/g, '\"\"')).concat('\"')\n                  : str;\n              } else {\n                // TSV: no standard quoting; escape special characters with\n                // backslash so the value remains a single field.\n                return str\n                  .replace(/\\\\/g, \"\\\\\\\\\")\n                  .replace(/\\t/g, \"\\\\t\")\n                  .replace(/\\n/g, \"\\\\n\")\n                  .replace(/\\r/g, \"\\\\r\");\n              }\n            })\n            .join(separator);\n        }),\n      ];\n      return rows.join(\"\\n\");\n    }\n  }\n}\n\nfunction uncapitalize(s: string): string {\n  return s.charAt(0).toLowerCase() + s.slice(1);\n}\n";
