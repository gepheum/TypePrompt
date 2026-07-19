import type {
  InternalError,
  InternalErrors,
  SourceSpan,
} from "../util/common-types.js";
import type { ExpressionNode, LiteralExpression } from "./expression-types.js";

export function parseExpression(
  source: string,
): ExpressionNode | InternalErrors {
  const parser = new ExpressionParser(source);
  parser.skipSpaces();

  if (parser.cursor >= source.length) {
    parser.pushError(parser.cursor, parser.cursor, "Expected expression");
    return { kind: "error", errors: parser.errors };
  }

  const expr = parser.parseOr();
  if (!expr) {
    return { kind: "error", errors: parser.errors };
  }

  parser.skipSpaces();
  if (parser.cursor < source.length) {
    parser.pushError(
      parser.cursor,
      source.length,
      "Unexpected trailing content after expression",
    );
  }

  if (parser.errors.length > 0) {
    return { kind: "error", errors: parser.errors };
  }

  return expr;
}

class ExpressionParser {
  cursor = 0;
  readonly errors: InternalError[] = [];

  constructor(readonly text: string) {}

  parseOr(): ExpressionNode | null {
    let left = this.parseAnd();
    if (!left) return null;

    while (true) {
      this.skipSpaces();
      const opStart = this.cursor;
      if (!this.consumeKeyword("or")) break;
      const operatorSpan = this.span(opStart, this.cursor);
      this.skipSpaces();
      const right = this.parseAnd();
      if (!right) return null;
      left = {
        kind: "binary-operation",
        span: this.span(left.span.start, right.span.end),
        left,
        operator: "or",
        operatorSpan,
        right,
      };
    }

    return left;
  }

  parseAnd(): ExpressionNode | null {
    let left = this.parseNot();
    if (!left) return null;

    while (true) {
      this.skipSpaces();
      const opStart = this.cursor;
      if (!this.consumeKeyword("and")) break;
      const operatorSpan = this.span(opStart, this.cursor);
      this.skipSpaces();
      const right = this.parseNot();
      if (!right) return null;
      left = {
        kind: "binary-operation",
        span: this.span(left.span.start, right.span.end),
        left,
        operator: "and",
        operatorSpan,
        right,
      };
    }

    return left;
  }

  parseNot(): ExpressionNode | null {
    const opStart = this.cursor;
    if (this.consumeKeyword("not")) {
      const operatorSpan = this.span(opStart, this.cursor);
      this.skipSpaces();
      const other = this.parseNot();
      if (!other) return null;
      return {
        kind: "unary-operation",
        span: this.span(opStart, other.span.end),
        operator: "not",
        operatorSpan,
        other,
      };
    }
    return this.parseEquality();
  }

  parseEquality(): ExpressionNode | null {
    let left = this.parseComparison();
    if (!left) return null;

    while (true) {
      this.skipSpaces();
      const opStart = this.cursor;
      let operator: "==" | "!=" | undefined;
      if (this.text.startsWith("==", this.cursor)) {
        this.cursor += 2;
        operator = "==";
      } else if (this.text.startsWith("!=", this.cursor)) {
        this.cursor += 2;
        operator = "!=";
      } else {
        break;
      }
      const operatorSpan = this.span(opStart, this.cursor);
      this.skipSpaces();
      const right = this.parseComparison();
      if (!right) return null;
      left = {
        kind: "binary-operation",
        span: this.span(left.span.start, right.span.end),
        left,
        operator,
        operatorSpan,
        right,
      };
    }

    return left;
  }

  parseComparison(): ExpressionNode | null {
    let left = this.parseNullCoalesce();
    if (!left) return null;

    while (true) {
      this.skipSpaces();
      const opStart = this.cursor;
      let operator: "<" | "<=" | ">=" | ">" | undefined;
      if (this.text.startsWith("<=", this.cursor)) {
        this.cursor += 2;
        operator = "<=";
      } else if (this.text.startsWith(">=", this.cursor)) {
        this.cursor += 2;
        operator = ">=";
      } else if (this.text[this.cursor] === "<") {
        this.cursor += 1;
        operator = "<";
      } else if (this.text[this.cursor] === ">") {
        this.cursor += 1;
        operator = ">";
      } else {
        break;
      }
      const operatorSpan = this.span(opStart, this.cursor);
      this.skipSpaces();
      const right = this.parseNullCoalesce();
      if (!right) return null;
      left = {
        kind: "binary-operation",
        span: this.span(left.span.start, right.span.end),
        left,
        operator,
        operatorSpan,
        right,
      };
    }

    return left;
  }

  parseNullCoalesce(): ExpressionNode | null {
    let left = this.parseDot();
    if (!left) return null;

    while (true) {
      this.skipSpaces();
      if (!this.text.startsWith("??", this.cursor)) break;
      const opStart = this.cursor;
      this.cursor += 2;
      const operatorSpan = this.span(opStart, this.cursor);
      this.skipSpaces();
      const right = this.parseDot();
      if (!right) return null;
      left = {
        kind: "binary-operation",
        span: this.span(left.span.start, right.span.end),
        left,
        operator: "??",
        operatorSpan,
        right,
      };
    }

    return left;
  }

