import { Template } from "./types.js";

export function generateCode(templates: readonly Template[]): string {
  let code = `// This file is auto-generated. Do not edit it directly.\n\n`;
  code += 'import * as zod from "zod"\n\n';
  code += "export class PromptMaker {\n";
  code += "}\n\n";
  code += "export class JsonPrompt<Response> {\n";
  code += "  constructor(\n";
  code += "    readonly prompt: string,\n";
  code += "    readonly responseSchema: zod.ZodType<Response>) {}\n";
  code += "}\n\n";
  return code;
}
