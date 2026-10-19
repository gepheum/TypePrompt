import { createLineFinder, findLine } from "../util/line-finder.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import { getPositionContext } from "./position-context.js";

/**
 * Given the document content and cursor offset (immediately following a `>`),
 * determines if an unclosed XML start-tag was just finished and returns its matching
 * closing tag string (e.g. `"</val>"`), or `null` if no auto-close is suggested.
 */
export function getAutoCloseTagAction(
  content: string,
  offsetAfterGreater: number,
): string | null {
  const parsed = parseXmlDocument(content, "path");
  if (parsed.kind !== "error" || !parsed.closingTagSuggestions) {
    return null;
  }

  const suggestion = parsed.closingTagSuggestions.find(
    (s) => s.position === offsetAfterGreater,
  );
  return suggestion ? `</${suggestion.tagName}>` : null;
}

/**
 * Determines whether typing * after / or entering /* should automatically
 * insert closing comment delimiter to close the comment block.
 */
export function getAutoCloseCommentAction(
  content: string,
  offset: number,
  inputChar: string,
): {
  readonly insert: string;
  readonly cursorOffset: number;
} | null {
  // 1. XML comment auto-closing (<!-- -->): always append regardless of context
  const isTypingHyphenAfterCommentStart =
    inputChar === "-" &&
    offset >= 3 &&
    content.slice(offset - 3, offset) === "<!-";
  const isEnteringXmlCommentOpen = inputChar === "<!--";

  if (isTypingHyphenAfterCommentStart || isEnteringXmlCommentOpen) {
    const nextChars = content.slice(offset, offset + 4);
    if (
      !nextChars.startsWith("-->") &&
      !nextChars.startsWith(" -->") &&
      !nextChars.startsWith("->")
    ) {
      if (isTypingHyphenAfterCommentStart) {
        return {
          insert: "--->",
          cursorOffset: offset + 1,
        };
      }
      return {
        insert: "<!---->",
        cursorOffset: offset + 4,
      };
    }
    return null;
  }

  // 2. JSDoc/block comment auto-closing: only inside schema zone
  const isTypingStarAfterSlash =
    inputChar === "*" &&
    offset >= 1 &&
    content.slice(offset - 1, offset) === "/";
  const isEnteringCommentOpen = inputChar === "/*";

  if (!isTypingStarAfterSlash && !isEnteringCommentOpen) {
    return null;
  }

  const ctx = getPositionContext(content, offset);
  if (!ctx.isInsideSchema || ctx.comment) {
    return null;
  }

  // Do not append if already followed by closing comment
  const nextChars = content.slice(offset, offset + 3);
  if (nextChars.startsWith("*/") || nextChars.startsWith(" */")) {
    return null;
  }

  if (isTypingStarAfterSlash) {
    return {
      insert: "* */",
      cursorOffset: offset + 1,
    };
  }

  if (isEnteringCommentOpen) {
    return {
      insert: "/* */",
      cursorOffset: offset + 2,
    };
  }

  return null;
}

/**
 * Determines whether pressing Backspace right after opening a comment
 * should undo the auto-closing comment.
 */
export function computeBackspaceAction(
  content: string,
  offset: number,
): {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  readonly targetCursorOffset: number;
} | null {
  // 1. Undo XML comment auto-close (<!--|--> -> <!-) regardless of context
  const nextChars = content.slice(offset, offset + 4);
  const closeLen = nextChars.startsWith(" -->")
    ? 4
    : nextChars.startsWith("-->")
      ? 3
      : 0;
  if (
    offset >= 4 &&
    content.slice(offset - 4, offset) === "<!--" &&
    closeLen > 0
  ) {
    return {
      from: offset - 1,
      to: offset + closeLen,
      insert: "",
      targetCursorOffset: offset - 1,
    };
  }

  // 2. Undo JSDoc/block comment auto-close: only inside schema zone
  const ctx = getPositionContext(content, offset);
  if (ctx.isInsideSchema) {
    if (
      offset >= 3 &&
      content.slice(offset - 3, offset) === "/**" &&
      content.slice(offset, offset + 3) === " */"
    ) {
      return {
        from: offset - 1,
        to: offset + 3,
        insert: "",
        targetCursorOffset: offset - 1,
      };
    }

    if (
      offset >= 2 &&
      content.slice(offset - 2, offset) === "/*" &&
      content.slice(offset, offset + 3) === " */"
    ) {
      return {
        from: offset - 1,
        to: offset + 3,
        insert: "",
        targetCursorOffset: offset - 1,
      };
    }
  }

  return null;
}

/**
 * Computes the edits and cursor positioning when Enter is pressed.
 * Handles:
 * - Multiline comment continuation and splitting with star alignment
 * - Single-line comment avoidance (does not append star after a closed comment)
 * - Outdenting after end of comment delimiter on a closing comment line
 * - Splitting between opening and closing XML tags
 * - Splitting between opening and closing brackets
 */
