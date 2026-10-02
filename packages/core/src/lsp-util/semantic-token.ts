import { Span } from "../util/shared-types.js";

export type SemanticToken = {
  readonly span: Span;
  readonly kind:
    | "comment"
    | "xml-tag-name"
    | "xml-attribute"
    | "schema-keyword" // "type" or "interface"
    | "string" // string literal
    | "boolean" // boolean literal
    | "number"; // number literal
};
