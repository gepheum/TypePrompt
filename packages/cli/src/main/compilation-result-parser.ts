import type {
  CompilationResult,
  ValidCompilationResult,
} from "@typeprompt/core/compiler/compiler-types.js";
import { compile } from "@typeprompt/core/compiler/compiler.js";
import { z } from "zod";
import type * as Spec from "../runtime/runtime-types.js";
import { ExitError } from "./exit-error.js";

export function parseCompilationResult(
  jsonContent: string,
  basePath: string,
): ValidCompilationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (e) {
    throw new ExitError(
      `Failed to parse JSON in ${basePath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const parseResult = TemplatesSchema.safeParse(parsed);
  if (!parseResult.success) {
    throw new ExitError(
      `Invalid templates JSON in ${basePath}: ${parseResult.error.message}`,
    );
  }

  const compilationResult: CompilationResult = compile(
    parseResult.data.sourceFiles,
    { cache: null, patchBase: null },
  );

  if (compilationResult.anyErrors) {
    throw new ExitError("Compilation of base project failed");
  }

  return compilationResult as ValidCompilationResult;
}

const TemplatesSchema: z.ZodType<Spec.Templates> = z.object({
  edition: z.number(),
  signature: z.string(),
  templates: z.record(z.string(), z.custom<Spec.Template>()),
  tools: z.record(z.string(), z.custom<Spec.Tool>()),
  singleNamespace: z.boolean(),
  sourceFiles: z.record(z.string(), z.string()),
});
