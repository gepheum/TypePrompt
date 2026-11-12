export {
  type Field,
  type FieldType,
  type Interface,
  type Literal,
  type NamingHint,
  type Optional,
  type Schema,
  type SchemaType,
  type Type,
  type TypeDeclarations,
  type TypeNameView,
  type Typed,
  type Union,
} from "./schema-types.js";

export {
  NAME_SCOPES,
  getNameDependencies,
  isLiteralType,
  type NameScope,
} from "./schema-utils.js";

export { resolveType } from "./type-resolver.js";

export { makeExampleValue } from "./example-maker.js";

export { normalizeSchemaValue } from "./value-normalizer.js";
