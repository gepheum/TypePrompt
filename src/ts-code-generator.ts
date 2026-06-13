import type {
  SchemaField,
  Template,
  TypeDeclaration,
  TypeRef,
} from "./types.js";

export function generateCode(templates: readonly Template[]): string {
  return new TsCodeGenerator().write(templates);
}

class TsCodeGenerator {
  private static readonly ZOD_INLINE_MAX_LENGTH = 300;
  code = "";

  write(templates: readonly Template[]): string {
    this.code = `// This file is auto-generated. Do not edit it directly.\n\n`;
    this.code += 'import * as zod from "zod"\n\n';
    this.writePromptMakerClass(templates);
    this.code += "export interface JsonPrompt<Response> {\n";
    this.code += "  readonly prompt: string;\n";
    this.code += "  readonly responseSchema: zod.ZodType<Response>;\n";
    this.code += "}\n\n";
    for (const template of templates) {
      this.writeTemplateTypes(template);
    }
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
    this.code += "        variant: overrideTemplate.variant,\n";
    this.code +=
      "        dedentedSourceCode: overrideTemplate.dedentedSourceCode,\n";
    this.code += "        allArgs: [...overrideTemplate.allArgs],\n";
    this.code +=
      '        pieces: overrideTemplate.pieces.map((piece) => piece.kind === "text"\n';
    this.code += '          ? {kind: "text", text: piece.text}\n';
    this.code += '          : {kind: "arg", name: piece.name}),\n';
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
    this.code += "  readonly variant: string;\n";
    this.code += "  readonly dedentedSourceCode: string;\n";
    this.code += "  readonly allArgs: readonly string[];\n";
    this.code += "  readonly pieces: readonly (\n";
    this.code += '    | {kind: "text"; text: string}\n';
    this.code += '    | {kind: "arg"; name: string}\n';
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

  private writeJsonSpecValue(templates: readonly Template[]): void {
    this.code += "const jsonSpec: JsonSpec = freezeJsonSpec({\n";
    for (const template of templates) {
      const name = template.name.text;
      const variant = template.variantName?.text ?? "";
      const templateKey = variant ? `${name}/${variant}` : name;
      this.code += `  ${JSON.stringify(templateKey)}: {\n`;
      this.code += `    name: ${JSON.stringify(name)},\n`;
      this.code += `    variant: ${JSON.stringify(variant)},\n`;
      this.code += `    dedentedSourceCode: ${JSON.stringify(template.dedentedSourceCode)},\n`;
      this.code += "    allArgs: [";
      let firstArg = true;
      for (const arg of template.parameters) {
        if (!firstArg) {
          this.code += ", ";
        }
        this.code += JSON.stringify(arg);
        firstArg = false;
      }
      this.code += "],\n";
      this.code += "    pieces: [\n";
      let pendingText = "";
      const flushPendingText = (): void => {
        if (pendingText === "") {
          return;
        }
        this.code += `      {kind: "text", text: ${JSON.stringify(pendingText)}},\n`;
        pendingText = "";
      };
      for (const piece of template.pieces) {
        if (piece.kind === "text") {
          pendingText += piece.text;
          continue;
        }
        if (piece.kind === "expression") {
          if (piece.hide) {
            continue;
          }
          flushPendingText();
          this.code += `      {kind: "arg", name: ${JSON.stringify(piece.expression)}},\n`;
          continue;
        }
        if (piece.kind === "schema") {
          // Hidden schema pieces are represented with empty text by the parser.
          if (piece.text === "") {
            continue;
          }
          pendingText += piece.text;
          continue;
        }
        if (piece.kind === "example") {
          pendingText += piece.text;
        }
      }
      flushPendingText();
      this.code += "    ],\n";
      this.code += "  },\n";
    }
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
    this.code += "    } else {\n";
    this.code += "      const arg = args[p.name];\n";
    this.code += "      if (arg === undefined) {\n";
    this.code += "        throw new Error(`Missing arg '${p.name}'`);\n";
    this.code += "      }\n";
    this.code += "      return arg;\n";
    this.code += "    }\n";
    this.code += '  }).join("");\n';
    this.code += "}\n\n";
  }

  private writePromptMakerClass(templates: readonly Template[]): void {
    this.code += "export class PromptMaker {\n";
    this.code += "  private readonly jsonSpec: JsonSpec;\n\n";
    this.code += "  // Call with no argument.\n";
    this.code += "  constructor(args?: {internalJsonSpec: unknown}) {\n";
    this.code += "    this.jsonSpec = args === undefined\n";
    this.code += "      ? jsonSpec\n";
    this.code += "      : (args.internalJsonSpec as JsonSpec);\n";
    this.code += "  }\n\n";
    for (const template of templates) {
      const templateName = template.name.text;
      const variant = template.variantName?.text ?? "";
      const templateKey = variant ? `${templateName}/${variant}` : templateName;
      const hasArgs = template.parameters.size > 0;
      const returnType = template.schema
        ? `JsonPrompt<${templateName}Response.Response>`
        : "string";
      const argsSignature = hasArgs ? `args: ${templateName}Args` : "";
      this.code += `  make${templateName}(${argsSignature}): ${returnType} {\n`;
      const argsExpression = hasArgs ? "argsRecord" : "{}";
      if (hasArgs) {
        this.code +=
          "    const argsRecord = args as unknown as {readonly [argName: string]: string};\n";
      }
      if (template.schema) {
        this.code += "    return {\n";
        this.code += `      prompt: makePromptImpl(${JSON.stringify(templateKey)}, ${argsExpression}, this.jsonSpec),\n`;
        this.code += `      responseSchema: ${templateName}ResponseZodType,\n`;
        this.code += "    };\n";
      } else {
        this.code += `    return makePromptImpl(${JSON.stringify(templateKey)}, ${argsExpression}, this.jsonSpec);\n`;
      }
      this.code += "  }\n\n";
    }
    this.code += "}\n\n";
  }

  private writeTemplateTypes(template: Template): void {
    const { schema } = template;

    if (template.parameters.size > 0) {
      this.code += `export interface ${template.name.text}Args {\n`;
      for (const param of template.parameters) {
        this.code += `  readonly ${param}: string;\n`;
      }
      this.code += `}\n\n`;
    }

    if (!schema) return;

    this.code += `export namespace ${template.name.text}Response {\n`;
    for (const [name, declaration] of Object.entries(schema.types)) {
      if (declaration.kind === "interface") {
        this.code += `  export interface ${name} `;
        if (declaration.firstField) {
          this.code += "  {\n";
          for (const [name, field] of Object.entries(declaration.fields)) {
            const indent = "    ";
            const maybeQuestionMark = field.optional ? "?" : "";
            this.code += `${indent}readonly ${name}${maybeQuestionMark}: `;
            this.writeTypeRef(field.type, `\n${indent}`);
            this.code += ";\n";
          }
          this.code += "  }\n\n";
        } else {
          this.code += "{}\n\n";
        }
      } else {
        this.code += `  export type ${name} = `;
        this.writeTypeRef(declaration.valueType, "\n  ");
        this.code += ";\n\n";
      }
    }
    this.code += "}\n\n";

    this.writeTemplateZodTypes(template);
  }

  private writeTemplateZodTypes(template: Template): void {
    const { schema } = template;
    if (!schema) return;

    const definedTypeNames = new Set<string>();
    for (const [name, declaration] of Object.entries(schema.types)) {
      const isResponse = name === "Response";
      const exportPrefix = isResponse ? "export " : "";
      const constName = this.getTemplateTypeZodConstName(
        template.name.text,
        name,
      );
      this.code += `${exportPrefix}const ${constName}: zod.ZodType<${template.name.text}Response.${name}> = `;
      this.writeZodForDeclaration(
        template.name.text,
        name,
        declaration,
        definedTypeNames,
        "",
      );
      this.code += "\n\n";
      definedTypeNames.add(name);
    }
  }

  private writeZodForDeclaration(
    templateName: string,
    declarationName: string,
    declaration: TypeDeclaration,
    definedTypeNames: ReadonlySet<string>,
    indent: string,
  ): void {
    if (declaration.kind === "interface") {
      this.writeZodObjectFromFields(
        templateName,
        declarationName,
        Object.values(declaration.fields),
        definedTypeNames,
        indent,
      );
      return;
    }

    this.writeZodTypeRef(
      templateName,
      declarationName,
      declaration.valueType,
      definedTypeNames,
      indent,
    );
  }

  private writeZodObjectFromFields(
    templateName: string,
    declarationName: string,
    fields: readonly SchemaField[],
    definedTypeNames: ReadonlySet<string>,
    indent: string,
  ): void {
    const inlineObject = this.renderZodObjectInline(
      templateName,
      declarationName,
      fields,
      definedTypeNames,
    );
    if (inlineObject.length <= TsCodeGenerator.ZOD_INLINE_MAX_LENGTH) {
      this.code += inlineObject;
      return;
    }

    this.code += "zod.object({\n";
    for (const field of fields) {
      this.code += `${indent}  ${JSON.stringify(field.name.text)}: `;
      this.writeZodTypeRef(
        templateName,
        declarationName,
        field.type,
        definedTypeNames,
        indent + "  ",
      );
      if (field.optional) {
        this.code += ".optional()";
      }
      this.code += ",\n";
    }
    this.code += `${indent}})`;
  }

  private renderZodObjectInline(
    templateName: string,
    declarationName: string,
    fields: readonly SchemaField[],
    definedTypeNames: ReadonlySet<string>,
  ): string {
    if (fields.length === 0) {
      return "zod.object({})";
    }

    const fieldsCode = fields.map((field) => {
      const optionalSuffix = field.optional ? ".optional()" : "";
      return `${JSON.stringify(field.name.text)}: ${this.renderZodTypeRefInline(
        templateName,
        declarationName,
        field.type,
        definedTypeNames,
      )}${optionalSuffix}`;
    });
    return `zod.object({${fieldsCode.join(", ")}})`;
  }

  private renderZodTypeRefInline(
    templateName: string,
    currentDeclarationName: string,
    typeRef: TypeRef,
    definedTypeNames: ReadonlySet<string>,
  ): string {
    switch (typeRef.kind) {
      case "type-name": {
        const typeName = typeRef.name.text;
        if (typeName === "string") return "zod.string()";
        if (typeName === "number") return "zod.number()";
        if (typeName === "boolean") return "zod.boolean()";

        const refConstName = this.getTemplateTypeZodConstName(
          templateName,
          typeName,
        );
        if (
          !definedTypeNames.has(typeName) ||
          typeName === currentDeclarationName
        ) {
          return `zod.lazy((): zod.ZodType<${templateName}Response.${typeName}> => ${refConstName})`;
        }
        return refConstName;
      }
      case "string-literal":
        return `zod.literal(${JSON.stringify(typeRef.value)})`;
      case "inline-interface":
        return this.renderZodObjectInline(
          templateName,
          currentDeclarationName,
          Object.values(typeRef.fields),
          definedTypeNames,
        );
      case "array":
        return `zod.array(${this.renderZodTypeRefInline(
          templateName,
          currentDeclarationName,
          typeRef.elementType,
          definedTypeNames,
        )})`;
      case "union": {
        if (typeRef.members.length === 1) {
          return this.renderZodTypeRefInline(
            templateName,
            currentDeclarationName,
            typeRef.members[0]!,
            definedTypeNames,
          );
        }

        const members = typeRef.members.map((member) =>
          this.renderZodTypeRefInline(
            templateName,
            currentDeclarationName,
            member,
            definedTypeNames,
          ),
        );
        return `zod.union([${members.join(", ")}])`;
      }
    }
  }

  private writeZodTypeRef(
    templateName: string,
    currentDeclarationName: string,
    typeRef: TypeRef,
    definedTypeNames: ReadonlySet<string>,
    indent: string,
  ): void {
    switch (typeRef.kind) {
      case "type-name": {
        const typeName = typeRef.name.text;
        if (typeName === "string") {
          this.code += "zod.string()";
          return;
        }
        if (typeName === "number") {
          this.code += "zod.number()";
          return;
        }
        if (typeName === "boolean") {
          this.code += "zod.boolean()";
          return;
        }

        const refConstName = this.getTemplateTypeZodConstName(
          templateName,
          typeName,
        );
        if (
          !definedTypeNames.has(typeName) ||
          typeName === currentDeclarationName
        ) {
          this.code += `zod.lazy((): zod.ZodType<${templateName}Response.${typeName}> => ${refConstName})`;
        } else {
          this.code += refConstName;
        }
        return;
      }
      case "string-literal":
        this.code += `zod.literal(${JSON.stringify(typeRef.value)})`;
        return;
      case "inline-interface":
        this.writeZodObjectFromFields(
          templateName,
          currentDeclarationName,
          Object.values(typeRef.fields),
          definedTypeNames,
          indent,
        );
        return;
      case "array":
        this.code += "zod.array(";
        this.writeZodTypeRef(
          templateName,
          currentDeclarationName,
          typeRef.elementType,
          definedTypeNames,
          indent,
        );
        this.code += ")";
        return;
      case "union": {
        if (typeRef.members.length === 1) {
          this.writeZodTypeRef(
            templateName,
            currentDeclarationName,
            typeRef.members[0]!,
            definedTypeNames,
            indent,
          );
          return;
        }

        this.code += "zod.union([";
        for (let i = 0; i < typeRef.members.length; i += 1) {
          if (i > 0) {
            this.code += ", ";
          }
          this.writeZodTypeRef(
            templateName,
            currentDeclarationName,
            typeRef.members[i]!,
            definedTypeNames,
            indent,
          );
        }
        this.code += "])";
        return;
      }
    }
  }

  private getTemplateTypeZodConstName(
    templateName: string,
    typeName: string,
  ): string {
    return `${templateName}${typeName}ZodType`;
  }

  private writeTypeRef(typeRef: TypeRef, eolIndent: string): void {
    switch (typeRef.kind) {
      case "type-name":
        this.code += typeRef.name.text;
        break;
      case "string-literal":
        this.code += JSON.stringify(typeRef.value);
        break;
      case "inline-interface":
        if (typeRef.firstField) {
          this.code += `{${eolIndent}`;
          for (const [name, field] of Object.entries(typeRef.fields)) {
            const maybeQuestionMark = field.optional ? "?" : "";
            this.code += `  readonly ${name}${maybeQuestionMark}: `;
            this.writeTypeRef(field.type, eolIndent + "  ");
            this.code += `;${eolIndent}`;
          }
          this.code += "}";
        } else {
          this.code += "{}";
        }
        break;
      case "array":
        this.code += "readonly ";
        this.writeTypeRef(typeRef.elementType, eolIndent);
        this.code += "[]";
        break;
      case "union": {
        const newEolIndent = eolIndent + "  ";
        this.code += "(";
        for (const member of typeRef.members) {
          this.code += `${newEolIndent}| `;
          this.writeTypeRef(member, newEolIndent);
        }
        this.code += `${eolIndent})`;
        break;
      }
    }
  }
}
