import type { Config } from "@typeprompt/core/config/config-parser.js";
import { ValidCompilationResult } from "../compiler/compiler-types.js";

export type OutputFile = {
  readonly path: string;
  readonly content: string;
};

export type CodeGenerator = (
  compilationResult: ValidCompilationResult,
  config: Config,
) => readonly OutputFile[];
