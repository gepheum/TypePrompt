import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseExpression } from "./expression-parser.js";
import type { ExpressionNode } from "./expression-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOk(source: string): ExpressionNode {
  const result = parseExpression(source);
  if (result.kind === "error") {
    throw new Error(
      `Expected success but got errors: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result;
}

function parseErr(
  source: string,
): { message: string; start: number; end: number }[] {
  const result = parseExpression(source);
  if (result.kind !== "error") {
    throw new Error(`Expected error but got: ${JSON.stringify(result)}`);
  }
  return result.errors as { message: string; start: number; end: number }[];
}

// ---------------------------------------------------------------------------
// Null literal
// ---------------------------------------------------------------------------

describe("parseExpression – null literal", () => {
  it("parses 'null'", () => {
    expect(parseOk("null")).toMatch({
      kind: "literal",
      span: { text: "null", start: 0, end: 4 },
      value: { kind: "null" },
    });
  });
});

// ---------------------------------------------------------------------------
// Boolean literals
// ---------------------------------------------------------------------------

describe("parseExpression – boolean literals", () => {
  it("parses 'true'", () => {
    expect(parseOk("true")).toMatch({
      kind: "literal",
      span: { text: "true", start: 0, end: 4 },
      value: { kind: "boolean", value: true },
    });
  });

  it("parses 'false'", () => {
    expect(parseOk("false")).toMatch({
      kind: "literal",
      span: { text: "false", start: 0, end: 5 },
      value: { kind: "boolean", value: false },
    });
  });
});

// ---------------------------------------------------------------------------
// Number literals
// ---------------------------------------------------------------------------

describe("parseExpression – number literals", () => {
  it("parses zero", () => {
    expect(parseOk("0")).toMatch({
      kind: "literal",
      span: { text: "0", start: 0, end: 1 },
      value: { kind: "number", value: 0 },
    });
  });

  it("parses a positive integer", () => {
    expect(parseOk("42")).toMatch({
      kind: "literal",
      span: { text: "42", start: 0, end: 2 },
      value: { kind: "number", value: 42 },
    });
  });

  it("parses a negative integer", () => {
    expect(parseOk("-7")).toMatch({
      kind: "literal",
      span: { text: "-7", start: 0, end: 2 },
      value: { kind: "number", value: -7 },
    });
  });

  it("parses a decimal number", () => {
    expect(parseOk("3.14")).toMatch({
      kind: "literal",
      value: { kind: "number", value: 3.14 },
    });
  });

  it("parses scientific notation", () => {
    expect(parseOk("1e10")).toMatch({
      kind: "literal",
      value: { kind: "number", value: 1e10 },
    });
  });

  it("parses negative scientific notation", () => {
    expect(parseOk("-2.5e-3")).toMatch({
      kind: "literal",
      value: { kind: "number", value: -2.5e-3 },
    });
  });

  it("parses scientific notation with uppercase E", () => {
    expect(parseOk("5E3")).toMatch({
      kind: "literal",
      value: { kind: "number", value: 5000 },
    });
  });
});

// ---------------------------------------------------------------------------
// String literals
// ---------------------------------------------------------------------------

describe("parseExpression – string literals", () => {
  it("parses an empty string", () => {
    expect(parseOk('""')).toMatch({
      kind: "literal",
      span: { text: '""', start: 0, end: 2 },
      value: { kind: "string", value: "" },
    });
  });

  it("parses a simple string", () => {
    expect(parseOk('"hello"')).toMatch({
      kind: "literal",
      value: { kind: "string", value: "hello" },
    });
  });

  it("parses a string with a newline escape", () => {
    expect(parseOk('"foo\\nbar"')).toMatch({
      kind: "literal",
      value: { kind: "string", value: "foo\nbar" },
    });
  });

  it("parses a string with a tab escape", () => {
    expect(parseOk('"foo\\tbar"')).toMatch({
      kind: "literal",
      value: { kind: "string", value: "foo\tbar" },
    });
  });

  it("parses a string with an escaped quote", () => {
    expect(parseOk('"say \\"hi\\""')).toMatch({
      kind: "literal",
      value: { kind: "string", value: 'say "hi"' },
    });
  });

  it("parses a string with a unicode escape", () => {
    expect(parseOk('"\\u0041"')).toMatch({
      kind: "literal",
      value: { kind: "string", value: "A" },
    });
  });

  it("records the span including quotes", () => {
    expect(parseOk('"hi"')).toMatch({
      span: { text: '"hi"', start: 0, end: 4 },
    });
  });
});

// ---------------------------------------------------------------------------
// Input expression
// ---------------------------------------------------------------------------

describe("parseExpression – input", () => {
  it("parses 'input'", () => {
    expect(parseOk("input")).toMatch({
      kind: "input",
      span: { text: "input", start: 0, end: 5 },
    });
  });
});

// ---------------------------------------------------------------------------
// Dot operations
// ---------------------------------------------------------------------------

describe("parseExpression – dot operations", () => {
  it("parses a simple dot access", () => {
    expect(parseOk("input.foo")).toMatch({
      kind: "dot-operation",
      dot: ".",
      dotSpan: { text: ".", start: 5, end: 6 },
      left: { kind: "input" },
      right: { text: "foo", start: 6, end: 9 },
    });
  });

  it("parses optional chaining '?.'", () => {
    expect(parseOk("input?.foo")).toMatch({
      kind: "dot-operation",
      dot: "?.",
      dotSpan: { text: "?.", start: 5, end: 7 },
      left: { kind: "input" },
      right: { text: "foo", start: 7, end: 10 },
    });
  });

  it("parses chained dot accesses left-associatively", () => {
    expect(parseOk("input.foo.bar")).toMatch({
      kind: "dot-operation",
      dot: ".",
      left: {
        kind: "dot-operation",
        dot: ".",
        left: { kind: "input" },
        right: { text: "foo" },
      },
      right: { text: "bar" },
    });
  });

  it("parses three-level chaining", () => {
    expect(parseOk("input.a.b.c")).toMatch({
      kind: "dot-operation",
      right: { text: "c" },
      left: {
        kind: "dot-operation",
        right: { text: "b" },
        left: {
          kind: "dot-operation",
          right: { text: "a" },
        },
      },
    });
  });

  it("parses mixed '.' and '?.' chaining", () => {
    expect(parseOk("input.foo?.bar")).toMatch({
      kind: "dot-operation",
      dot: "?.",
      left: {
        kind: "dot-operation",
        dot: ".",
        left: { kind: "input" },
        right: { text: "foo" },
      },
      right: { text: "bar" },
    });
  });

  it("parses identifiers with underscores and digits", () => {
    expect(parseOk("input._foo_2")).toMatch({
      kind: "dot-operation",
      right: { text: "_foo_2" },
    });
  });
});

// ---------------------------------------------------------------------------
// Unary 'not'
// ---------------------------------------------------------------------------

describe("parseExpression – unary not", () => {
  it("parses 'not true'", () => {
    expect(parseOk("not true")).toMatch({
      kind: "unary-operation",
      operator: "not",
      operatorSpan: { text: "not", start: 0, end: 3 },
      other: { kind: "literal", value: { kind: "boolean", value: true } },
    });
  });

  it("parses 'not false'", () => {
    expect(parseOk("not false")).toMatch({
      kind: "unary-operation",
      operator: "not",
      other: { kind: "literal", value: { kind: "boolean", value: false } },
    });
  });

  it("parses double negation 'not not false'", () => {
    expect(parseOk("not not false")).toMatch({
      kind: "unary-operation",
      operator: "not",
      other: {
        kind: "unary-operation",
        operator: "not",
        other: { kind: "literal", value: { kind: "boolean", value: false } },
      },
    });
  });

  it("parses 'not input.active'", () => {
    expect(parseOk("not input.active")).toMatch({
      kind: "unary-operation",
      operator: "not",
      other: {
        kind: "dot-operation",
        left: { kind: "input" },
        right: { text: "active" },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Equality operators
// ---------------------------------------------------------------------------

describe("parseExpression – equality operators", () => {
  it("parses '=='", () => {
    expect(parseOk("1 == 2")).toMatch({
      kind: "binary-operation",
      operator: "==",
      operatorSpan: { text: "==" },
      left: { kind: "literal", value: { kind: "number", value: 1 } },
      right: { kind: "literal", value: { kind: "number", value: 2 } },
    });
  });

  it("parses '!='", () => {
    expect(parseOk("1 != 2")).toMatch({
      kind: "binary-operation",
      operator: "!=",
      left: { kind: "literal", value: { kind: "number", value: 1 } },
      right: { kind: "literal", value: { kind: "number", value: 2 } },
    });
  });

  it("parses '==' without spaces", () => {
    expect(parseOk("1==2")).toMatch({
      kind: "binary-operation",
      operator: "==",
    });
  });

  it("chains '==' left-associatively", () => {
    // (1 == 2) == false
    expect(parseOk("1 == 2 == false")).toMatch({
      kind: "binary-operation",
      operator: "==",
      left: {
        kind: "binary-operation",
        operator: "==",
        left: { kind: "literal", value: { kind: "number", value: 1 } },
        right: { kind: "literal", value: { kind: "number", value: 2 } },
      },
      right: { kind: "literal", value: { kind: "boolean", value: false } },
    });
  });

  it("chains '!=' left-associatively", () => {
    expect(parseOk("1 != 2 != 3")).toMatch({
      kind: "binary-operation",
      operator: "!=",
      left: {
        kind: "binary-operation",
        operator: "!=",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Comparison operators
// ---------------------------------------------------------------------------

describe("parseExpression – comparison operators", () => {
  it("parses '<'", () => {
    expect(parseOk("1 < 2")).toMatch({
      kind: "binary-operation",
      operator: "<",
    });
  });

  it("parses '<='", () => {
    expect(parseOk("1 <= 2")).toMatch({
      kind: "binary-operation",
      operator: "<=",
    });
  });

  it("parses '>'", () => {
    expect(parseOk("2 > 1")).toMatch({
      kind: "binary-operation",
      operator: ">",
    });
  });

  it("parses '>='", () => {
    expect(parseOk("2 >= 1")).toMatch({
      kind: "binary-operation",
      operator: ">=",
    });
  });

  it("parses '<=' without spaces (not confused with '<')", () => {
    expect(parseOk("1<=2")).toMatch({
      kind: "binary-operation",
      operator: "<=",
    });
  });

  it("parses '>=' without spaces (not confused with '>')", () => {
    expect(parseOk("2>=1")).toMatch({
      kind: "binary-operation",
      operator: ">=",
    });
  });

  it("chains '<' left-associatively", () => {
    // (1 < 2) < 3
    expect(parseOk("1 < 2 < 3")).toMatch({
      kind: "binary-operation",
      operator: "<",
      left: {
        kind: "binary-operation",
        operator: "<",
        left: { kind: "literal", value: { kind: "number", value: 1 } },
        right: { kind: "literal", value: { kind: "number", value: 2 } },
      },
      right: { kind: "literal", value: { kind: "number", value: 3 } },
    });
  });
});

// ---------------------------------------------------------------------------
// Null coalesce
// ---------------------------------------------------------------------------

describe("parseExpression – null coalesce '??'", () => {
  it("parses '??'", () => {
    expect(parseOk("input.x ?? null")).toMatch({
      kind: "binary-operation",
      operator: "??",
      left: {
        kind: "dot-operation",
        left: { kind: "input" },
        right: { text: "x" },
      },
      right: { kind: "literal", value: { kind: "null" } },
    });
  });

  it("chains '??' left-associatively", () => {
    expect(parseOk("input.a ?? input.b ?? null")).toMatch({
      kind: "binary-operation",
      operator: "??",
      left: {
        kind: "binary-operation",
        operator: "??",
        left: {
          kind: "dot-operation",
          right: { text: "a" },
        },
        right: {
          kind: "dot-operation",
          right: { text: "b" },
        },
      },
      right: { kind: "literal", value: { kind: "null" } },
    });
  });

  it("does not confuse '??' with '?.' optional chaining", () => {
    // input?.foo must be a dot-operation, not null-coalesce
    expect(parseOk("input?.foo")).toMatch({
      kind: "dot-operation",
      dot: "?.",
    });
  });

  it("parses '??' without spaces", () => {
    expect(parseOk("null??null")).toMatch({
      kind: "binary-operation",
      operator: "??",
    });
  });
});

// ---------------------------------------------------------------------------
// Logical 'and' / 'or'
// ---------------------------------------------------------------------------

describe("parseExpression – logical operators", () => {
  it("parses 'and'", () => {
    expect(parseOk("true and false")).toMatch({
      kind: "binary-operation",
      operator: "and",
      left: { kind: "literal", value: { kind: "boolean", value: true } },
      right: { kind: "literal", value: { kind: "boolean", value: false } },
    });
  });

  it("parses 'or'", () => {
    expect(parseOk("true or false")).toMatch({
      kind: "binary-operation",
      operator: "or",
      left: { kind: "literal", value: { kind: "boolean", value: true } },
      right: { kind: "literal", value: { kind: "boolean", value: false } },
    });
  });

  it("chains 'and' left-associatively", () => {
    expect(parseOk("true and false and true")).toMatch({
      kind: "binary-operation",
      operator: "and",
      left: {
        kind: "binary-operation",
        operator: "and",
        left: { kind: "literal", value: { kind: "boolean", value: true } },
        right: { kind: "literal", value: { kind: "boolean", value: false } },
      },
      right: { kind: "literal", value: { kind: "boolean", value: true } },
    });
  });

  it("chains 'or' left-associatively", () => {
    expect(parseOk("true or false or true")).toMatch({
      kind: "binary-operation",
      operator: "or",
      left: {
        kind: "binary-operation",
        operator: "or",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Wrapped expressions
// ---------------------------------------------------------------------------

describe("parseExpression – wrapped expressions", () => {
  it("parses a parenthesised literal", () => {
    expect(parseOk("(true)")).toMatch({
      kind: "wrapped",
      expression: { kind: "literal", value: { kind: "boolean", value: true } },
    });
  });

  it("parses a parenthesised binary expression", () => {
    expect(parseOk("(1 == 2)")).toMatch({
      kind: "wrapped",
      expression: { kind: "binary-operation", operator: "==" },
    });
  });

  it("parses nested parentheses", () => {
    expect(parseOk("((input))")).toMatch({
      kind: "wrapped",
      expression: {
        kind: "wrapped",
        expression: { kind: "input" },
      },
    });
  });

  it("parses an 'or' expression inside parentheses", () => {
    expect(parseOk("(true or false)")).toMatch({
      kind: "wrapped",
      expression: { kind: "binary-operation", operator: "or" },
    });
  });
});

// ---------------------------------------------------------------------------
// Operator precedence
// ---------------------------------------------------------------------------

describe("parseExpression – operator precedence", () => {
  it("'not' binds tighter than 'and': 'not true and false' => (not true) and false", () => {
    expect(parseOk("not true and false")).toMatch({
      kind: "binary-operation",
      operator: "and",
      left: {
        kind: "unary-operation",
        operator: "not",
        other: { kind: "literal", value: { kind: "boolean", value: true } },
      },
      right: { kind: "literal", value: { kind: "boolean", value: false } },
    });
  });

  it("'and' binds tighter than 'or': 'true and false or true' => (true and false) or true", () => {
    expect(parseOk("true and false or true")).toMatch({
      kind: "binary-operation",
      operator: "or",
      left: {
        kind: "binary-operation",
        operator: "and",
        left: { kind: "literal", value: { kind: "boolean", value: true } },
        right: { kind: "literal", value: { kind: "boolean", value: false } },
      },
      right: { kind: "literal", value: { kind: "boolean", value: true } },
    });
  });

  it("comparison binds tighter than equality: '1 < 2 == true' => (1 < 2) == true", () => {
    expect(parseOk("1 < 2 == true")).toMatch({
      kind: "binary-operation",
      operator: "==",
      left: {
        kind: "binary-operation",
        operator: "<",
        left: { kind: "literal", value: { kind: "number", value: 1 } },
        right: { kind: "literal", value: { kind: "number", value: 2 } },
      },
      right: { kind: "literal", value: { kind: "boolean", value: true } },
    });
  });

  it("'??' binds tighter than comparison: 'input.a ?? null == null' => (input.a ?? null) == null", () => {
    expect(parseOk("input.a ?? null == null")).toMatch({
      kind: "binary-operation",
      operator: "==",
      left: {
        kind: "binary-operation",
        operator: "??",
        left: { kind: "dot-operation", right: { text: "a" } },
        right: { kind: "literal", value: { kind: "null" } },
      },
      right: { kind: "literal", value: { kind: "null" } },
    });
  });

  it("dot binds tighter than '??': 'input.a ?? input.b' has dot-ops as operands", () => {
    expect(parseOk("input.a ?? input.b")).toMatch({
      kind: "binary-operation",
      operator: "??",
      left: { kind: "dot-operation", right: { text: "a" } },
      right: { kind: "dot-operation", right: { text: "b" } },
    });
  });

  it("parentheses override 'and' over 'or': 'true and (false or true)'", () => {
    expect(parseOk("true and (false or true)")).toMatch({
      kind: "binary-operation",
      operator: "and",
      left: { kind: "literal", value: { kind: "boolean", value: true } },
      right: {
        kind: "wrapped",
        expression: {
          kind: "binary-operation",
          operator: "or",
          left: { kind: "literal", value: { kind: "boolean", value: false } },
          right: { kind: "literal", value: { kind: "boolean", value: true } },
        },
      },
    });
  });

  it("'not' applied to a dot-op: 'not input.active'", () => {
    expect(parseOk("not input.active")).toMatch({
      kind: "unary-operation",
      operator: "not",
      other: {
        kind: "dot-operation",
        left: { kind: "input" },
        right: { text: "active" },
      },
    });
  });

  it("'not' after 'or': 'true or not false' => true or (not false)", () => {
    expect(parseOk("true or not false")).toMatch({
      kind: "binary-operation",
      operator: "or",
      right: {
        kind: "unary-operation",
        operator: "not",
        other: { kind: "literal", value: { kind: "boolean", value: false } },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Whitespace handling
// ---------------------------------------------------------------------------

describe("parseExpression – whitespace", () => {
  it("ignores leading and trailing spaces", () => {
    expect(parseOk("  true  ")).toMatch({
      kind: "literal",
      value: { kind: "boolean", value: true },
    });
  });

  it("handles tabs and newlines", () => {
    expect(parseOk("\ttrue\n")).toMatch({
      kind: "literal",
      value: { kind: "boolean", value: true },
    });
  });

  it("handles many spaces around '=='", () => {
    expect(parseOk("  1   ==   2  ")).toMatch({
      kind: "binary-operation",
      operator: "==",
      left: { kind: "literal", value: { kind: "number", value: 1 } },
      right: { kind: "literal", value: { kind: "number", value: 2 } },
    });
  });

  it("handles spaces around 'and'", () => {
    expect(parseOk("true  and  false")).toMatch({
      kind: "binary-operation",
      operator: "and",
    });
  });
});

// ---------------------------------------------------------------------------
// Keyword boundary checks
// ---------------------------------------------------------------------------

describe("parseExpression – keyword boundaries", () => {
  it("does not treat 'andx' as the 'and' keyword", () => {
    expect(parseErr("andx")).toMatch([
      { message: "Unknown identifier 'andx'" },
    ]);
  });

  it("does not treat 'orx' as the 'or' keyword", () => {
    expect(parseErr("orx")).toMatch([{ message: "Unknown identifier 'orx'" }]);
  });

  it("does not treat 'notx' as the 'not' keyword", () => {
    expect(parseErr("notx")).toMatch([
      { message: "Unknown identifier 'notx'" },
    ]);
  });

  it("does not treat 'inputx' as the 'input' keyword", () => {
    expect(parseErr("inputx")).toMatch([
      { message: "Unknown identifier 'inputx'" },
    ]);
  });

  it("does not treat 'nullx' as 'null'", () => {
    expect(parseErr("nullx")).toMatch([
      { message: "Unknown identifier 'nullx'" },
    ]);
  });

  it("does not treat 'truex' as 'true'", () => {
    expect(parseErr("truex")).toMatch([
      { message: "Unknown identifier 'truex'" },
    ]);
  });

  it("does not treat 'falsex' as 'false'", () => {
    expect(parseErr("falsex")).toMatch([
      { message: "Unknown identifier 'falsex'" },
    ]);
  });

  it("recognises 'and' immediately followed by operator char as keyword", () => {
    // "true and(false)" — 'and' followed by '(' which is not an ident-part
    expect(parseOk("true and(false)")).toMatch({
      kind: "binary-operation",
      operator: "and",
      right: {
        kind: "wrapped",
        expression: {
          kind: "literal",
          value: { kind: "boolean", value: false },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Span information
// ---------------------------------------------------------------------------

describe("parseExpression – span information", () => {
  it("records spans on the 'input' keyword", () => {
    expect(parseOk("input")).toMatch({
      kind: "input",
      span: { text: "input", start: 0, end: 5 },
    });
  });

  it("records spans on number literals", () => {
    expect(parseOk("42")).toMatch({
      kind: "literal",
      span: { text: "42", start: 0, end: 2 },
    });
  });

  it("records spans on the dot operator", () => {
    expect(parseOk("input.foo")).toMatch({
      kind: "dot-operation",
      dotSpan: { text: ".", start: 5, end: 6 },
      right: { text: "foo", start: 6, end: 9 },
    });
  });

  it("records spans on the '?.' operator", () => {
    expect(parseOk("input?.foo")).toMatch({
      kind: "dot-operation",
      dotSpan: { text: "?.", start: 5, end: 7 },
      right: { text: "foo", start: 7, end: 10 },
    });
  });

  it("records spans on the 'not' operator", () => {
    expect(parseOk("not true")).toMatch({
      kind: "unary-operation",
      operatorSpan: { text: "not", start: 0, end: 3 },
    });
  });

  it("records spans on binary operators", () => {
    expect(parseOk("1 == 2")).toMatch({
      kind: "binary-operation",
      operatorSpan: { text: "==", start: 2, end: 4 },
    });
  });

  it("records spans on '!=' operator", () => {
    expect(parseOk("1 != 2")).toMatch({
      kind: "binary-operation",
      operatorSpan: { text: "!=", start: 2, end: 4 },
    });
  });

  it("records spans on 'and' operator", () => {
    expect(parseOk("true and false")).toMatch({
      kind: "binary-operation",
      operatorSpan: { text: "and", start: 5, end: 8 },
    });
  });

  it("records spans on 'or' operator", () => {
    expect(parseOk("true or false")).toMatch({
      kind: "binary-operation",
      operatorSpan: { text: "or", start: 5, end: 7 },
    });
  });

  it("records spans on '??' operator", () => {
    expect(parseOk("null??null")).toMatch({
      kind: "binary-operation",
      operatorSpan: { text: "??", start: 4, end: 6 },
    });
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("parseExpression – errors", () => {
  it("rejects an empty string", () => {
    expect(parseErr("")).toMatch([{ message: "Expected expression" }]);
  });

  it("rejects an unknown identifier", () => {
    expect(parseErr("foo")).toMatch([{ message: "Unknown identifier 'foo'" }]);
  });

  it("rejects trailing content after a valid expression", () => {
    expect(parseErr("true false")).toMatch([
      { message: "Unexpected trailing content after expression" },
    ]);
  });

  it("rejects '?' as an unexpected character (ternary is not supported)", () => {
    expect(parseErr("?")).toMatch([{ message: "Unexpected character" }]);
  });

  it("rejects 'true ? null : null' (ternary operator is not supported)", () => {
    expect(parseErr("true ? null : null")).toMatch([
      { message: "Unexpected trailing content after expression" },
    ]);
  });

  it("rejects '!' as an unexpected character", () => {
    expect(parseErr("!")).toMatch([{ message: "Unexpected character" }]);
  });

  it("rejects a dot without a following identifier", () => {
    expect(parseErr("input.")).toMatch([
      { message: "Expected identifier after '.'" },
    ]);
  });

  it("rejects '?.' without a following identifier", () => {
    expect(parseErr("input?.")).toMatch([
      { message: "Expected identifier after '.'" },
    ]);
  });

  it("rejects a dot followed by a non-identifier character", () => {
    expect(parseErr("input.1")).toMatch([
      { message: "Expected identifier after '.'" },
    ]);
  });

  it("rejects an unclosed parenthesis", () => {
    expect(parseErr("(true")).toMatch([{ message: "Expected ')'" }]);
  });

  it("rejects empty parentheses", () => {
    expect(parseErr("()")).toMatch([{ message: "Unexpected character" }]);
  });

  it("rejects 'not' with no operand", () => {
    expect(parseErr("not")).toMatch([{ message: "Expected expression" }]);
  });

  it("rejects missing right-hand operand for 'and'", () => {
    expect(parseErr("true and")).toMatch([{ message: "Expected expression" }]);
  });

  it("rejects missing right-hand operand for 'or'", () => {
    expect(parseErr("true or")).toMatch([{ message: "Expected expression" }]);
  });

  it("rejects missing right-hand operand for '=='", () => {
    expect(parseErr("1 ==")).toMatch([{ message: "Expected expression" }]);
  });

  it("rejects missing right-hand operand for '!='", () => {
    expect(parseErr("1 !=")).toMatch([{ message: "Expected expression" }]);
  });

  it("rejects missing right-hand operand for '<'", () => {
    expect(parseErr("1 <")).toMatch([{ message: "Expected expression" }]);
  });

  it("rejects missing right-hand operand for '<='", () => {
    expect(parseErr("1 <=")).toMatch([{ message: "Expected expression" }]);
  });

  it("rejects missing right-hand operand for '>'", () => {
    expect(parseErr("1 >")).toMatch([{ message: "Expected expression" }]);
  });

  it("rejects missing right-hand operand for '>='", () => {
    expect(parseErr("1 >=")).toMatch([{ message: "Expected expression" }]);
  });

  it("rejects missing right-hand operand for '??'", () => {
    expect(parseErr("null ??")).toMatch([{ message: "Expected expression" }]);
  });

  it("rejects an unterminated string literal", () => {
    expect(parseErr('"hello')).toMatch([
      { message: "Expected closing quote for string literal" },
    ]);
  });

  it("rejects '-' alone (not a valid number)", () => {
    expect(parseErr("-")).toMatch([{ message: "Expected number" }]);
  });

  it("records the span of a trailing-content error", () => {
    expect(parseErr("true false")).toMatch([
      {
        start: 5,
        end: 10,
        message: "Unexpected trailing content after expression",
      },
    ]);
  });

  it("records the span of an 'Expected expression' error at end of input", () => {
    expect(parseErr("true and")).toMatch([{ start: 8, end: 8 }]);
  });

  it("records the span of a dot-without-identifier error", () => {
    expect(parseErr("input.")).toMatch([{ start: 6, end: 6 }]);
  });
});
