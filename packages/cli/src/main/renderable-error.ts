import {
  findLine,
  type LineFinderData,
  type LineMatch,
} from "@typeprompt/core/util/line-finder.js";
import type { InternalError } from "@typeprompt/core/util/shared-types.js";

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
  pathToErrors: { readonly [path: string]: readonly InternalError[] },
  pathToLineFinder: {
    readonly [path: string]: {
      readonly lineFinder: LineFinderData;
    };
  },
  pathNormalizer: (path: string) => string,
): readonly RenderableError[] {
  const result: RenderableError[] = [];
  for (const [path, errors] of Object.entries(pathToErrors)) {
    const { lineFinder } = pathToLineFinder[path]!;
    for (const error of errors) {
      result.push(makeRenderableError(error, path, lineFinder, pathNormalizer));
    }
  }
  return result;
}

export function makeRenderableError(
  error: InternalError,
  path: string,
  lineFinder: LineFinderData,
  pathNormalizer: (path: string) => string,
): RenderableError {
  path = pathNormalizer(path);
  const { message, hint, rule, suggestions } = error;
  const start = findLine(error.span.start, lineFinder);
  const end = findLine(error.span.end, lineFinder);
  return { path, message, hint, rule, suggestions, start, end };
}
