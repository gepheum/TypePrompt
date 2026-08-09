import type { ValidCompilationResult } from "../../compiler/compiler-types.js";
import type { Config } from "../../config/config-parser.js";
import type { OutputFile } from "../codegen-types.js";

export function generatePythonCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const ts = config.gen.typescript;
  if (!ts || ts.enabled === false) {
    return [];
  }
  return [
    // {
    //   path: ts.file,
    //   content: writeAll(compilationResult),
    // },
  ];
}
