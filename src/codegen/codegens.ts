import { CodeGenerator } from "./codegen-types.js";
import { generatePythonCode } from "./python/python-codegen.js";
import { generateTypescriptCode } from "./typescript/typescript-codegen.js";

export const CODE_GENERATORS: ReadonlyArray<CodeGenerator> = [
  generateTypescriptCode,
  generatePythonCode,
];
