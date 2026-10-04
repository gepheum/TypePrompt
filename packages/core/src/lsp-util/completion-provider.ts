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

  // Snippets we try to insert at 'position' until we get one error with suggestions.
  const insertions = ((): readonly string[] => {
    if (/[a-zA-Z0-9]$/.test(leftPart) || /^[a-zA-Z0-9]/.test(rightPart)) {
      return [""];
    }
    const insertions: string[] = [
      completionToken,
      completionToken.toUpperCase(),
    ];
    if (rightPart.endsWith(" ")) {
      // For XML attributes
      insertions.push(`${completionToken}=""`);
    }
    if (/(?:\r?\n|^)[ \t]*-?[ \t]*$/.test(rightPart)) {
      // For YAML object entries
      insertions.push(`${completionToken}: true`);
    }
    return insertions;
  })();

  const pathToNewContent = Object.fromEntries(Object.entries(pathToOldContent));
  for (const insertion of insertions) {
    const content = [leftPart, insertion, rightPart].join("");
    pathToNewContent[path] = content;

    const compilationResult = compile(pathToNewContent, { cache });
    if (cache === null) {
      cache = compilationResult;
    }
    const errors = compilationResult.finalErrors[path] ?? [];

    for (const error of errors) {
      const { span, suggestions } = error;
      if (position < span.start || span.end < position) continue;
      if (!suggestions || suggestions.length <= 0) continue;
      if (insertion === "") {
        return { span, suggestions };
      } else {
        return {
          span: {
            path: span.path,
            start: span.start,
            end: span.end - completionToken.length,
          },
          suggestions,
        };
      }
    }
  }

  return null;
}

// Valid identifier unlikely to appear in a real project.
const completionToken = "zipubezgljt";
