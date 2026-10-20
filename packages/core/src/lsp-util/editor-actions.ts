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

/**
 * Determines whether a position falls within a JavaScript schema zone,
 * a YAML zone, or an XML zone.
 */
export function getCommentTypeAtPosition(
  content: string,
  offset: number,
): "xml" | "javascript" | "yaml" {
  const ctx = getPositionContext(content, offset);
  if (ctx.isInsideSchema) {
    return "javascript";
  }
  const isInsideYaml =
    ctx.contentFormat === "yaml" &&
    Boolean(
      ctx.currentElement &&
      offset >= ctx.currentElement.contentStart &&
      (!ctx.currentElement.closingTag ||
        offset <= ctx.currentElement.closingTag.start),
    );
  if (isInsideYaml) {
    return "yaml";
  }
  return "xml";
}

function mapSelection(
  selFrom: number,
  selTo: number,
  changes: readonly {
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }[],
): { targetFrom: number; targetTo: number } {
  const sorted = [...changes].sort((a, b) => a.from - b.from);
  let mappedFrom = selFrom;
  let mappedTo = selTo;

  for (const c of sorted) {
    const delta = c.insert.length - (c.to - c.from);
    if (selFrom >= c.to) {
      mappedFrom += delta;
    } else if (selFrom > c.from) {
      mappedFrom = c.from + c.insert.length;
    }
    if (selTo >= c.to) {
      mappedTo += delta;
    } else if (selTo > c.from) {
      mappedTo = c.from + c.insert.length;
    }
  }

  return { targetFrom: mappedFrom, targetTo: mappedTo };
}

/**
 * Computes changes to toggle comments on the selected line range based on
 * the comment type of the selection (XML, JavaScript `//`, or YAML `#`).
 */
