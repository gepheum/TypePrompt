import type {
  CompilationResult,
  NamespaceResult,
  TemplateValidationResult,
} from "../compiler/compiler-types.js";
import type { Config } from "../config/config-parser.js";
import type { Schema, Type } from "../schema/schema-types.js";
import {
  getNameDependencies,
  NAME_SCOPES,
  NameScope,
} from "../schema/schema-utils.js";
import type { OutputFile } from "./codegen-types.js";

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

    this.code = `// This file is auto-generated. Do not edit it directly.\n\n`;
    this.code += 'import * as z from "zod";\n\n';
    this.writePromptMaker(Object.values(namespaces));
    this.writeDatatypes(metaSchema, Object.values(namespaces));
    this.writeTemplateIdTypeAlias(Object.values(templates));
    this.code += STATIC_CODE;
    return reformat(this.code);
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
      this.writeSchema(metaSchema, "Meta");
      this.code += "}\n\n";
    }
    for (const namespace of namespaces) {
      this.code += `export namespace ${namespace.name} {\n`;
      if (namespace.schema.kind !== "success") throw new Error();
      if (anyTypes(namespace.schema)) {
        this.code += "export namespace Shared {\n";
        this.writeSchema(namespace.schema, namespace.name);
        this.code += "}\n\n";
      }
      for (const template of namespace.templates) {
        const templateName = template.template.name.text;
        this.code += `export namespace ${templateName} {\n`;
        this.writeSchema(template.schema, namespace.name);
        this.code += "}\n\n";
      }
      this.code += "}\n\n";
    }
    this.code += "}\n\n";
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

  private writeZodTypes(compilationResult: CompilationResult): void {
    for (const namespace of Object.values(compilationResult.namespaces)) {
      for (const template of Object.values(namespace.templates)) {
        // this.writeOutputZodType({
        //   schema: template.schema,
        //   namespace: namespace.name,
        //   templateName: template.template.name.text,
        // });
      }
    }
  }

  private writeSchema(schema: Schema, namespace: string): void {
    for (const typeDeclaration of Object.values(schema.typeDeclarations)) {
      const name = typeDeclaration.name.text;
      this.code += wrapJsdoc(typeDeclaration.doc);
      this.code += `export type ${name} = ${spellType(typeDeclaration.valueType, namespace)};\n\n`;
    }
  }

  private writeOutputZodType(args: {
    readonly schema: Schema;
    readonly namespace: string;
    readonly templateName: string;
  }): void {
    const { schema, namespace, templateName: promptName } = args;
    this.code += `((): z.ZodType<$.${namespace}.${promptName}.Output> => {\n`;

    const makeTypeId = (name: string, scope: NameScope): string =>
      scope === "defaultScope" ? name : "_".concat(name);

    const typeIdToStatus: { [id: string]: "pending" | "done" } = {};

    const writeLocalVar = (typeName: string, scope: NameScope): void => {
      const typeId = makeTypeId(typeName, scope);
      if (typeIdToStatus[typeId]) {
        return;
      }
      typeIdToStatus[typeId] = "pending";
      const declarations =
        scope === "defaultScope"
          ? schema.typeDeclarations
          : schema.sharedDeclarations!;
      const declaration = declarations[typeName]!;
      const { valueType } = declaration;
      const directDeps = getNameDependencies(
        valueType,
        scope,
        schema,
        "direct",
      );
      for (const s of NAME_SCOPES) {
        for (const dep of directDeps[s]) {
          writeLocalVar(dep, s);
        }
      }
      this.code += [
        "const ",
        uncapitalize(typeName),
        "Type: ",
        "z.ZodType<$.",
        namespace,
        ".",
        promptName,
        ".",
        typeName,
        "> = ",
      ].join("");
      write(valueType, scope);
      if (declaration.doc) {
        const quotedDoc = JSON.stringify(declaration.doc satisfies string);
        this.code += `.describe(${quotedDoc})`;
      }
      this.code += ";\n\n";
      typeIdToStatus[typeName] = "done";
    };

    const write = (type: Type, scope: NameScope): null => {
      switch (type.kind) {
        case "any": {
          this.code += "z.any()";
          return null;
        }
        case "array": {
          write(type.elementType, scope);
          this.code += ".array()";
          return null;
        }
        case "interface": {
          this.code += "z.object({\n";
          for (const field of Object.values(type.fields)) {
            const deps = getNameDependencies(
              field.type,
              scope,
              schema,
              "direct",
            );
            const useLazy = NAME_SCOPES.every((s) =>
              [...deps[s]].some(
                (d) => typeIdToStatus[makeTypeId(d, s)] !== "done",
              ),
            );
            this.code += `${field.name.text}: `;
            if (useLazy) {
              this.code += "z.lazy(() => ";
            }
            write(field.type, scope);
            if (useLazy) {
              this.code += ")";
            }
            if (field.optional) {
              this.code += ".optional()";
            }
            const quotedDoc = JSON.stringify(field.doc satisfies string);
            this.code += `.describe(${quotedDoc}),\n`;
          }
          this.code += "})";
          return null;
        }
        case "primitive": {
          if (type.primitive.text === "integer") {
            this.code += "z.int32()";
          } else {
            this.code += `z.${type.primitive.text}()`;
          }
          return null;
        }
        case "record": {
          this.code += "z.record(\nz.string(),\n";
          write(type.valueType, scope);
          this.code += "\n)";
          return null;
        }
        case "shared-type-name": {
          this.code += "_".concat(uncapitalize(type.name.text));
          return null;
        }
        case "string-literal": {
          this.code += `z.literal(${type.quotedName.text})`;
          return null;
        }
        case "type-name": {
          this.code += uncapitalize(type.name.text);
          return null;
        }
        case "union": {
          this.code += "z.enum({\n";
          for (const member of Object.values(type.members)) {
            write(member, scope);
            this.code += ",\n";
          }
          this.code += "})";
          return null;
        }
      }
    };

    writeLocalVar("Output", "defaultScope");
    this.code += "return outputType;\n})()";
  }
}

