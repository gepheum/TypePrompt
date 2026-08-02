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
    this.writeDatatypes(metaSchema, Object.values(namespaces));
    this.writeTemplateIdTypeAlias(Object.values(templates));
    // this.writeTemplateTypes(compilationResult);
    this.writePromptMaker2Type(compilationResult);
    this.writePromptMakerClass(compilationResult);
    this.writeJsonSpecType();
    this.writeFreezeJsonSpecFunction();
    this.writeJsonSpecValue(compilationResult);
    this.writePromptOverriderConst();
    this.writeMakePromptImplFunction();
    this.code = this.code.replace(/\n[ \t]*\n([ \t]*})/g, "\n$1");
    return this.code;
  }

  private writeDatatypes(
    metaSchema: Schema,
    namespaces: readonly NamespaceResult[],
  ): void {
    const anyTypes = (schema: Schema): boolean =>
      Object.keys(schema.typeDeclarations).length > 0;
    this.code += "export declare namespace $ {\n";
    if (metaSchema.kind !== "success") throw new Error();
    if (anyTypes(metaSchema)) {
      this.code += "  export declare namespace Meta {\n";
      this.writeSchema(metaSchema, "Meta", "    ");
      this.code += "  }\n\n";
    }
    for (const namespace of namespaces) {
      this.code += `  export declare namespace ${namespace.name} {\n`;
      if (namespace.schema.kind !== "success") throw new Error();
      if (anyTypes(namespace.schema)) {
        this.code += `    export declare namespace Shared {\n`;
        this.writeSchema(namespace.schema, namespace.name, "      ");
        this.code += "    }\n\n";
      }
      for (const template of namespace.templates) {
        const templateName = template.template.name.text;
        this.code += `    export declare namespace ${templateName} {\n`;
        this.writeSchema(template.schema, namespace.name, "      ");
        this.code += "    }\n\n";
      }
      this.code += "  }\n\n";
    }
    this.code += "}\n\n";
  }

  private writeTemplateIdTypeAlias(
    templates: readonly TemplateValidationResult[],
  ): void {
    this.code += "export type TemplateId =";
    if (templates.length <= 0) {
      this.code += " never";
    } else {
      for (const template of templates) {
        if (template.kind !== "success") throw new Error();
        const namespace = template.template.namespace?.text ?? "Default";
        const templateName = template.template.name.text;
        this.code += `\n  | "${namespace}:${templateName}"`;
      }
    }
    this.code += ";\n\n";
  }

  private writePromptOverriderConst(): void {
    this.code += "export const promptOverrider = {\n";
    this.code += "  internalJsonSpec: jsonSpec,\n";
    this.code +=
      "  internalApplyOverrides(overrides: JsonSpec): PromptMaker {\n";
    this.code +=
      "    for (const [templateKey, overrideTemplate] of Object.entries(overrides)) {\n";
    this.code += "      const constantTemplate = jsonSpec[templateKey];\n";
    this.code += "      if (constantTemplate === undefined) {\n";
    this.code +=
      "        throw new Error(`Unknown template key '${templateKey}' in overrides`);\n";
    this.code += "      }\n";
    this.code +=
      "      if (overrideTemplate.allArgs.length !== constantTemplate.allArgs.length) {\n";
    this.code +=
      "        throw new Error(`Override args mismatch for template '${templateKey}'`);\n";
    this.code += "      }\n";
    this.code +=
      "      for (let i = 0; i < overrideTemplate.allArgs.length; i += 1) {\n";
    this.code +=
      "        if (overrideTemplate.allArgs[i] !== constantTemplate.allArgs[i]) {\n";
    this.code +=
      "          throw new Error(`Override args mismatch for template '${templateKey}'`);\n";
    this.code += "        }\n";
    this.code += "      }\n";
    this.code += "    }\n";
    this.code +=
      "    const copiedOverrides: Record<string, JsonSpec[string]> = {};\n";
    this.code +=
      "    for (const [templateKey, overrideTemplate] of Object.entries(overrides)) {\n";
    this.code += "      copiedOverrides[templateKey] = {\n";
    this.code += "        name: overrideTemplate.name,\n";
    this.code += "        allArgs: [...overrideTemplate.allArgs],\n";
    this.code +=
      '        pieces: overrideTemplate.pieces.map((piece) => piece.kind === "text"\n';
    this.code += '          ? {kind: "text", text: piece.text}\n';
    this.code +=
      '          : {kind: "arg", name: piece.name, indent: piece.indent}),\n';
    this.code += "      };\n";
    this.code += "    }\n";
    this.code += "    const mergedJsonSpec = freezeJsonSpec({\n";
    this.code += "      ...jsonSpec,\n";
    this.code += "      ...copiedOverrides,\n";
    this.code += "    });\n";
    this.code +=
      "    return new PromptMaker({internalJsonSpec: mergedJsonSpec});\n";
    this.code += "  },\n";
    this.code += "};\n\n";
  }

  private writeJsonSpecType(): void {
    this.code += "type JsonSpec = {readonly [templateKey: string]: {\n";
    this.code += "  readonly name: string;\n";
    this.code += "  readonly allArgs: readonly string[];\n";
    this.code += "  readonly pieces: readonly (\n";
    this.code += '    | {kind: "text"; text: string}\n';
    this.code +=
      '    | {kind: "arg"; name: string; indent: string | undefined}\n';
    this.code += "  )[];\n";
    this.code += "}};\n\n";
  }

  private writeFreezeJsonSpecFunction(): void {
    this.code += "function freezeJsonSpec(jsonSpec: JsonSpec): JsonSpec {\n";
    this.code += "  const freezeValue = (value: unknown): void => {\n";
    this.code +=
      '    if (value === null || typeof value !== "object" || Object.isFrozen(value)) {\n';
    this.code += "      return;\n";
    this.code += "    }\n";
    this.code += "    Object.freeze(value);\n";
    this.code += "    if (Array.isArray(value)) {\n";
    this.code += "      for (const item of value) {\n";
    this.code += "        freezeValue(item);\n";
    this.code += "      }\n";
    this.code += "      return;\n";
    this.code += "    }\n";
    this.code +=
      "    for (const child of Object.values(value as Record<string, unknown>)) {\n";
    this.code += "      freezeValue(child);\n";
    this.code += "    }\n";
    this.code += "  };\n";
    this.code += "  freezeValue(jsonSpec);\n";
    this.code += "  return jsonSpec;\n";
    this.code += "}\n\n";
  }

  private writeJsonSpecValue(compilationResult: CompilationResult): void {
    this.code += "const jsonSpec: JsonSpec = freezeJsonSpec({\n";
    // for (const template of Object.entries(templates.templates)) {
    //   this.code += `  ${JSON.stringify(templateKey)}: {\n`;
    //   this.code += `    name: ${JSON.stringify(template.name)},\n`;
    //   this.code += "    allArgs: [";
    //   for (let i = 0; i < template.args.length; i += 1) {
    //     if (i > 0) {
    //       this.code += ", ";
    //     }
    //     this.code += JSON.stringify(template.args[i]);
    //   }
    //   this.code += "],\n";
    //   this.code += "    pieces: [\n";
    //   for (const piece of template.content) {
    //     if (piece.kind === "text") {
    //       this.code += `      {kind: "text", text: ${JSON.stringify(piece.text)}},\n`;
    //     } else {
    //       this.code += `      {kind: "arg", name: ${JSON.stringify(piece.name)}, indent: ${JSON.stringify(piece.indent)}},\n`;
    //     }
    //   }
    //   this.code += "    ],\n";
    //   this.code += "  },\n";
    // }
    this.code += "});\n\n";
  }

  private writeMakePromptImplFunction(): void {
    this.code += "function makePromptImpl(\n";
    this.code += "  templateKey: string,\n";
    this.code += "  args: {readonly [argName: string]: string},\n";
    this.code += "  jsonSpec: JsonSpec,\n";
    this.code += "): string {\n";
    this.code += "  const templateSpec = jsonSpec[templateKey]!;\n";
    this.code += "  return templateSpec.pieces.map((p) => {\n";
    this.code += '    if (p.kind === "text") {\n';
    this.code += "      return p.text;\n";
    this.code += "    }\n";
    this.code += "    const arg = args[p.name];\n";
    this.code += "    if (arg === undefined) {\n";
    this.code += "      throw new Error(`Missing arg '${p.name}'`);\n";
    this.code += "    }\n";
    this.code += '    if (p.indent === undefined || p.indent === "") {\n';
    this.code += "      return arg;\n";
    this.code += "    }\n";
    this.code += '    return arg.split("\\n").join(`\\n${p.indent}`);\n';
    this.code += '  }).join("");\n';
    this.code += "}\n\n";
  }

  private writePromptMakerClass(compilationResult: CompilationResult): void {
    this.code += "export class PromptMaker {\n";
    this.code += "  private readonly jsonSpec: JsonSpec;\n\n";
    this.code += "  // Call with no argument.\n";
    this.code += "  constructor(args?: {internalJsonSpec: unknown}) {\n";
    this.code += "    this.jsonSpec = args === undefined\n";
    this.code += "      ? jsonSpec\n";
    this.code += "      : (args.internalJsonSpec as JsonSpec);\n";
    this.code += "  }\n\n";

    // for (const [templateKey, template] of Object.entries(templates.templates)) {
    //   const templateName = template.name;
    //   const hasArgs = template.args.length > 0;
    //   const argsSignature = hasArgs ? `args: ${templateName}Args` : "";
    //   this.code += `  make${templateName}(${argsSignature}): string {\n`;
    //   const argsExpression = hasArgs ? "argsRecord" : "{}";
    //   if (hasArgs) {
    //     this.code +=
    //       "    const argsRecord = args as unknown as {readonly [argName: string]: string};\n";
    //   }
    //   this.code += `    return makePromptImpl(${JSON.stringify(templateKey)}, ${argsExpression}, this.jsonSpec);\n`;
    //   this.code += "  }\n\n";
    // }

    this.code += "}\n\n";

    // for (const template of Object.values(templates.templates)) {
    //   if (template.args.length === 0) {
    //     continue;
    //   }
    //   this.code += `export interface ${template.name}Args {\n`;
    //   for (const arg of template.args) {
    //     this.code += `  readonly ${arg}: string;\n`;
    //   }
    //   this.code += "}\n\n";
    // }
  }

  private writePromptMaker2Type(compilationResult: CompilationResult): void {
    for (const namespace of Object.values(compilationResult.namespaces)) {
      for (const template of Object.values(namespace.templates)) {
        this.writeOutputZodType({
          schema: template.schema,
          namespace: namespace.name,
          templateName: template.template.name.text,
          indent: "  ",
        });
      }
    }
    // this.code += "export type PromptMaker2 = {\n";
    // for (const { namespace, templates: tmplList } of templates.namespaces) {
    //   this.code += `  readonly ${uncapitalize(namespace)}: {\n`;
    //   for (const template of tmplList) {
    //     const nsRef = `${namespace}Types`;
    //     const args = `${nsRef}.${template.name}.Args`;
    //     const response = `${nsRef}.${template.name}.Response`;
    //     this.code += `    readonly ${uncapitalize(template.name)}: PromptSpec<${args}, ${response}>;\n`;
    //   }
    //   this.code += "  };\n";
    // }
    // this.code += "};\n\n";
  }

  private writeSchema(
    schema: Schema,
    namespace: string,
    indent: "    " | "      ",
  ): void {
    for (const typeDeclaration of Object.values(schema.typeDeclarations)) {
      const name = typeDeclaration.name.text;
      this.code += wrapJsdoc(typeDeclaration.doc, indent);
      this.code += `${indent}export type ${name} =`;
      const spelledType = spellType(
        typeDeclaration.valueType,
        namespace,
        indent,
      );
      const maybeSpace = spelledType.startsWith("\n") ? "" : " ";
      this.code += `${maybeSpace}${spelledType};\n\n`;
    }
  }

  private writeOutputZodType(args: {
    readonly schema: Schema;
    readonly namespace: string;
    readonly templateName: string;
    readonly indent: string;
  }): void {
    const { schema, namespace, templateName: promptName, indent } = args;
    this.code += `((): z.ZodType<$.${namespace}.${promptName}.Output> => {\n`;

    const makeTypeId = (name: string, scope: NameScope): string =>
      scope === "defaultScope" ? name : "_".concat(name);

    const typeIdToStatus: { [id: string]: "pending" | "done" } = {};

    const writeLocalVar = (
      typeName: string,
      scope: NameScope,
      indent: string,
    ): void => {
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
          writeLocalVar(dep, s, indent);
        }
      }
      this.code += [
        indent,
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
      write(valueType, scope, indent);
      if (declaration.doc) {
        const quotedDoc = JSON.stringify(declaration.doc satisfies string);
        this.code += `.describe(${quotedDoc})`;
      }
      this.code += ";\n\n";
      typeIdToStatus[typeName] = "done";
    };

    const write = (type: Type, scope: NameScope, indent: string): null => {
      switch (type.kind) {
        case "any": {
          this.code += "z.any()";
          return null;
        }
        case "array": {
          write(type.elementType, scope, indent);
          this.code += ".array()";
          return null;
        }
        case "interface": {
          this.code += "z.object({\n";
          const indented = indent + "  ";
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
            this.code += [indented, field.name.text, ": "].join("");
            if (useLazy) {
              this.code += "z.lazy(() => ";
            }
            write(field.type, scope, indented);
            if (useLazy) {
              this.code += ")";
            }
            if (field.optional) {
              this.code += ".optional()";
            }
            const quotedDoc = JSON.stringify(field.doc satisfies string);
            this.code += `.describe(${quotedDoc}),\n`;
          }
          this.code += `${indent}})`;
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
          const indented = indent + "  ";
          this.code += `z.record(\n${indented}z.string(),\n${indented}`;
          write(type.valueType, scope, indented);
          this.code += `\n${indent})`;
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
          const indented = indent + "  ";
          for (const member of Object.values(type.members)) {
            this.code += indented;
            write(member, scope, indented);
            this.code += ",\n";
          }
          this.code += `${indent}})`;
          return null;
        }
      }
    };

    const indented = indent + "  ";
    writeLocalVar("Output", "defaultScope", indented);

    this.code += `${indented}return outputType;\n${indent}})()`;
  }
}

