import {
  makeTemplateOverrides,
  type Config,
  type ValidCompilationResult,
} from "@typeprompt/core";
import type { OutputFile } from "../codegen-types.js";

export function generatePatchOverrides(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  if (!config.patch) return [];
  if (!compilationResult.patchBase) return [];
  return [
    {
      path: config.patch.overrides,
      content: JSON.stringify(
        makeTemplateOverrides(compilationResult),
        undefined,
        2,
      ),
    },
  ];
}
