import type { Config, Spec, ValidCompilationResult } from "@typeprompt/core";

export type OutputFile = {
  readonly path: string;
  readonly content: string;
};

export type CodeGenerator = (
  compilationResult: ValidCompilationResult,
  templatesData: Spec.Templates,
  config: Config,
) => readonly OutputFile[];