function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function toTypeName(namePieces: readonly string[]): string {
  return namePieces
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("_");
}

function spellType(type: Type, namespace: string, indent: string): string {
  switch (type.kind) {
    case "any": {
      return "unknown";
    }
    case "array": {
      const { elementType } = type;
      const indented = indent + "  ";
      const spelledElement = spellType(elementType, namespace, indented);
      if (elementType.kind === "union") {
        return `readonly (${spelledElement}\n${indent})[]`;
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
      const indented = indent + "  ";
      for (const [fieldName, field] of fields) {
        const jsdoc = wrapJsdoc(field.doc, indented);
        const spelledField = spellType(field.type, namespace, indented);
        const maybeSpace = spelledField.startsWith("\n") ? "" : " ";
        result += [
          jsdoc,
          indented,
          "readonly ",
          fieldName,
          ":",
          maybeSpace,
          spelledField,
          ";\n",
        ].join("");
      }
      result += `${indent}}`;
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
      const indented = indent + "  ";
      const spelledValue = spellType(type.valueType, namespace, indented);
      const maybeSpace = spelledValue.startsWith("\n") ? "" : " ";
      return [
        "{\n",
        indented,
        "[",
        type.keyName,
        ": string]:",
        maybeSpace,
        spelledValue,
        "\n",
        indent,
        "}",
      ].join("");
    }
    case "union": {
      const indented = indent.concat("  ");
      return type.members
        .map((m) => `\n${indent}  | `.concat(spellType(m, namespace, indented)))
        .join("");
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

function wrapJsdoc(doc: string, indent: string): string {
  if (!doc) return "";
  const lines = doc.split("\n");
  if (lines.length === 1 && doc.length - indent.length <= 73) {
    return `${indent}/** ${doc} */\n`;
  } else {
    let result = `${indent}/**\n`;
    for (const line of lines) {
      result += line ? `${indent} * ${line}\n` : `${indent} *\n`;
    }
    result += `${indent} */\n`;
    return result;
  }
}
