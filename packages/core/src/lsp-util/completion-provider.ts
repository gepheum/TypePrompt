import type {
  CompilationResult,
  SourceFileParseResult,
} from "../compiler/compiler-types.js";
import { compile } from "../compiler/compiler.js";
import { parseConfigYaml } from "../config/config-parser.js";
import type { InternalError, Span } from "../util/shared-types.js";

export type CompletionItems = {
  /** The range to replace. */
  readonly span: Span;
  /** Replacement texts. */
  readonly suggestions: readonly string[];
};

export function getCompletionItems(args: {
  newContent: string;
  path: string;
  position: number;
  cache: CompilationResult;
}): CompletionItems | null {
  const { newContent, path, position } = args;
  const { cache } = args;
  const { patchBase } = cache;

  const leftPart = newContent.slice(0, position);
  const rightPart = newContent.slice(position);
  const insertions = computeInsertions(leftPart, rightPart, "template");

  const pathToNewContent = Object.fromEntries(
    Object.values(cache.sourceFiles).map((f: SourceFileParseResult) => [
      f.path,
      f.content,
    ]),
  );
  return findCompletionItem(newContent, position, insertions, (content) => {
    pathToNewContent[path] = content;
    const compilationResult = compile(pathToNewContent, { cache, patchBase });
    return compilationResult.finalErrors[path] ?? [];
  });
}

export function getConfigCompletionItems(
  newContent: string,
  position: number,
): CompletionItems | null {
  const leftPart = newContent.slice(0, position);
  const rightPart = newContent.slice(position);
  const insertions = computeInsertions(leftPart, rightPart, "config");

  return findCompletionItem(newContent, position, insertions, (content) => {
    const parseResult = parseConfigYaml(content, "typeprompt.yaml");
    return parseResult.kind === "error" ? parseResult.errors : [];
  });
}

function computeInsertions(
  leftPart: string,
  rightPart: string,
  kind: "template" | "config",
): readonly string[] {
  if (/[a-zA-Z0-9]$/.test(leftPart) || /^[a-zA-Z0-9]/.test(rightPart)) {
    return [""];
  }
  const insertions: string[] = [completionToken];
  if (kind === "template") {
    insertions.push(completionToken.toUpperCase());
    if (leftPart.endsWith(" ")) {
      // For XML attributes
      insertions.push(`${completionToken}=""`);
    }
  }
  if (
    /(?:\r?\n|^)[ \t]*-?[ \t]*$/.test(leftPart) &&
    /^[ \t]*(?:\r?\n|$)/.test(rightPart)
  ) {
    // For YAML object entries
    insertions.push(`${completionToken}: true`);
  }
  return insertions;
}

function findCompletionItem(
  newContent: string,
  position: number,
  insertions: readonly string[],
  getErrors: (content: string) => readonly InternalError[],
): CompletionItems | null {
  const leftPart = newContent.slice(0, position);
  const rightPart = newContent.slice(position);

  for (const insertion of insertions) {
    const content = [leftPart, insertion, rightPart].join("");
    const errors = getErrors(content);

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
