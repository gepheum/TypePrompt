import type { CodeGenerator } from "./codegen-types.js";
import { generateCppCode } from "./cpp/cpp-codegen.js";
import { generateCSharpCode } from "./csharp/csharp-codegen.js";
import { generateDartCode } from "./dart/dart-codegen.js";
import { generateKotlinCode } from "./kotlin/kotlin-codegen.js";
import { generatePatchOverrides } from "./patch-overrides/patch-overrides-gen.js";
import { generatePythonCode } from "./python/python-codegen.js";
import { generateRustCode } from "./rust/rust-codegen.js";
import { generateSwiftCode } from "./swift/swift-codegen.js";
import { generateTypescriptCode } from "./typescript/typescript-codegen.js";

export const CODE_GENERATORS: ReadonlyArray<CodeGenerator> = [
  generateCppCode,
  generateCSharpCode,
  generateDartCode,
  generateKotlinCode,
  generatePythonCode,
  generateRustCode,
  generateSwiftCode,
  generateTypescriptCode,
  generatePatchOverrides,
];
