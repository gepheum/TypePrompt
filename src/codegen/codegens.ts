import { CodeGenerator } from "./codegen-types.js";
import { generateTypescriptCode } from "./to-typescript.js";

export const CODE_GENERATORS: ReadonlyArray<CodeGenerator> = [
  generateTypescriptCode,
];
