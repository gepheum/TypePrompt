import type { Template } from "./types.js";

export function generateCode(templates: readonly Template[]): string {
  return new TsCodeGenerator().generate(templates);
}

class TsCodeGenerator {
  code = "";

  generate(templates: readonly Template[]): string {
    this.code = `// This file is auto-generated. Do not edit it directly.\n\n`;
    this.code += 'import * as zod from "zod"\n\n';
    this.code += "export class PromptMaker {\n";
    this.code += "}\n\n";
    this.code += "export namespace PromptMaker {\n";
    for (const template of templates) {
      this.generateNamespace(template);
    }
    this.code += "}\n\n";
    this.code += "export class JsonPrompt<Response> {\n";
    this.code += "  constructor(\n";
    this.code += "    readonly prompt: string,\n";
    this.code += "    readonly responseSchema: zod.ZodType<Response>) {}\n";
    this.code += "}\n\n";
    return this.code;
  }

  private generateNamespace(template: Template): void {
    const { schema } = template;
    if (!schema) return;

    this.code += `  export namespace ${template.name.text} {\n`;
    for (const [name, declaration] of Object.entries(schema.types)) {
      if (declaration.kind === "interface") {
        this.code += `    export interface ${name} {\n`;
        this.code += "    }\n\n";
      } else {
        this.code += `    export type ${name} = string;\n\n`;
      }
    }
    this.code += "  }\n\n";
  }
}
