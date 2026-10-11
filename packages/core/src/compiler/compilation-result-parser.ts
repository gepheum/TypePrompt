import { z } from "zod";
import type {
  CompilationResult,
  ValidCompilationResult,
} from "./compiler-types.js";
import { compile } from "./compiler.js";
import type * as Spec from "./spec-types.js";

export type CompilationResultParseError = {
  readonly anyErrors: true;
  readonly error: string;
};

export function parseCompilationResult(
  jsonContent: string,
  basePath: string,
): ValidCompilationResult | CompilationResultParseError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (e) {
    return {
      anyErrors: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const parseResult = TemplatesSchema.safeParse(parsed);
  if (!parseResult.success) {
    return {
      anyErrors: true,
      error: `Invalid templates JSON in ${basePath}: ${parseResult.error.message}`,
    };
  }

  const compilationResult: CompilationResult = compile(
    parseResult.data.sourceFiles,
    { cache: null, patchBase: null },
  );

  if (compilationResult.anyErrors) {
    return {
      anyErrors: true,
      error: "Compilation of base project failed",
    };
  }

  return compilationResult as ValidCompilationResult;
}

const TemplatesSchema: z.ZodType<Spec.Templates> = z.object({
  edition: z.number(),
  signature: z.string(),
  templates: z.record(z.string(), z.custom<Spec.Template>()),
  tools: z.record(z.string(), z.custom<Spec.Tool>()),
  sourceFiles: z.record(z.string(), z.string()),
});