  parseDot(): ExpressionNode | null {
    let left = this.parsePrimary();
    if (!left) return null;

    while (true) {
      this.skipSpaces();
      const dotStart = this.cursor;
      let dot: "." | "?.";
      if (this.text.startsWith("?.", this.cursor)) {
        this.cursor += 2;
        dot = "?.";
      } else if (this.text[this.cursor] === ".") {
        this.cursor += 1;
        dot = ".";
      } else {
        break;
      }
      const dotSpan = this.span(dotStart, this.cursor);

      const identStart = this.cursor;
      if (
        this.cursor >= this.text.length ||
        !isIdentStart(this.text[this.cursor]!)
      ) {
        this.pushError(
          this.cursor,
          Math.min(this.cursor + 1, this.text.length),
          "Expected identifier after '.'",
        );
        return null;
      }
      while (
        this.cursor < this.text.length &&
        isIdentPart(this.text[this.cursor]!)
      ) {
        this.cursor += 1;
      }
      const right = this.span(identStart, this.cursor);
      left = {
        kind: "dot-operation",
        span: this.span(left.span.start, this.cursor),
        left,
        dot,
        dotSpan,
        right,
      };
    }

    return left;
  }

  parsePrimary(): ExpressionNode | null {
    if (this.cursor >= this.text.length) {
      this.pushError(this.cursor, this.cursor, "Expected expression");
      return null;
    }

    const ch = this.text[this.cursor]!;

    if (ch === "(") {
      const start = this.cursor;
      this.cursor += 1;
      this.skipSpaces();
      const inner = this.parseOr();
      if (!inner) return null;
      this.skipSpaces();
      if (this.text[this.cursor] !== ")") {
        this.pushError(
          this.cursor,
          Math.min(this.cursor + 1, this.text.length),
          "Expected ')'",
        );
        return null;
      }
      this.cursor += 1;
      return {
        kind: "wrapped",
        span: this.span(start, this.cursor),
        expression: inner,
      };
    }

    if (ch === '"' || ch === "'") {
      return this.parseStringLiteral(ch as '"' | "'");
    }

    if (ch === "-" || /[0-9]/.test(ch)) {
      return this.parseNumberLiteral();
    }

    if (isIdentStart(ch)) {
      return this.parseKeywordOrIdentifier();
    }

    this.pushError(
      this.cursor,
      Math.min(this.cursor + 1, this.text.length),
      "Unexpected character",
    );
    return null;
  }

  parseKeywordOrIdentifier(): ExpressionNode | null {
    const start = this.cursor;
    while (
      this.cursor < this.text.length &&
      isIdentPart(this.text[this.cursor]!)
    ) {
      this.cursor += 1;
    }
    const word = this.text.slice(start, this.cursor);
    const s = this.span(start, this.cursor);

    switch (word) {
      case "null":
        return { kind: "literal", span: s, value: { kind: "null" } };
      case "true":
        return {
          kind: "literal",
          span: s,
          value: { kind: "boolean", value: true },
        };
      case "false":
        return {
          kind: "literal",
          span: s,
          value: { kind: "boolean", value: false },
        };
      case "input":
        return { kind: "input", span: s };
      default:
        this.pushError(start, this.cursor, `Unknown identifier '${word}'`);
        return null;
    }
  }

  parseStringLiteral(quote: '"' | "'"): LiteralExpression | null {
    const start = this.cursor;
    this.cursor += 1;

    while (this.cursor < this.text.length) {
      const ch = this.text[this.cursor]!;
      if (ch === "\\") {
        this.cursor += 2;
        continue;
      }
      if (ch === quote) {
        const end = this.cursor + 1;
        const raw = this.text.slice(start, end);
        this.cursor = end;
        let value: string;
        try {
          const jsonRaw = quote === '"' ? raw : singleToDoubleQuoted(raw);
          value = JSON.parse(jsonRaw) as string;
        } catch {
          this.pushError(start, end, "Invalid string escape sequence");
          return null;
        }
        return {
          kind: "literal",
          span: this.span(start, end),
          value: { kind: "string", value },
        };
      }
      this.cursor += 1;
    }

    this.pushError(
      start,
      this.cursor,
      "Expected closing quote for string literal",
    );
    return null;
  }

  parseNumberLiteral(): LiteralExpression | null {
    const start = this.cursor;
    const match = this.text
      .slice(this.cursor)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) {
      this.pushError(
        this.cursor,
        Math.min(this.cursor + 1, this.text.length),
        "Expected number",
      );
      return null;
    }
    this.cursor += match[0].length;
    return {
      kind: "literal",
      span: this.span(start, this.cursor),
      value: { kind: "number", value: Number(match[0]) },
    };
  }

  consumeKeyword(keyword: string): boolean {
    if (!this.text.startsWith(keyword, this.cursor)) return false;
    const after = this.cursor + keyword.length;
    if (after < this.text.length && isIdentPart(this.text[after]!))
      return false;
    this.cursor += keyword.length;
    return true;
  }

  skipSpaces(): void {
    while (
      this.cursor < this.text.length &&
      /\s/.test(this.text[this.cursor]!)
    ) {
      this.cursor += 1;
    }
  }

  span(start: number, end: number): SourceSpan {
    return { text: this.text.slice(start, end), start, end };
  }

  pushError(start: number, end: number, message: string): void {
    this.errors.push({ start, end, message });
  }
}

/**
 * Converts a single-quoted raw string (e.g. `'foo\'bar'`) into a JSON-parseable
 * double-quoted string, handling the two differences:
 *   - `\'`  →  `'`   (unescape: single-quote never needs escaping in double-quoted JSON)
 *   -  `"`  →  `\"`  (must escape bare double-quotes for JSON)
 * All other escape sequences (\\, \n, \t, \uXXXX, …) are passed through unchanged.
 */
function singleToDoubleQuoted(raw: string): string {
  let result = '"';
  for (let i = 1; i < raw.length - 1; i++) {
    const ch = raw[i]!;
    if (ch === "\\") {
      const next = raw[i + 1]!;
      if (next === "'") {
        result += "'";
      } else {
        result += ch + next;
      }
      i++;
    } else if (ch === '"') {
      result += '\\"';
    } else {
      result += ch;
    }
  }
  result += '"';
  return result;
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}
