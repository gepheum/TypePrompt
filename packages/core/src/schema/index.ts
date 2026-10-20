export {
  type Field,
  type FieldType,
  type Interface,
  type Literal,
  type NamingHint,
  type Optional,
  type Schema,
  type Type,
  type TypeDeclarations,
  type TypeNameView,
  type Union,
} from "./schema-types.js";

export {
  NAME_SCOPES,
  getNameDependencies,
  isLiteralType,
  unwrapNullable,
  type NameScope,
} from "./schema-utils.js";

export { resolveType } from "./type-resolver.js";