export function computeToggleComment(
  content: string,
  selection: {
    readonly from: number;
    readonly to: number;
  },
): {
  readonly changes: readonly {
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }[];
  readonly targetSelection: {
    readonly from: number;
    readonly to: number;
  };
  readonly commentType: "xml" | "javascript" | "yaml";
} {
  if (content.length === 0) {
    return {
      changes: [{ from: 0, to: 0, insert: "<!--  -->" }],
      targetSelection: { from: 5, to: 5 },
      commentType: "xml",
    };
  }

  const rawFrom = Math.max(0, Math.min(selection.from, content.length));
  const rawTo = Math.max(0, Math.min(selection.to, content.length));
  const selFrom = Math.min(rawFrom, rawTo);
  const selTo = Math.max(rawFrom, rawTo);
  const isReversed = selection.from > selection.to;

  const lineFinder = createLineFinder(content);
  const startLineMatch = findLine(selFrom, lineFinder);
  const startLineNumber = startLineMatch.line.zeroBasedLineNumber;

  let endLineNumber: number;
  if (selTo === selFrom) {
    endLineNumber = startLineNumber;
  } else {
    const endLineMatch = findLine(selTo, lineFinder);
    endLineNumber = endLineMatch.line.zeroBasedLineNumber;
    if (
      endLineNumber > startLineNumber &&
      endLineMatch.zeroBasedColNumber === 0
    ) {
      endLineNumber--;
    }
  }

  const startLineStart = lineFinder.lineStarts[startLineNumber]!;
  const startLineEnd =
    startLineNumber + 1 < lineFinder.lineStarts.length
      ? lineFinder.lineStarts[startLineNumber + 1]!
      : content.length;
  const startLineText = content.slice(startLineStart, startLineEnd);
  const nonWsMatch = /^\s*(\S)/.exec(startLineText);
  const checkOffset = nonWsMatch
    ? startLineStart + startLineText.indexOf(nonWsMatch[1]!)
    : selFrom;
  const commentType = getCommentTypeAtPosition(content, checkOffset);

  type LineData = {
    lineNumber: number;
    lineStart: number;
    lineEnd: number;
    lineText: string;
    indent: number;
    nonEmpty: boolean;
  };

  const lines: LineData[] = [];
  for (let i = startLineNumber; i <= endLineNumber; i++) {
    const lineStart = lineFinder.lineStarts[i]!;
    const lineEnd =
      i + 1 < lineFinder.lineStarts.length
        ? lineFinder.lineStarts[i + 1]!
        : content.length;
    const rawText = content.slice(lineStart, lineEnd);
    const lineText = rawText.replace(/[\r\n]+$/, "");
    const indentMatch = /^[ \t]*/.exec(lineText);
    const indent = indentMatch ? indentMatch[0].length : 0;
    const nonEmpty = lineText.trim().length > 0;
    lines.push({
      lineNumber: i,
      lineStart,
      lineEnd,
      lineText,
      indent,
      nonEmpty,
    });
  }

  if (commentType === "javascript" || commentType === "yaml") {
    const token = commentType === "javascript" ? "//" : "#";
    const nonEmptyLines = lines.filter((l) => l.nonEmpty);

    const isLineCommented = (l: LineData): boolean => {
      const afterIndent = l.lineText.slice(l.indent);
      return afterIndent.startsWith(token);
    };

    const allCommented =
      nonEmptyLines.length > 0 && nonEmptyLines.every(isLineCommented);

    const changes: {
      readonly from: number;
      readonly to: number;
      readonly insert: string;
    }[] = [];

    if (allCommented) {
      // UNCOMMENT
      for (const l of lines) {
        if (l.nonEmpty && isLineCommented(l)) {
          const afterIndent = l.lineText.slice(l.indent);
          const hasSpace = afterIndent.slice(token.length).startsWith(" ");
          const cutLen = token.length + (hasSpace ? 1 : 0);
          changes.push({
            from: l.lineStart + l.indent,
            to: l.lineStart + l.indent + cutLen,
            insert: "",
          });
        }
      }
    } else {
      // COMMENT
      const minIndent =
        nonEmptyLines.length > 0
          ? Math.min(...nonEmptyLines.map((l) => l.indent))
          : lines[0]!.indent;

      for (const l of lines) {
        if (l.nonEmpty) {
          changes.push({
            from: l.lineStart + minIndent,
            to: l.lineStart + minIndent,
            insert: `${token} `,
          });
        } else if (lines.length === 1) {
          changes.push({
            from: l.lineStart + l.indent,
            to: l.lineStart + l.indent,
            insert: `${token} `,
          });
        }
      }
    }

    const { targetFrom, targetTo } = mapSelection(selFrom, selTo, changes);
    return {
      changes,
      targetSelection: {
        from: isReversed ? targetTo : targetFrom,
        to: isReversed ? targetFrom : targetTo,
      },
      commentType,
    };
  }

  // XML comment handling
  const ctx = getPositionContext(content, selFrom);
  if (
    ctx.comment &&
    ctx.comment.kind === "xml" &&
    !ctx.comment.isUnclosed &&
    selTo <= ctx.comment.span.end
  ) {
    // Selection is completely inside an XML comment block -> uncomment
    const span = ctx.comment.span;
    const start = span.start;
    const end = span.end;
    const lineStart = content.lastIndexOf("\n", start) + 1;
    const beforeOpen = content.slice(lineStart, start);
    const afterOpen = content.slice(start + 4);
    const matchOpenNl = /^[ \t]*\r?\n/.exec(afterOpen);

    const prevNl = content.lastIndexOf("\n", end - 3);
    const betweenNlAndClose =
      prevNl >= 0 ? content.slice(prevNl + 1, end - 3) : "";

    let changes: {
      readonly from: number;
      readonly to: number;
      readonly insert: string;
    }[];
    if (
      /^\s*$/.test(beforeOpen) &&
      matchOpenNl &&
      prevNl >= lineStart &&
      /^\s*$/.test(betweenNlAndClose)
    ) {
      changes = [
        { from: lineStart, to: start + 4 + matchOpenNl[0].length, insert: "" },
        { from: prevNl, to: end, insert: "" },
      ];
    } else {
      const commentText = content.slice(start, end);
      let startCut = 4;
      if (commentText.slice(4).startsWith(" ")) startCut++;
      let endCut = 3;
      if (commentText.slice(0, commentText.length - 3).endsWith(" ")) endCut++;
      changes = [
        { from: start, to: start + startCut, insert: "" },
        { from: end - endCut, to: end, insert: "" },
      ];
    }

    const { targetFrom, targetTo } = mapSelection(selFrom, selTo, changes);
    return {
      changes,
      targetSelection: {
        from: isReversed ? targetTo : targetFrom,
        to: isReversed ? targetFrom : targetTo,
      },
      commentType: "xml",
    };
  }

  const xmlCommentRegex = /^\s*<!--(.*)-->\s*$/;
  const nonEmptyLines = lines.filter((l) => l.nonEmpty);
  const allCommented =
    nonEmptyLines.length > 0 &&
    nonEmptyLines.every((l) => xmlCommentRegex.test(l.lineText));

  const changes: {
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }[] = [];

  if (allCommented) {
    // UNCOMMENT each line
    for (const l of lines) {
      if (l.nonEmpty) {
        const match = /^(\s*)<!-- ?(.*?) ?-->(\s*)$/.exec(l.lineText);
        if (match) {
          const indentStr = match[1]!;
          const contentStr = match[2]!;
          const trailingWs = match[3]!;
          changes.push({
            from: l.lineStart,
            to: l.lineStart + l.lineText.length,
            insert: indentStr + contentStr + trailingWs,
          });
        }
      }
    }
  } else {
    // Check if the whole selection forms a block comment
    const firstLine = lines[0]!;
    const lastLine = lines[lines.length - 1]!;
    if (
      lines.length > 1 &&
      firstLine.lineText.trimStart().startsWith("<!--") &&
      lastLine.lineText.trimEnd().endsWith("-->")
    ) {
      const firstMatch = /^(\s*)<!-- ?(.*)$/.exec(firstLine.lineText);
      const lastMatch = /^(.*?) ?-->(\s*)$/.exec(lastLine.lineText);
      if (firstMatch && lastMatch) {
        changes.push({
          from: firstLine.lineStart,
          to: firstLine.lineStart + firstLine.lineText.length,
          insert: firstMatch[1]! + firstMatch[2]!,
        });
        changes.push({
          from: lastLine.lineStart,
          to: lastLine.lineStart + lastLine.lineText.length,
          insert: lastMatch[1]! + lastMatch[2]!,
        });
      }
    } else {
      // COMMENT each line
      for (const l of lines) {
        if (l.nonEmpty) {
          if (!xmlCommentRegex.test(l.lineText)) {
            const indentStr = " ".repeat(l.indent);
            const contentStr = l.lineText.slice(l.indent);
            const newText = `${indentStr}<!-- ${contentStr} -->`;
            changes.push({
              from: l.lineStart,
              to: l.lineStart + l.lineText.length,
              insert: newText,
            });
          }
        } else if (lines.length === 1) {
          const newText = `${l.lineText}<!--  -->`;
          changes.push({
            from: l.lineStart,
            to: l.lineStart + l.lineText.length,
            insert: newText,
          });
        }
      }
    }
  }

  if (
    changes.length === 1 &&
    changes[0]!.insert.endsWith("<!--  -->") &&
    selFrom === selTo
  ) {
    const mid = changes[0]!.from + changes[0]!.insert.indexOf("  ") + 1;
    return {
      changes,
      targetSelection: { from: mid, to: mid },
      commentType: "xml",
    };
  }

  const { targetFrom, targetTo } = mapSelection(selFrom, selTo, changes);
  return {
    changes,
    targetSelection: {
      from: isReversed ? targetTo : targetFrom,
      to: isReversed ? targetFrom : targetTo,
    },
    commentType: "xml",
  };
}
