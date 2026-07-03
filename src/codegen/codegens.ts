import { CodeGenerator } from "./codegen-types.js";
import { generateTypescriptCode } from "./typescript-codegen.js";

const CODE_GENERATORS: ReadonlyArray<CodeGenerator> = [
  generateTypescriptCode,
];
