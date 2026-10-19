import { insertNewlineAndIndent } from "@codemirror/commands";
import {
  IndentContext,
  indentOnInput,
  indentService,
} from "@codemirror/language";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";
import { getSemanticTokens } from "./state-field.js";

/**
 * Matches an open XML tag at the end of a line that is NOT:
 * - A self-closing tag (e.g. `<val ... />`)
 * - A closing tag (e.g. `</template>`)
 * - An XML comment (e.g. `<!-- ... -->`)
 * - A processing instruction (e.g. `<?xml ... ?>`)
 */
export const OPEN_TAG_RE =
  /<(?!\?|!--|\/|[^>]*\/>)[_a-zA-Z0-9\-:]+(?:\s+[^>]*)?>\s*$/;

/**
 * Matches an open bracket or YAML colon at the end of a line:
 * - `{`, `[`, `(`, or `<`
 * - `:` (used in YAML headers or blocks)
 */
export const OPEN_BRACKET_RE = /(?:[{[(<]|:)\s*$/;

/**
 * Matches a closing tag or closing bracket at the start of a line:
 * - `</tagName>`
 * - `}`, `]`, `)`
 */
export const CLOSE_RE = /^\s*(?:<\/[_a-zA-Z0-9\-:]+>|[}\])])/;

/**
 * Computes the indentation for a line in TypePrompt:
 * - Indents if the previous non-empty line ended with an open tag or open bracket.
 * - Outdents if the current line starts with a closing tag or closing bracket.
 * - Outdents if the previous line closed a comment (e.g. `   *\/`).
 *
 * Supports both standard indentation queries and simulated line breaks
 * (such as when `insertNewlineAndIndent` evaluates the next line's indent before inserting).
 */
export function typepromptIndentCalculation(
  context: IndentContext,
  pos: number,
): number | null {
  const { state } = context;
  const doc = state.doc;
  const curDocLine = doc.lineAt(pos);

  // Check if we are simulating a line break at or within curDocLine
  const simBreak = (
    context as unknown as { options?: { simulateBreak?: number } }
  ).options?.simulateBreak;
  const isSimulated =
    simBreak != null &&
    simBreak >= curDocLine.from &&
    simBreak <= curDocLine.to;

  let prevText = "";
  let prevIndent = 0;

  if (isSimulated) {
    const lineBefore = context.lineAt(pos, -1);
    if (/\S/.test(lineBefore.text)) {
      prevText = lineBefore.text;
      prevIndent = context.lineIndent(pos, -1);
    } else {
      // The line before simulated break is empty; look backwards in doc
      for (let n = curDocLine.number - 1; n >= 1; n--) {
        const l = doc.line(n);
        if (/\S/.test(l.text)) {
          prevText = l.text;
          prevIndent = context.lineIndent(l.from);
          break;
        }
      }
    }
  } else {
    // Normal query for an existing line in doc
    if (curDocLine.number <= 1) {
      return 0;
    }
    for (let n = curDocLine.number - 1; n >= 1; n--) {
      const l = doc.line(n);
      if (/\S/.test(l.text)) {
        prevText = l.text;
        prevIndent = context.lineIndent(l.from);
        break;
      }
    }
  }

  // If no previous non-empty line exists, default to 0
  if (!prevText) {
    return 0;
  }

  // 1. If current line closes a multiline comment (starts with `*/`), find the opening
  // `/*` to align the `*` of `*/` with the first `*` of the comment.
  const currentText = context.textAfterPos(pos);
  if (/^\s*\*\//.test(currentText)) {
    for (let n = curDocLine.number - 1; n >= 1; n--) {
      const l = doc.line(n);
      const match = /^(\s*)\/\*/.exec(l.text);
      if (match) {
        return match[1].length + 1;
      }
    }
  }

  // 2. If previous line opened a multiline comment (e.g. `   /**`) that was not
  // closed: indent the new line to align with the first star (slash column + 1)
  const commentOpenMatch = /^(\s*)\/\*/.exec(prevText);
  if (commentOpenMatch && !/\*\//.test(prevText)) {
    return commentOpenMatch[1].length + 1;
  }

  // 3. If previous line is a comment continuation (`   * ...`), maintain star alignment
  const starContinuationMatch = /^(\s*)\*(?!\/)/.exec(prevText);
  if (starContinuationMatch && !/\*\//.test(prevText)) {
    return starContinuationMatch[1].length;
  }

  // 4. If previous line closed a comment (e.g. `   */`), outdent by 1 space to match comment base
  if (/^\s*\*\/\s*$/.test(prevText)) {
    const match = /^(\s*)\*\//.exec(prevText);
    if (match) {
      return Math.max(0, match[1].length - 1);
    }
  }

  // Check if previous line opens an indent (ends with open tag or open bracket)
  const opensIndent =
    OPEN_TAG_RE.test(prevText) || OPEN_BRACKET_RE.test(prevText);

  // Check if current line closes an indent (starts with closing tag or closing bracket)
  const closesIndent = CLOSE_RE.test(currentText);

  let indent = prevIndent;
  if (opensIndent) {
    indent += context.unit;
  }
  if (closesIndent) {
    indent = Math.max(0, indent - context.unit);
  }

  return indent;
}