function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function spellType(type: Type, namespace: string): string {
  switch (type.kind) {
    case "any": {
      return "unknown";
    }
    case "array": {
      const { elementType } = type;
      const spelledElement = spellType(elementType, namespace);
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
        result += wrapJsdoc(field.doc);
        result += `readonly ${fieldName}: ${spellType(field.type, namespace)};\n`;
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
      return `{ [${type.keyName}: string]: ${spellType(type.valueType, namespace)} }`;
    }
    case "union": {
      return "(\n".concat(
        type.members
          .map((m) => `| ${spellType(m, namespace)}\n`)
          .join("")
      ).concat(")");
    }
    case "type-name": {
      return type.name.text;
    }
    case "shared-type-name": {
      return `$.${namespace}.Shared.${type.name.text}`;
    }
    case "string-literal": {
      return type.quotedName.text;
    }
  }
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
    if (line.startsWith("}") || line.startsWith(")")) {
      indent = indent.slice(0, -2);
    }
    outputLines.push(indent + line);
    if (line.endsWith("{") || line.endsWith("(")) {
      indent = indent + "  ";
    }
  }
  return outputLines.join("\n");
}

const STATIC_CODE = `
export type Template<Input, Output> = {
  readonly make: (input: Input) => Prompt<Output, Input>;
};

export type Prompt<Output, Input = unknown> = {
  readonly meta: Meta;
  readonly systemInstructions: string;
  readonly userInstructions: string;
  readonly examples: readonly FewShotExample[];
  readonly outputFormat: (
    | {
        readonly kind: "json";
        readonly schema: z.ZodType<Output>;
      }
    | (Output extends string ? { readonly kind: "text" } : never)
  );
  readonly templateId: TemplateId;
  readonly templateInput: Input;
};

export type FewShotExample = {
  readonly userInstructions: string;
  readonly assistantResponse: string;
};

function newPromptMaker(templates: Templates): PromptMaker {
  const result: {
    [namespace: string]: {
      [name: string]: Template<unknown, unknown>;
    };
  } = {};
  for (const [templateId, templateSpec] of Object.entries(
    templates.templates,
  )) {
    const namespace = uncapitalize(templateSpec.namespace);
    const name = uncapitalize(templateSpec.name);
    (result[namespace] ??= {})[name] = {
      make: (input: unknown) => resolveTemplate(templateId, templates, input),
    };
  }
  return result;
}

function resolveTemplate<Input, Output>(
  templateId: string,
  templates: Templates,
  input: Input,
): Prompt<Output, Input> {
  const template = templates.templates[templateId];
  if (!template) {
    throw new Error("Template not found: ".concat(templateId));
  }
  const { contents, snippets } = template;
  let meta: Meta;
  let systemInstructions: string;
  let userInstructions: string;
  let examples: readonly FewShotExample[];
  if (contents.kind === "no-variants") {
    const { content } = contents;
    meta = content.meta as Meta;
    systemInstructions = resolveBody(content.system!, input, snippets);
    userInstructions = resolveBody(content.user!, input, snippets);
    examples = resolveExamples(content.examples!, content.user!, template);
  } else {
    const { defaultContent, variants } = contents;
    const { variant } = input as { readonly variant: string };
    const variantContent = variants[variant]!;
    meta = (variantContent.meta ?? defaultContent.meta) as Meta;
    const system = (variantContent.system ?? defaultContent.system)!;
    const user = (variantContent.user ?? defaultContent.user)!;
    systemInstructions = resolveBody(system, input, snippets);
    userInstructions = resolveBody(user, input, snippets);
    examples = resolveExamples(
      (variantContent.examples ?? defaultContent.examples)!,
      user,
      template,
    );
  }
  const outputType = getOutputType(templateId) as z.ZodType<Output>;
  return {
    meta,
    systemInstructions,
    userInstructions,
    examples,
    outputType,
    templateId,
    templateInput: input,
  };
}

function resolveBody<Input>(
  body: Body,
  input: Input,
  snippets: { readonly [c: string]: Snippet },
): string {
  const resolvePiece = (piece: BodyPiece): string => {
    switch (piece.kind) {
      case "text": {
        return piece.text;
      }
      case "insert-snippet": {
        const snippet = snippets[piece.snippet];
        if (!snippet) {
          throw new Error("Snippet not found: ".concat(piece.snippet));
        }
        return indent(resolveSnippet(snippet, input, snippets), piece.indent);
      }
      case "insert-val": {
        const val = evaluate(input, piece.val);
        return indent(format(val, piece.format), piece.indent);
      }
    }
  };
  return body.map(resolvePiece).join("");
}

function resolveSnippet<Input>(
  snippet: Snippet,
  input: Input,
  snippets: { readonly [c: string]: Snippet },
): string {
  switch (snippet.kind) {
    case "snippet": {
      return resolveBody(snippet.body, input, snippets);
    }
    case "snippet-if": {
      const { expression, then: thenBody, else: elseBody } = snippet;
      const evalResult = evaluate(input, expression);
      const condition = ((): boolean => {
        switch (snippet.is) {
          case "notEmpty": {
            return (evalResult as { readonly length: number }).length > 0;
          }
          case "notNull": {
            return evalResult === undefined || evalResult === null;
          }
          case "true": {
            return !!evalResult;
          }
        }
      })();
      const body = condition ? thenBody : elseBody;
      return resolveBody(body, input, snippets);
    }
    case "snippet-switch": {
      const { expression, branches } = snippet;
      const evalResult = evaluate(input, expression);
      const branch = branches[evalResult as string];
      if (!branch) {
        throw new Error("Branch not found: ".concat(evalResult as string));
      }
      return resolveBody(branch, input, snippets);
    }
  }
}

function indent(text: string, spaces: string): string {
  if (spaces.length <= 0) {
    return text;
  } else {
    return text.replace(/\n/g, "\n".concat(spaces));
  }
}

function evaluate<Input>(input: Input, expression: Expression): unknown {
  switch (expression.kind) {
    case "input": {
      return input;
    }
    case "property": {
      const { property } = expression;
      return (input as Record<string, unknown>)[property];
    }
  }
}

function resolveExamples(
  inputs: ReadonlyArray<{
    readonly input: unknown;
    readonly output: unknown;
  }>,
  body: Body,
  template: TemplateSpec,
): readonly FewShotExample[] {
  return inputs.map(({ input, output }) => ({
    userInstructions: resolveBody(body, input, template.snippets),
    assistantResponse: format(output, template.outputFormat),
  }));
}

function format(input: unknown, format?: InsertFormat): string {
  switch (format) {
    case undefined:
    case "text": {
      return String(input);
    }
    case "json": {
      return JSON.stringify(input, undefined, 2);
    }
    case "yaml": {
      return YAML.stringify(input);
    }
    case "toon": {
      return encodeToon(input);
    }
    case "csv":
    case "tsv": {
      const separator = format === "csv" ? "," : "\t";
      const array = input as ReadonlyArray<{ [k: string]: string | number }>;
      if (array.length <= 0) {
        return "";
      }
      const firstElement = array[0]!;
      const headerRow = Object.keys(firstElement).join(separator);
      const rows: string[] = [
        headerRow,
        ...array.map((e) => {
          return Object.values(e)
            .map((cell) => {
              const str = String(cell);
              if (separator === ",") {
                // CSV per RFC 4180: wrap in double quotes if the cell contains a
                // double quote, a comma, a newline, or a carriage return.
                return /[",\n\r]/.test(str)
                  ? '"'.concat(str.replace(/"/g, '""')).concat('"')
                  : str;
              } else {
                // TSV: no standard quoting; escape special characters with
                // backslash so the value remains a single field.
                return str
                  .replace(/\\/g, "\\\\")
                  .replace(/\t/g, "\\t")
                  .replace(/\n/g, "\\n")
                  .replace(/\r/g, "\\r");
              }
            })
            .join(separator);
        }),
      ];
      return rows.join("\n");
    }
  }
}

function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
`;
