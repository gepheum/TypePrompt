import type { Config, ValidCompilationResult } from "@typeprompt/core";

export type OutputFile = {
  readonly path: string;
  readonly content: string;
};

export type CodeGenerator = (
  compilationResult: ValidCompilationResult,
  config: Config,
) => readonly OutputFile[];
