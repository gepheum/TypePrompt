import { CompilationResult } from "../compiler/compiler-types.js";
import { compile } from "../compiler/compiler.js";
import { Span } from "../util/shared-types.js";

export type CompletionItems = {
  /** The range to replace. */
  readonly span: Span;
  /** Replacement texts. */
  readonly suggestions: readonly string[];
};

export function getCompletionItems(args: {
  newContent: string;
  path: string;
  pathToOldContent: { readonly [path: string]: string };
  position: number;
  cache: CompilationResult | null;
}): CompletionItems | null {
  const { newContent, path, pathToOldContent, position } = args;
  let { cache } = args;

  const leftPart = newContent.slice(0, position);
  const rightPart = newContent.slice(position);

  // TODO: check if result span contains insertion...
  const _insertions = (): readonly string[] => {
    if (/[a-zA-Z0-9"']$/.test(leftPart) || /^[a-zA-Z0-9"']/.test(rightPart)) {
      return [""];
    }
    const insertions: string[] = [];
    return insertions;
  };

  let newContents: readonly string[];
  const alphaAdjacent =
    /[a-zA-Z0-9]/.test(newContent[position - 1] ?? "") ||
    /[a-zA-Z0-9]/.test(newContent[position] ?? "");
  if (alphaAdjacent) {
    // There is an alphanumerical character adjacent to 'position'.
    newContents = [newContent];
  } else {
    // No alphanumerical character adjacent to 'position'.
    const insertions = [
      `z${randomLetters}`,
      `Z${randomLetters}`,
      `z${randomLetters}=""`,
      `z${randomLetters}: true`,
    ];
    newContents = insertions.map((i) => `${leftPart}${i}${rightPart}`);
  }

  const pathToNewContent = Object.fromEntries(Object.entries(pathToOldContent));
  for (const content of newContents) {
    pathToNewContent[path] = content;

    const compilationResult = compile(pathToNewContent, { cache });
    if (cache === null) {
      cache = compilationResult;
    }
    const errors = compilationResult.finalErrors[path] ?? [];

    for (const error of errors) {
      const { span, suggestions } = error;
      if (span.start > position || position > span.end) continue;
      if (!suggestions || suggestions.length <= 0) continue;
      if (alphaAdjacent) {
        return { span, suggestions };
      } else {
        return {
          span: {
            start: position,
            end: position,
          },
          suggestions,
        };
      }
    }
  }

  return null;
}

const randomLetters = ((): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
})();
