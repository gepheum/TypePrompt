import { InternalErrors, MappedText, TextSpan } from "../util/common-types.js";
import { textToSourcePosition } from "../util/position-mapper.js";
import { Expression } from "./compiler-types.js";

export type ExpressionParseResult =
  | { readonly kind: "success"; readonly expression: Expression }
  | InternalErrors;

export function parseExpression(
  content: MappedText,
  options: {
    acceptIt: boolean;
  },
): ExpressionParseResult {
  const text = content.text;
  const length = text.length;

  const mappedSpan = (start: number, end: number): TextSpan => {
    return {
      text: text.substring(start, end),
      start: textToSourcePosition(content, start),
      end: textToSourcePosition(content, end),
    };
  };

  const fail = (
    start: number,
    end: number,
    message: string,
  ): ExpressionParseResult => {
    return {
      kind: "error",
      errors: [{ span: mappedSpan(start, end), message }],
    };
  };

  // Parse base: "input" | "it"
  let pos = 0;
  let expr: Expression;

  BASE_PATTERN.lastIndex = pos;
  const baseMatch = BASE_PATTERN.exec(text);

  if (!baseMatch) {
    const message = options.acceptIt
      ? 'Expected "input" or "it"'
      : 'Expected "input"';
    return fail(pos, length, message);
  }

  const baseText = baseMatch[0];
  expr =
    baseText === "input"
      ? { kind: "input", span: mappedSpan(pos, pos + baseText.length) }
      : { kind: "it", span: mappedSpan(pos, pos + baseText.length) };
  if (baseText === "it" && !options.acceptIt) {
    return fail(pos, pos + baseText.length, '"it" not permitted here');
  }
  pos += baseText.length;

  // Parse chain of ("." | "?.") identifier
  while (true) {
    if (pos >= length) {
      break;
    }

    const opStart = pos;
    let operator: "." | "?.";

    if (text.startsWith("?.", pos)) {
      operator = "?.";
      pos += 2;
    } else if (text[pos] === ".") {
      operator = ".";
      pos += 1;
    } else {
      return fail(pos, pos + 1, 'Expected "." or "?."');
    }

    const operatorSpan = mappedSpan(opStart, pos);

    // parse identifier
    const identStart = pos;
    IDENTIFIER_PATTERN.lastIndex = pos;
    const identMatch = IDENTIFIER_PATTERN.exec(text);

    if (!identMatch) {
      return fail(pos, length, "Expected: lowerCamelCase identifier");
    }

    pos += identMatch[0].length;

    if (text[pos] === "_") {
      return fail(
        identStart,
        pos + 1,
        "Identifier must not contain underscores",
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
}

const BASE_PATTERN = /(input|it)(?![a-zA-Z0-9])/y;
const IDENTIFIER_PATTERN = /[a-z][a-zA-Z0-9]*/y;
