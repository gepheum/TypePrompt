export {
  parseCompilationResult,
  type CompilationResultParseError,
} from "./compilation-result-parser.js";

export {
  type CompilationResult,
  type Dataset,
  type DatasetItem,
  type DatasetValidationResult,
  type Template,
  type Tool,
  type ValidCompilationResult,
  type ValidDataset,
  type ValidNamespaceResult,
  type ValidTemplate,
  type ValidatedDataset,
  type ValidatedTool,
} from "./compiler-types.js";

export { compile, parseSourceFile } from "./compiler.js";

export { DEFAULT_NAMESPACE } from "./default-namespace.js";

export { getId } from "./ids.js";

export { makeTemplateOverrides, makeTemplates } from "./spec-maker.js";

export { runtimeTypesSchema } from "./spec-types-schema.js";

export * as Spec from "./spec-types.js";

export type { Templates } from "./spec-types.js";