/**
 * Custom Enter command that handles:
 * - Multiline comment editing (aligning '* ' on Enter and splitting '/** ... *\/')
 * - IndentOutdent when Enter is pressed between open and close XML tags
 *     (`<system>|</system>`)
 * - IndentOutdent when Enter is pressed between open and close brackets
 *     (`{|}`, `[|]`, `(|)`)
 *
 * In all other cases, delegates to `insertNewlineAndIndent`.
 */
export function typepromptEnterCommand(view: EditorView): boolean {
  if (view.state.readOnly) {
    return false;
  }

  const { state } = view;
  const { from, to } = state.selection.main;
  if (from !== to) {
    return insertNewlineAndIndent(view);
  }

  // 1. Check tokens to see if we're inside a multiline comment:
  // "To know whether to append a "*" when the user enters a new line, we can check
  // the tokens and see if we're in a comment and see if it starts with "/*"."
  const tokens = getSemanticTokens(state);
  const commentToken = tokens?.find(
    (t) => t.kind === "comment" && t.span.start <= from && from <= t.span.end,
  );

  if (commentToken) {
    const tokenText = state.doc.sliceString(
      commentToken.span.start,
      commentToken.span.end,
    );

    if (tokenText.startsWith("/*")) {
      // Check if cursor is right after closing `*/`
      if (from === commentToken.span.end && tokenText.endsWith("*/")) {
        const openLine = state.doc.lineAt(commentToken.span.start);
        const slashCol = commentToken.span.start - openLine.from;
        const outdented = " ".repeat(slashCol);
        const insert = `\n${outdented}`;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
          scrollIntoView: true,
          userEvent: "input",
        });
        return true;
      }

      // Inside multiline comment: compute star indent aligned with opening `*`
      const openLine = state.doc.lineAt(commentToken.span.start);
      const slashCol = commentToken.span.start - openLine.from;
      const starIndent = " ".repeat(slashCol + 1);

      const curLine = state.doc.lineAt(from);
      const before = curLine.text.slice(0, from - curLine.from);
      const after = curLine.text.slice(from - curLine.from);

      const closeMatch = /^\s*\*\/(.*)$/.exec(after);
      if (closeMatch) {
        const restAfterClose = closeMatch[1];
        const isCommentOpening = /^\s*\/\*(\*?)\s*$/.test(before);

        if (isCommentOpening) {
          // Splitting right after comment open, e.g. `/**| */` -> 3 aligned lines
          const trailingSpaces = before.length - before.trimEnd().length;
          const replaceFrom = from - trailingSpaces;
          const replaceTo = from + after.length;

          const insert = `\n${starIndent}* \n${starIndent}*/${restAfterClose}`;
          const targetCursorPos = replaceFrom + 1 + starIndent.length + 2;

          view.dispatch({
            changes: { from: replaceFrom, to: replaceTo, insert },
            selection: { anchor: targetCursorPos },
            scrollIntoView: true,
            userEvent: "input",
          });
          return true;
        }

        // Before already has comment content (e.g. ` * text| */`),
        // simply move `*/` to next line with aligned star indent
        const trailingSpaces = before.length - before.trimEnd().length;
        const replaceFrom = from - trailingSpaces;
        const replaceTo = from + after.length;

        const insert = `\n${starIndent}*/${restAfterClose}`;
        const targetCursorPos = replaceFrom + 1 + starIndent.length;

        view.dispatch({
          changes: { from: replaceFrom, to: replaceTo, insert },
          selection: { anchor: targetCursorPos },
          scrollIntoView: true,
          userEvent: "input",
        });
        return true;
      }

      // Prepend `* ` to the newline with the star well-aligned
      const trailingSpaces = before.length - before.trimEnd().length;
      const replaceFrom = from - trailingSpaces;
      const insert = `\n${starIndent}* `;
      const targetCursorPos = replaceFrom + insert.length;

      view.dispatch({
        changes: { from: replaceFrom, to, insert },
        selection: { anchor: targetCursorPos },
        scrollIntoView: true,
        userEvent: "input",
      });
      return true;
    }
  }

  // 1b. Fallback when tokens are unavailable (e.g. isolated test without state field):
  if (tokens === null) {
    const curLine = state.doc.lineAt(from);
    const before = curLine.text.slice(0, from - curLine.from);
    const after = curLine.text.slice(from - curLine.from);

    const commentOpenMatch = /^(\s*)\/\*(\*?)(?!\/)(?:[^*]|\*(?!\/))*$/.exec(
      before,
    );
    const commentContinuationMatch = /^(\s*)\*(?!\/)(?:[^*]|\*(?!\/))*$/.exec(
      before,
    );

    if (commentOpenMatch) {
      const baseIndent = commentOpenMatch[1];
      const starIndent = baseIndent + " ";
      const closeMatch = /^\s*\*\/(.*)$/.exec(after);

      if (closeMatch) {
        const restAfterClose = closeMatch[1];
        const isCommentOpening = /^\s*\/\*(\*?)\s*$/.test(before);

        if (isCommentOpening) {
          const trailingSpaces = before.length - before.trimEnd().length;
          const replaceFrom = from - trailingSpaces;
          const replaceTo = from + after.length;

          const insert = `\n${starIndent}* \n${starIndent}*/${restAfterClose}`;
          const targetCursorPos = replaceFrom + 1 + starIndent.length + 2;

          view.dispatch({
            changes: { from: replaceFrom, to: replaceTo, insert },
            selection: { anchor: targetCursorPos },
            scrollIntoView: true,
            userEvent: "input",
          });
          return true;
        }

        const trailingSpaces = before.length - before.trimEnd().length;
        const replaceFrom = from - trailingSpaces;
        const replaceTo = from + after.length;

        const insert = `\n${starIndent}*/${restAfterClose}`;
        const targetCursorPos = replaceFrom + 1 + starIndent.length;

        view.dispatch({
          changes: { from: replaceFrom, to: replaceTo, insert },
          selection: { anchor: targetCursorPos },
          scrollIntoView: true,
          userEvent: "input",
        });
        return true;
      }

      const trailingSpaces = before.length - before.trimEnd().length;
      const replaceFrom = from - trailingSpaces;
      const insert = `\n${starIndent}* `;
      const targetCursorPos = replaceFrom + insert.length;

      view.dispatch({
        changes: { from: replaceFrom, to, insert },
        selection: { anchor: targetCursorPos },
        scrollIntoView: true,
        userEvent: "input",
      });
      return true;
    }

    if (commentContinuationMatch) {
      const starIndent = commentContinuationMatch[1];
      const closeMatch = /^\s*\*\/(.*)$/.exec(after);

      if (closeMatch) {
        const restAfterClose = closeMatch[1];
        const trailingSpaces = before.length - before.trimEnd().length;
        const replaceFrom = from - trailingSpaces;
        const replaceTo = from + after.length;

        const insert = `\n${starIndent}* \n${starIndent}*/${restAfterClose}`;
        const targetCursorPos = replaceFrom + 1 + starIndent.length + 2;

        view.dispatch({
          changes: { from: replaceFrom, to: replaceTo, insert },
          selection: { anchor: targetCursorPos },
          scrollIntoView: true,
          userEvent: "input",
        });
        return true;
      }

      const trailingSpaces = before.length - before.trimEnd().length;
      const replaceFrom = from - trailingSpaces;
      const insert = `\n${starIndent}* `;
      const targetCursorPos = replaceFrom + insert.length;

      view.dispatch({
        changes: { from: replaceFrom, to, insert },
        selection: { anchor: targetCursorPos },
        scrollIntoView: true,
        userEvent: "input",
      });
      return true;
    }
  }

  // 2. Existing tag / bracket indentOutdent logic:
  const curLine = state.doc.lineAt(from);
  const before = curLine.text.slice(0, from - curLine.from);
  const after = curLine.text.slice(from - curLine.from);

  const openTagMatch =
    /<(?!\?|!--|\/|[^>]*\/>)[_a-zA-Z0-9\-:]+(?:\s+[^>]*)?>\s*$/.exec(before);
  const closeTagMatch = /^\s*<\/[_a-zA-Z0-9\-:]+>/.exec(after);

  const isBetweenTags =
    openTagMatch !== null &&
    closeTagMatch !== null &&
    !before.trimEnd().endsWith("/>");

  const isBetweenBrackets =
    /[{[(]\s*$/.test(before) && /^\s*[}\])]/.test(after);

  if (isBetweenTags || isBetweenBrackets) {
    const cx = new IndentContext(state);
    const baseIndent = cx.lineIndent(curLine.from);
    const innerIndent = baseIndent + cx.unit;

    const indentStr = " ".repeat(innerIndent);
    const baseIndentStr = " ".repeat(baseIndent);

    const insert = `\n${indentStr}\n${baseIndentStr}`;
    const targetCursorPos = from + 1 + indentStr.length;

    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: targetCursorPos },
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  }

  return insertNewlineAndIndent(view);
}

