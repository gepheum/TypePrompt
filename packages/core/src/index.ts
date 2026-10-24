export {
  DEFAULT_NAMESPACE,
  Spec,
  compile,
  getId,
  makeTemplateOverrides,
  makeTemplates,
  parseCompilationResult,
  parseSourceFile,
  runtimeTypesSchema,
  type CompilationResult,
  type CompilationResultParseError,
  type Dataset,
  type DatasetItem,
  type DatasetValidationResult,
  type Template,
  type Templates,
  type Tool,
  type ValidCompilationResult,
  type ValidDataset,
  type ValidNamespaceResult,
  type ValidTemplate,
  type ValidatedDataset,
  type ValidatedTool,
} from "./compiler/index.js";

export { CONFIG, parseConfigYaml, type Config } from "./config/index.js";

export * as Lsp from "./lsp-util/index.js";

export {
  NAME_SCOPES,
  getNameDependencies,
  isLiteralType,
  resolveType,
  unwrapNullable,
  type Field,
  type FieldType,
  type Interface,
  type Literal,
  type NameScope,
  type NamingHint,
  type Optional,
  type Schema,
  type Type,
  type TypeDeclarations,
  type TypeNameView,
  type Union,
} from "./schema/index.js";

export {
  capitalize,
  createLineFinder,
  findLine,
  toCamelCase,
  toPascalCase,
  toScreamCase,
  toSnakeCase,
  uncapitalize,
  type AssertSatisfies,
  type DefinitionLink,
  type InternalError,
  type LineFinderData,
  type LineMatch,
  type Span,
  type TextSpan,
} from "./util/index.js";

export {
  parseXmlDocument,
  type Attribute,
  type ElementNode,
  type KnownAttribute,
  type KnownTag,
  type XmlComment,
  type XmlDocument,
  type XmlNode,
} from "./xml/index.js";
