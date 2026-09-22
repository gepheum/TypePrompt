import { CodeGenerator } from "./codegen-types.js";
import { generateCSharpCode } from "./csharp/csharp-codegen.js";
import { generateDartCode } from "./dart/dart-codegen.js";
import { generateKotlinCode } from "./kotlin/kotlin-codegen.js";
import { generatePythonCode } from "./python/python-codegen.js";
import { generateRustCode } from "./rust/rust-codegen.js";
import { generateSwiftCode } from "./swift/swift-codegen.js";
import { generateTypescriptCode } from "./typescript/typescript-codegen.js";

export const CODE_GENERATORS: ReadonlyArray<CodeGenerator> = [
  generateCSharpCode,
  generateDartCode,
  generateKotlinCode,
  generatePythonCode,
  generateRustCode,
  generateSwiftCode,
  generateTypescriptCode,
];
