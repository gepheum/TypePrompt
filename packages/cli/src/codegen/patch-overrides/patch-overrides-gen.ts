import type { Config, Spec, ValidCompilationResult } from "@typeprompt/core";
import type { OutputFile } from "../codegen-types.js";

export function generatePatchOverrides(
  compilationResult: ValidCompilationResult,
  templatesData: Spec.Templates,
  config: Config,
): readonly OutputFile[] {
  if (!config.patch) return [];
  return [
    {
      path: config.patch.overrides,
      content: "", // TODO
    },
  ];
}
