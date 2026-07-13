import { SourceSpan } from "../util/error-types.js";

export type ExpressionNode =
  | LiteralExpression
  | WrappedExpression
  | InputExpression
  | DotOperation
  | UnaryOperation
  | BinaryOperation;

export type LiteralExpression = {
  readonly kind: "literal";
  readonly span: SourceSpan;
  readonly value:
    | { readonly kind: "null" }
    | { readonly kind: "boolean"; readonly value: boolean }
    | { readonly kind: "number"; readonly value: number }
    | { readonly kind: "string"; readonly value: string };
};

/** Expression wrapped in parenthesises. */
export type WrappedExpression = {
  readonly kind: "wrapped";
  readonly expression: ExpressionNode;
};

/** The 'input' variable. */
export type InputExpression = {
  readonly kind: "input";
  readonly span: SourceSpan;
};

export type DotOperation = {
  readonly kind: "dot-operation";
  readonly left: ExpressionNode;
  readonly dot: "." | "?.";
  readonly dotSpan: SourceSpan;
  /** The identifier after the dot. */
  readonly right: SourceSpan;
};

export type UnaryOperation = {
  readonly kind: "unary-operation";
  readonly operator: "not";
  readonly operatorSpan: SourceSpan;
  readonly other: ExpressionNode;
};

export type BinaryOperation = {
  readonly kind: "binary-operation";
  readonly left: ExpressionNode;
  readonly operator:
    | "<"
    | "<="
    | "=="
    | "!="
    | ">="
    | ">"
    | "??"
    | "and"
    | "or";
  readonly operatorSpan: SourceSpan;
  readonly right: ExpressionNode;
};
