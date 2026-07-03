import { Config } from "../config/config-parser.js";
import type { ResolvedSchema, ResolvedType, Templates } from "../template/template-types.js";
import type { OutputFile } from "./codegen-types.js";

export function generateTypescriptCode(
  templates: Templates,
  config: Config,
): readonly OutputFile[] {
  const { generatedDotTsPath } = config;
  if (!generatedDotTsPath) {
    return [];
  }
  return [
    {
      path: generatedDotTsPath,
      content: new TypescriptCodeGenerator().write(templates),
    },
  ];
}

class TypescriptCodeGenerator {
  code = "";

  write(templates: Templates): string {
    this.code = `// This file is auto-generated. Do not edit it directly.\n\n`;
    this.code += "export namespace Meta {\n";
    if (templates.meta) {
      this.writeSchema(templates.meta, "  ");
    }
    this.code += "}\n\n";
    this.writePromptMakerClass(templates);
    this.writeJsonSpecType();
    this.writeFreezeJsonSpecFunction();
    this.writeJsonSpecValue(templates);
    this.writePromptOverriderConst();
    this.writeMakePromptImplFunction();
    this.code = this.code.replace(/\n[ \t]*\n([ \t]*})/g, "\n$1");
    return this.code;
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

  private writeJsonSpecValue(templates: Templates): void {
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

  private writePromptMakerClass(templates: Templates): void {
    this.code += "export type PromptSpec<Args, Response> = {\n";
    this.code += "  readonly make: (args: Args) => Response;\n";
    this.code += "  readonly responseType: Response;\n";
    this.code += "};\n\n";

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

  private writeSchema(schema: ResolvedSchema, indent: "  " | "    "): void {
    for (const type of schema.types) {
      const name = toTypeName(type.namePieces);
      if (type.kind === "interface") {
        this.code += `${indent}export type ${name} = {\n`;
        for (const field of type.fields) {
          const optional = field.optional ? "?" : "";
          this.code += `${indent}  ${field.name}${optional}: ${resolvedTypeToTs(field.type)};\n`;
        }
        this.code += `${indent}};\n\n`;
      } else if (type.kind === "string-union") {
        const members = type.values.map((v) => `| ${JSON.stringify(v)}`).join(" ");
        this.code += `${indent}export type ${name} = ${members};\n\n`;
      } else {
        const members = type.members
          .map((m) => `| ${toTypeName(m.namePieces)}`)
          .join(" ");
        this.code += `${indent}export type ${name} = ${members};\n\n`;
      }
    }
  }
}

function toTypeName(namePieces: readonly string[]): string {
  return namePieces
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("_");
}

function resolvedTypeToTs(type: ResolvedType): string {
  switch (type.kind) {
    case "primitive":
      return type.primitive === "int" ? "number" : type.primitive;
    case "ref":
      return toTypeName(type.namePieces);
    case "array":
      return `${resolvedTypeToTs(type.elementType)}[]`;
  }
}
