import { Span } from "./shared-types.js";

export function stripQuotes<S extends Span>(span: S): S {
  return { ...span, start: span.start + 1, end: span.end - 1 };
}
