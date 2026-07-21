import { InternalErrors, MappedText, Span, TextSpan } from "../util/common-types.js";
import { textToSourcePosition } from "../util/position-mapper.js";
import { Expression } from "./compiler-types.js";

export type ExpressionParseResult =
  | {readonly kind: "success"; readonly expression: Expression}
  | InternalErrors;

export function parseExpression(content: MappedText): ExpressionParseResult {
  const text = content.text;
  const length = text.length;
 
  const mappedSpan = (start: number, end: number): TextSpan => {
    return {
      text: text.substring(start, end),
      start: textToSourcePosition(content, start),
      end: textToSourcePosition(content, end),
    };
  };
 
  const fail = (start: number, end: number, message: string): ExpressionParseResult => {
    return { kind: "error", errors: [{ span: mappedSpan(start, end), message }] };
  };
 
  const skipWhitespace = (p: number): number => {
    WHITESPACE_PATTERN.lastIndex = p;
    const match = WHITESPACE_PATTERN.exec(text)!;
    return p + match[0].length;
  }
 
  // Parse base: "input" | "it" (leading whitespace allowed)
  let pos = skipWhitespace(0);
  let expr: Expression;
 
  BASE_PATTERN.lastIndex = pos;
  const baseMatch = BASE_PATTERN.exec(text);
 
  if (!baseMatch) {
    return fail(pos, length, `Expected "input" or "it"`);
  }
 
  const baseText = baseMatch[0];
  expr =
    baseText === "input"
      ? { kind: "input", span: mappedSpan(pos, pos + baseText.length) }
      : { kind: "it", span: mappedSpan(pos, pos + baseText.length) };
  pos += baseText.length;
 
  // Parse chain of ("." | "?.") identifier, whitespace-tolerant
  while (true) {
    const beforeOp = skipWhitespace(pos);
 
    if (beforeOp >= length) {
      // Only trailing whitespace (or nothing) remains: done.
      pos = beforeOp;
      break;
    }
 
    pos = beforeOp;
    const opStart = pos;
    let operator: "." | "?.";
    let opEnd: number;
 
    if (text.startsWith("?.", pos)) {
      operator = "?.";
      opEnd = pos + 2;
    } else if (text[pos] === ".") {
      operator = ".";
      opEnd = pos + 1;
    } else {
      return fail(
        pos,
        pos + 1,
        `Unexpected character "${text[pos]}"; expected "." or "?.".`
      );
    }
 
    const operatorSpan = mappedSpan(opStart, opEnd);
    pos = skipWhitespace(opEnd);
 
    // parse identifier
    const identStart = pos;
    IDENTIFIER_PATTERN.lastIndex = pos;
    const identMatch = IDENTIFIER_PATTERN.exec(text);
 
    if (!identMatch) {
      return fail(
        pos,
        length,
        `Expected a lowerCamelCase identifier after "${operator}"`
      );
    }
 
    pos += identMatch[0].length;
 
    if (text[pos] === "_") {
      return fail(
        identStart,
        pos + 1,
        "Identifier must not contain underscores"
      );
    }
 
    const propertySpan = mappedSpan(identStart, pos);
 
    expr = {
      kind: "property",
      left: expr,
      operator,
      operatorSpan,
      property: propertySpan,
    };
  }
 
  return { kind: "success", expression: expr };
};

const WHITESPACE_PATTERN = /\s*/y;
const BASE_PATTERN = /(input|it)(?![a-zA-Z0-9])/y;
const IDENTIFIER_PATTERN = /[a-z][a-zA-Z0-9]*/y;
 