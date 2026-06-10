import type { Template, TypeRef } from "./types.js";

export function generateCode(templates: readonly Template[]): string {
  return new TsCodeGenerator().write(templates);
}

class TsCodeGenerator {
  code = "";

  write(templates: readonly Template[]): string {
    this.code = `// This file is auto-generated. Do not edit it directly.\n\n`;
    this.code += 'import * as zod from "zod"\n\n';
    this.code += "export class PromptMaker {\n";
    this.code += "}\n\n";
    this.code += "export namespace PromptMaker {\n";
    for (const template of templates) {
      this.writeNamespace(template);
    }
    this.code += "}\n\n";
    this.code += "export class JsonPrompt<Response> {\n";
    this.code += "  constructor(\n";
    this.code += "    readonly prompt: string,\n";
    this.code += "    readonly responseSchema: zod.ZodType<Response>) {}\n";
    this.code += "}\n\n";
    return this.code;
  }

  private writeNamespace(template: Template): void {
    const { schema } = template;
    if (!schema) return;

    this.code += `  export namespace ${template.name.text} {\n`;
    for (const [name, declaration] of Object.entries(schema.types)) {
      if (declaration.kind === "interface") {
        this.code += `    export interface ${name} `;
        if (declaration.firstField) {
          this.code += "    {\n";
          for (const [name, field] of Object.entries(declaration.fields)) {
            const indent = "      ";
            const maybeQuestionMark = field.optional ? "?" : "";
            this.code += `${indent}readonly ${name}${maybeQuestionMark}: `;
            this.writeTypeRef(field.type, `\n${indent}`);
            this.code += ";\n";
          }
          this.code += "    }\n\n";
        } else {
          this.code += "{}\n\n";
        }
      } else {
        this.code += `    export type ${name} = `;
        this.writeTypeRef(declaration.valueType, "\n      ");
        this.code += ";\n\n";
      }
    }
    this.code += "  }\n\n";
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
        this.code += "{ ";
        for (const [name, field] of Object.entries(typeRef.fields)) {
          const maybeQuestionMark = field.optional ? "?" : "";
          this.code += `readonly ${name}${maybeQuestionMark}: `;
          this.writeTypeRef(field.type, eolIndent);
          this.code += "; ";
        }
        this.code += "}";
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
        this.code += `\n${eolIndent})`;
        break;
      }
    }
  }
}
