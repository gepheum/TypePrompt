import { CodeGenerator } from "./codegen-types.js";
import { generateTypescriptCode } from "./typescript/typescript-codegen.js";

export const CODE_GENERATORS: ReadonlyArray<CodeGenerator> = [
  generateTypescriptCode,
];
