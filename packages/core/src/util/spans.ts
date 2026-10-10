import { textToSourcePosition } from "./position-mapper.js";
import type { MappedSpan, MappedText, Span } from "./shared-types.js";

export function stripQuotes<S extends Span>(span: S): S {
  return { ...span, start: span.start + 1, end: span.end - 1 };
}

export function toMappedSpan(input: MappedText): MappedSpan {
  return {
    ...input,
    start: textToSourcePosition(input, 0),
    end: textToSourcePosition(input, input.text.length),
  };
}
