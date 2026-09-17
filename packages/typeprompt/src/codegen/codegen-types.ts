import { ValidCompilationResult } from "../compiler/compiler-types.js";
import type { Config } from "../config/config-parser.js";

export type OutputFile = {
  readonly path: string;
  readonly content: string;
};

export type CodeGenerator = (
  compilationResult: ValidCompilationResult,
  config: Config,
) => readonly OutputFile[];
