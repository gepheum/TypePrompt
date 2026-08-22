import {
  findLine,
  type LineFinderData,
  type LineMatch,
} from "../util/line-finder.js";
import type { InternalError } from "../util/shared-types.js";

export type RenderableError = {
  readonly path: string;
  readonly message: string;
  readonly hint?: string;
  readonly rule?: string;
  readonly suggestions?: readonly string[];
  readonly start: LineMatch;
  readonly end: LineMatch;
};

export function makeRenderableErrors(
  pathToErrors: { readonly [path: string]: InternalError[] },
  pathToLineFinder: {
    readonly [path: string]: {
      readonly lineFinder: LineFinderData;
    };
  },
): readonly RenderableError[] {
  const result: RenderableError[] = [];
  for (const [path, errors] of Object.entries(pathToErrors)) {
    const { lineFinder } = pathToLineFinder[path]!;
    for (const error of errors) {
      result.push(makeRenderableError(error, path, lineFinder));
    }
  }
  return result;
}

export function makeRenderableError(
  error: InternalError,
  path: string,
  lineFinder: LineFinderData,
): RenderableError {
  const { message, hint, rule, suggestions } = error;
  const start = findLine(error.span.start, lineFinder);
  const end = findLine(error.span.end, lineFinder);
  return { path, message, hint, rule, suggestions, start, end };
}
