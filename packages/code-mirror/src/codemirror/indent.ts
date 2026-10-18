import { insertNewlineAndIndent } from "@codemirror/commands";
import {
  IndentContext,
  indentOnInput,
  indentService,
} from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";

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

  // Check if previous line opens an indent (ends with open tag or open bracket)
  const opensIndent =
    OPEN_TAG_RE.test(prevText) || OPEN_BRACKET_RE.test(prevText);

  // Check if current line closes an indent (starts with closing tag or closing bracket)
  const currentText = context.textAfterPos(pos);
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
 * Custom Enter command that handles "indentOutdent" when Enter is pressed between:
 * - An open XML tag and its closing tag (e.g. `<system>|</system>`)
 * - Open and close brackets (e.g. `{|}`, `[|]`, `(|)`)
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

  const line = state.doc.lineAt(from);
  const before = line.text.slice(0, from - line.from);
  const after = line.text.slice(from - line.from);

  // Check if cursor is between an open tag and a closing tag: `<tag>|</tag>`
  const openTagMatch =
    /<(?!\?|!--|\/|[^>]*\/>)[_a-zA-Z0-9\-:]+(?:\s+[^>]*)?>\s*$/.exec(before);
  const closeTagMatch = /^\s*<\/[_a-zA-Z0-9\-:]+>/.exec(after);

  const isBetweenTags =
    openTagMatch !== null &&
    closeTagMatch !== null &&
    !before.trimEnd().endsWith("/>");

  // Check if cursor is between brackets: `{}` or `[]` or `()`
  const isBetweenBrackets =
    /[{[(]\s*$/.test(before) && /^\s*[}\])]/.test(after);

  if (isBetweenTags || isBetweenBrackets) {
    const cx = new IndentContext(state);
    const baseIndent = cx.lineIndent(line.from);
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
 * Keymap binding Enter and Shift-Enter to `typepromptEnterCommand`.
 */
export const typepromptKeymap: readonly KeyBinding[] = [
  { key: "Enter", run: typepromptEnterCommand, shift: typepromptEnterCommand },
];

/**
 * Indentation extension for TypePrompt:
 * - Provides automatic indentation rules (open bracket / open tag increases indent, closing tag decreases).
 * - Provides onEnter rules (splits between matching tags or brackets with indentOutdent).
 * - Enables automatic reindentation when typing closing brackets or tags via `indentOnInput`.
 */
export const typepromptIndentation: Extension = [
  indentService.of(typepromptIndentCalculation),
  indentOnInput(),
  EditorState.languageData.of(() => [
    {
      indentOnInput: /^\s*(?:<\/[_a-zA-Z0-9\-:]+>|[}\])])$/,
      commentTokens: { block: { open: "<!--", close: "-->" } },
    },
  ]),
  keymap.of(typepromptKeymap),
];