export function computeEnterAction(
  content: string,
  offset: number,
  options?: {
    readonly tabSize?: number;
    readonly insertSpaces?: boolean;
  },
): {
  readonly changes: readonly {
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }[];
  readonly targetCursorOffset: number;
  readonly handled: boolean;
} {
  const tabSize = options?.tabSize ?? 2;
  const ctx = getPositionContext(content, offset);

  // 1. Multiline comment continuation and splitting (only inside schema zone)
  if (ctx.isInsideSchema) {
    if (
      ctx.comment &&
      (ctx.comment.kind === "jsdoc" || ctx.comment.kind === "block")
    ) {
      const comment = ctx.comment;
      const lineFinder = createLineFinder(content);
      const commentStartLineMatch = findLine(comment.span.start, lineFinder);
      const commentStartLineNumber =
        commentStartLineMatch.line.zeroBasedLineNumber;
      const slashCol = commentStartLineMatch.zeroBasedColNumber;
      const starIndent = " ".repeat(slashCol + 1);

      // If cursor is at or after the end of the comment
      if (offset >= comment.span.end && !comment.isUnclosed) {
        // If the comment started on the same line as the cursor (a single-line comment),
        // do not apply any multiline comment rules.
        if (commentStartLineNumber === ctx.lineNumber) {
          return {
            changes: [],
            targetCursorOffset: offset,
            handled: false,
          };
        }

        // Cursor is right after closing comment delimiter on a multiline comment line:
        // outdent newline to match the slash column of the comment opening
        const outdented = " ".repeat(slashCol);
        const insert = `\n${outdented}`;
        return {
          changes: [{ from: offset, to: offset, insert }],
          targetCursorOffset: offset + insert.length,
          handled: true,
        };
      }

      // Inside the multiline comment:
      const closeMatch = /^\s*\*\/(.*)$/.exec(ctx.textAfterOnLine);
      if (closeMatch) {
        const restAfterClose = closeMatch[1];
        const isCommentOpening = /^\s*\/\*(\*?)\s*$/.test(ctx.textBeforeOnLine);

        if (isCommentOpening) {
          // Splitting right after comment open -> 3 aligned lines
          const trailingSpaces =
            ctx.textBeforeOnLine.length - ctx.textBeforeOnLine.trimEnd().length;
          const replaceFrom = offset - trailingSpaces;
          const replaceTo = offset + ctx.textAfterOnLine.length;

          const insert = `\n${starIndent}* \n${starIndent}*/${restAfterClose}`;
          const targetCursorPos = replaceFrom + 1 + starIndent.length + 2;

          return {
            changes: [{ from: replaceFrom, to: replaceTo, insert }],
            targetCursorOffset: targetCursorPos,
            handled: true,
          };
        }

        // Before already has comment content, move closing comment delimiter to next line
        const trailingSpaces =
          ctx.textBeforeOnLine.length - ctx.textBeforeOnLine.trimEnd().length;
        const replaceFrom = offset - trailingSpaces;
        const replaceTo = offset + ctx.textAfterOnLine.length;

        const insert = `\n${starIndent}*/${restAfterClose}`;
        const targetCursorPos = replaceFrom + 1 + starIndent.length;

        return {
          changes: [{ from: replaceFrom, to: replaceTo, insert }],
          targetCursorOffset: targetCursorPos,
          handled: true,
        };
      }

      // Prepend star to the newline with the star well-aligned
      const trailingSpaces =
        ctx.textBeforeOnLine.length - ctx.textBeforeOnLine.trimEnd().length;
      const replaceFrom = offset - trailingSpaces;
      const insert = `\n${starIndent}* `;
      const targetCursorPos = replaceFrom + insert.length;

      return {
        changes: [{ from: replaceFrom, to: offset, insert }],
        targetCursorOffset: targetCursorPos,
        handled: true,
      };
    }

    // 1b. Fallback when AST comment is null (e.g. unparsed schema fragment)
    const commentOpenMatch = /^(\s*)\/\*(\*?)(?!\/)(?:[^*]|\*(?!\/))*$/.exec(
      ctx.textBeforeOnLine,
    );
    const commentContinuationMatch = /^(\s*)\*(?!\/)(?:[^*]|\*(?!\/))*$/.exec(
      ctx.textBeforeOnLine,
    );

    if (commentOpenMatch) {
      const baseIndent = commentOpenMatch[1] ?? "";
      const starIndent = baseIndent + " ";
      const closeMatch = /^\s*\*\/(.*)$/.exec(ctx.textAfterOnLine);

      if (closeMatch) {
        const restAfterClose = closeMatch[1];
        const isCommentOpening = /^\s*\/\*(\*?)\s*$/.test(ctx.textBeforeOnLine);

        if (isCommentOpening) {
          const trailingSpaces =
            ctx.textBeforeOnLine.length - ctx.textBeforeOnLine.trimEnd().length;
          const replaceFrom = offset - trailingSpaces;
          const replaceTo = offset + ctx.textAfterOnLine.length;

          const insert = `\n${starIndent}* \n${starIndent}*/${restAfterClose}`;
          const targetCursorPos = replaceFrom + 1 + starIndent.length + 2;

          return {
            changes: [{ from: replaceFrom, to: replaceTo, insert }],
            targetCursorOffset: targetCursorPos,
            handled: true,
          };
        }

        const trailingSpaces =
          ctx.textBeforeOnLine.length - ctx.textBeforeOnLine.trimEnd().length;
        const replaceFrom = offset - trailingSpaces;
        const replaceTo = offset + ctx.textAfterOnLine.length;

        const insert = `\n${starIndent}*/${restAfterClose}`;
        const targetCursorPos = replaceFrom + 1 + starIndent.length;

        return {
          changes: [{ from: replaceFrom, to: replaceTo, insert }],
          targetCursorOffset: targetCursorPos,
          handled: true,
        };
      }

      const trailingSpaces =
        ctx.textBeforeOnLine.length - ctx.textBeforeOnLine.trimEnd().length;
      const replaceFrom = offset - trailingSpaces;
      const insert = `\n${starIndent}* `;
      const targetCursorPos = replaceFrom + insert.length;

      return {
        changes: [{ from: replaceFrom, to: offset, insert }],
        targetCursorOffset: targetCursorPos,
        handled: true,
      };
    }

    if (commentContinuationMatch) {
      const starIndent = commentContinuationMatch[1] ?? "";
      const closeMatch = /^\s*\*\/(.*)$/.exec(ctx.textAfterOnLine);

      if (closeMatch) {
        const restAfterClose = closeMatch[1];
        const isCommentOpening = /^\s*\*\s*$/.test(ctx.textBeforeOnLine);
        const trailingSpaces =
          ctx.textBeforeOnLine.length - ctx.textBeforeOnLine.trimEnd().length;
        const replaceFrom = offset - trailingSpaces;
        const replaceTo = offset + ctx.textAfterOnLine.length;

        if (isCommentOpening) {
          const insert = `\n${starIndent}* \n${starIndent}*/${restAfterClose}`;
          const targetCursorPos = replaceFrom + 1 + starIndent.length + 2;

          return {
            changes: [{ from: replaceFrom, to: replaceTo, insert }],
            targetCursorOffset: targetCursorPos,
            handled: true,
          };
        }

        const insert = `\n${starIndent}*/${restAfterClose}`;
        const targetCursorPos = replaceFrom + 1 + starIndent.length;

        return {
          changes: [{ from: replaceFrom, to: replaceTo, insert }],
          targetCursorOffset: targetCursorPos,
          handled: true,
        };
      }

      const trailingSpaces =
        ctx.textBeforeOnLine.length - ctx.textBeforeOnLine.trimEnd().length;
      const replaceFrom = offset - trailingSpaces;
      const insert = `\n${starIndent}* `;
      const targetCursorPos = replaceFrom + insert.length;

      return {
        changes: [{ from: replaceFrom, to: offset, insert }],
        targetCursorOffset: targetCursorPos,
        handled: true,
      };
    }
  }

  // 2. Splitting between XML comment open and close (`<!--|-->`)
  if (ctx.isBetweenXmlComment) {
    const trailingSpaces =
      ctx.textBeforeOnLine.length - ctx.textBeforeOnLine.trimEnd().length;
    const leadingSpaces =
      ctx.textAfterOnLine.length - ctx.textAfterOnLine.trimStart().length;
    const from = offset - trailingSpaces;
    const to = offset + leadingSpaces;
    const baseIndentStr = " ".repeat(ctx.lineIndent);
    const indentStr = " ".repeat(ctx.lineIndent + tabSize);
    const insert = `\n${indentStr}\n${baseIndentStr}`;
    const targetCursorPos = from + 1 + indentStr.length;

    return {
      changes: [{ from, to, insert }],
      targetCursorOffset: targetCursorPos,
      handled: true,
    };
  }

  // 2. Splitting between open and close XML tags (`<tag>|</tag>`)
  if (ctx.isBetweenTags) {
    const baseIndentStr = " ".repeat(ctx.lineIndent);
    const indentStr = " ".repeat(ctx.lineIndent + tabSize);
    const insert = `\n${indentStr}\n${baseIndentStr}`;
    const targetCursorPos = offset + 1 + indentStr.length;

    return {
      changes: [{ from: offset, to: offset, insert }],
      targetCursorOffset: targetCursorPos,
      handled: true,
    };
  }

  // 3. Splitting between open and close brackets (`{|}`, `[|]`, `(|)`)
  if (ctx.isBetweenBrackets) {
    const baseIndentStr = " ".repeat(ctx.lineIndent);
    const indentStr = " ".repeat(ctx.lineIndent + tabSize);
    const insert = `\n${indentStr}\n${baseIndentStr}`;
    const targetCursorPos = offset + 1 + indentStr.length;

    return {
      changes: [{ from: offset, to: offset, insert }],
      targetCursorOffset: targetCursorPos,
      handled: true,
    };
  }

  return {
    changes: [],
    targetCursorOffset: offset,
    handled: false,
  };
}