/**
 * Custom Backspace command that cleanly undos auto-closing '/** *\/':
 * When cursor is at '/**| *\/', deletes '* *\/' to leave '/*|'.
 */
export function typepromptBackspaceCommand(view: EditorView): boolean {
  if (view.state.readOnly) {
    return false;
  }

  const { state } = view;
  const { from, to } = state.selection.main;
  if (from !== to) {
    return false;
  }

  if (
    from >= 3 &&
    state.doc.sliceString(from - 3, from) === "/**" &&
    state.doc.sliceString(from, from + 3) === " */"
  ) {
    view.dispatch({
      changes: { from: from - 1, to: from + 3 },
      selection: { anchor: from - 1 },
      scrollIntoView: true,
      userEvent: "delete.backward",
    });
    return true;
  }

  if (
    from >= 2 &&
    state.doc.sliceString(from - 2, from) === "/*" &&
    state.doc.sliceString(from, from + 3) === " */"
  ) {
    view.dispatch({
      changes: { from: from - 1, to: from + 3 },
      selection: { anchor: from - 1 },
      scrollIntoView: true,
      userEvent: "delete.backward",
    });
    return true;
  }

  return false;
}

/**
 * Keymap binding Enter and Shift-Enter to `typepromptEnterCommand`,
 * and Backspace to `typepromptBackspaceCommand`.
 */
export const typepromptKeymap: readonly KeyBinding[] = [
  { key: "Enter", run: typepromptEnterCommand, shift: typepromptEnterCommand },
  { key: "Backspace", run: typepromptBackspaceCommand },
];

/**
 * Indentation extension for TypePrompt:
 * - Provides automatic indentation rules (open bracket / open tag increases indent, closing tag decreases).
 * - Provides onEnter rules (splits between matching tags or brackets with indentOutdent, aligns comments).
 * - Enables automatic reindentation when typing closing brackets or tags via `indentOnInput`.
 */
export const typepromptIndentation: Extension = [
  indentService.of(typepromptIndentCalculation),
  indentOnInput(),
  EditorState.languageData.of(() => [
    {
      indentOnInput: /^\s*(?:<\/[_a-zA-Z0-9\-:]+>|[}\])]|\*\/\s*)$/,
      commentTokens: { block: { open: "<!--", close: "-->" } },
    },
  ]),
  Prec.high(keymap.of(typepromptKeymap)),
];
