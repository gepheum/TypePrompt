import type { Template, TypeRef } from "./types.js";

export function generateCode(templates: readonly Template[]): string {
  return new TsCodeGenerator().write(templates);
}

class TsCodeGenerator {
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
    this.code = this.code.replace(/\n[ \t]*\n([ \t]*})/g, "\n$1");
    return this.code;
  }

  private writePromptMakerClass(templates: readonly Template[]): void {
    this.code += "export class PromptMaker {\n";
    for (const template of templates) {
      const templateName = template.name.text;
      const hasArgs = template.parameters.size > 0;
      const returnType = template.schema
        ? `JsonPrompt<${templateName}Response.Response>`
        : "string";
      const argsSignature = hasArgs ? `args: ${templateName}Args` : "";
      this.code += `  make${templateName}(${argsSignature}): ${returnType} {\n`;
      this.code += "    throw new Error(\"Not implemented\");\n";
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
        this.writeTypeRef(declaration.valueType, "\n    ");
        this.code += ";\n\n";
      }
    }
    this.code += "}\n\n";
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
        this.code += "readonly "
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
