export {
  parseCompilationResult,
  type CompilationResultParseError,
} from "./compilation-result-parser.js";

export {
  type CompilationResult,
  type Template,
  type Tool,
  type ValidCompilationResult,
  type ValidNamespaceResult,
  type ValidTemplate,
  type ValidatedTool,
} from "./compiler-types.js";

export { compile, parseSourceFile } from "./compiler.js";

export { DEFAULT_NAMESPACE } from "./default-namespace.js";

export { getId } from "./ids.js";

export { makeTemplateOverrides, makeTemplates } from "./spec-maker.js";

export { runtimeTypesSchema } from "./spec-types-schema.js";

export * as Spec from "./spec-types.js";
