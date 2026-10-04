import { makeSingletonErrors } from "../util/errors.js";
import { textToSourcePosition } from "../util/position-mapper.js";
import { InternalErrors, MappedText, TextSpan } from "../util/shared-types.js";
import { Expression, ExpressionInContext } from "./expression-types.js";

export type ExpressionParseResult<HasValContext extends boolean> =
  | { readonly kind: "success"; readonly expression: Expression<HasValContext> }
  | InternalErrors;

export function parseExpression<HasValContext extends boolean>(
  content: MappedText,
  options: {
    readonly hasValContext: HasValContext;
  },
): ExpressionParseResult<HasValContext> {
  const { text } = content;
  const { length } = text;

  const mappedSpan = (start: number, end: number): TextSpan => {
    return {
      text: text.slice(start, end),
      start: textToSourcePosition(content, start),
      end: textToSourcePosition(content, end),
    };
  };

  const fail = (
    start: number,
    end: number,
    message: string,
    suggestions?: readonly string[],
  ): ExpressionParseResult<HasValContext> => {
    return makeSingletonErrors({
      span: mappedSpan(start, end),
      message,
      suggestions,
    });
  };

  // Parse base: "input" | "it"
  let pos = 0;
  let expr: ExpressionInContext;

  BASE_PATTERN.lastIndex = pos;
  const baseMatch = BASE_PATTERN.exec(text);

  if (!baseMatch) {
    const message = options.hasValContext
      ? "Expected 'input' or 'it'"
      : "Expected 'input'";
    const suggestions = options.hasValContext ? ["input", "it"] : ["input"];
    return fail(pos, length, message, suggestions);
  }

  const baseText = baseMatch[0];
  expr =
    baseText === "input"
      ? { kind: "input", fullPath: mappedSpan(pos, pos + baseText.length) }
      : { kind: "it", fullPath: mappedSpan(pos, pos + baseText.length) };
  if (baseText === "it" && !options.hasValContext) {
    return fail(pos, pos + baseText.length, '"it" not allowed here');
  }
  pos += baseText.length;

  // Parse chain of ("." identifier)
  while (true) {
    if (pos >= length) {
      break;
    }

    if (text[pos] === ".") {
      pos += 1;
    } else {
      return fail(pos, pos, "Expected '.'");
    }

    // Parse identifier
    const identStart = pos;
    IDENTIFIER_PATTERN.lastIndex = pos;
    const identMatch = IDENTIFIER_PATTERN.exec(text);

    if (!identMatch) {
      return fail(pos, length, "Expected: camelCase identifier");
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
      property: propertySpan,
      fullPath: mappedSpan(0, pos),
    };
  }

  return { kind: "success", expression: expr as Expression<HasValContext> };
}

const BASE_PATTERN = /(input|it)(?![a-zA-Z0-9])/y;
const IDENTIFIER_PATTERN = /[a-z][a-zA-Z0-9]*/y;
