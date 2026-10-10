import {
  makeTemplateOverrides,
  type Config,
  type Spec,
  type ValidCompilationResult,
} from "@typeprompt/core";
import type { OutputFile } from "../codegen-types.js";

export function generatePatchOverrides(
  compilationResult: ValidCompilationResult,
  _templatesData: Spec.Templates,
  config: Config,
): readonly OutputFile[] {
  if (!config.patch) return [];
  if (!compilationResult.patchBase) return [];
  return [
    {
      path: config.patch.overrides,
      content: JSON.stringify(makeTemplateOverrides(compilationResult)),
    },
  ];
}
