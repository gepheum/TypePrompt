import { Span } from "../util/common-types.js";

export type ExpressionNode =
  | LiteralExpression
  | WrappedExpression
  | InputExpression
  | DotOperation
  | UnaryOperation
  | BinaryOperation;

export type LiteralExpression = {
  readonly kind: "literal";
  readonly span: Span;
  readonly value:
    | { readonly kind: "null" }
    | { readonly kind: "boolean"; readonly value: boolean }
    | { readonly kind: "number"; readonly value: number }
    | { readonly kind: "string"; readonly value: string };
};

/** Expression wrapped in parenthesises. */
export type WrappedExpression = {
  readonly kind: "wrapped";
  /** Spans the whole expression, including the parentheses. */
  readonly span: Span;
  readonly expression: ExpressionNode;
};

/** The 'input' variable. */
export type InputExpression = {
  readonly kind: "input";
  readonly span: Span;
};

export type DotOperation = {
  readonly kind: "dot-operation";
  /** Spans the whole expression. */
  readonly span: Span;
  readonly left: ExpressionNode;
  readonly dot: "." | "?.";
  readonly dotSpan: Span;
  /** The identifier after the dot. */
  readonly right: Span;
};

export type UnaryOperation = {
  readonly kind: "unary-operation";
  /** Spans the whole expression. */
  readonly span: Span;
  readonly operator: "not";
  readonly operatorSpan: Span;
  readonly other: ExpressionNode;
};

export type BinaryOperation = {
  readonly kind: "binary-operation";
  /** Spans the whole expression. */
  readonly span: Span;
  readonly left: ExpressionNode;
  readonly operator:
    "<" | "<=" | "==" | "!=" | ">=" | ">" | "??" | "and" | "or";
  readonly operatorSpan: Span;
  readonly right: ExpressionNode;
};
