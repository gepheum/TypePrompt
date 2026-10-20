import { acceptCompletion } from "@codemirror/autocomplete";
import { insertNewlineAndIndent } from "@codemirror/commands";
import {
  IndentContext,
  indentOnInput,
  indentService,
} from "@codemirror/language";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";
import { Lsp } from "@typeprompt/core";

/**
 * Matches an open XML tag at the end of a line that is NOT:
 * - A self-closing tag (e.g. `<val ... />`)
 * - A closing tag (e.g. `</template>`)
 * - An XML comment (e.g. `<!-- ... -->`)
 * - A processing instruction (e.g. `<?xml ... ?>`)
 */
const OPEN_TAG_RE = /<(?!\?|!--|\/|[^>]*\/>)[_a-zA-Z0-9\-:]+(?:\s+[^>]*)?>\s*$/;

/**
 * Matches an open bracket or YAML colon at the end of a line:
 * - `{`, `[`, `(`, or `<`
 * - `:` (used in YAML headers or blocks)
 */
const OPEN_BRACKET_RE = /(?:[{[(<]|:)\s*$/;

/**
 * Matches a closing tag or closing bracket at the start of a line:
 * - `</tagName>`
 * - `}`, `]`, `)`
 */
const CLOSE_RE = /^\s*(?:<\/[_a-zA-Z0-9\-:]+>|[}\])])/;

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
 * Custom Enter command that delegates smart actions (multiline comments,
 * tag splitting, bracket splitting) to `computeEnterAction`, and in all
 * other cases delegates to `insertNewlineAndIndent`.
 */
export function typepromptEnterCommand(view: EditorView): boolean {
  if (view.state.readOnly) {
    return false;
  }

  if (acceptCompletion(view)) {
    return true;
  }

  const { state } = view;
  const { from, to } = state.selection.main;
  if (from !== to) {
    return insertNewlineAndIndent(view);
  }

  const cx = new IndentContext(state);
  const res = Lsp.computeEnterAction(state.doc.toString(), from, {
    tabSize: cx.unit,
  });

  if (res.handled) {
    view.dispatch({
      changes: res.changes,
      selection: { anchor: res.targetCursorOffset },
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  }

  return insertNewlineAndIndent(view);
}

/**
 * Custom Backspace command that cleanly undos auto-closing comments:
 * When cursor is at unclosed comment opening, deletes the auto-closed pair.
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

  const action = Lsp.computeBackspaceAction(state.doc.toString(), from);
  if (action) {
    view.dispatch({
      changes: action,
      selection: { anchor: action.targetCursorOffset },
      scrollIntoView: true,
      userEvent: "delete.backward",
    });
    return true;
  }

  return false;
}

/**
 * Custom Toggle Comment command that dynamically comments/uncomments code
 * using the appropriate delimiter (XML `<!-- -->`, JavaScript `//`, or YAML `#`)
 * determined by the cursor or selection position context.
 */
export function typepromptToggleCommentCommand(view: EditorView): boolean {
  if (view.state.readOnly) {
    return false;
  }
  const { state } = view;
  const content = state.doc.toString();
  const main = state.selection.main;

  const action = Lsp.computeToggleComment(content, {
    from: main.from,
    to: main.to,
  });

  if (action.changes.length === 0) {
    return false;
  }

  view.dispatch({
    changes: action.changes,
    selection: {
      anchor: action.targetSelection.from,
      head: action.targetSelection.to,
    },
    scrollIntoView: true,
    userEvent: "input.comment",
  });
  return true;
}

/**
 * Keymap binding Enter and Shift-Enter to `typepromptEnterCommand`,
 * Backspace to `typepromptBackspaceCommand`, and Mod-/ to `typepromptToggleCommentCommand`.
 */
export const typepromptKeymap: readonly KeyBinding[] = [
  { key: "Enter", run: typepromptEnterCommand, shift: typepromptEnterCommand },
  { key: "Backspace", run: typepromptBackspaceCommand },
  { key: "Mod-/", run: typepromptToggleCommentCommand },
];

/**
 * Indentation extension for TypePrompt:
 * - Provides automatic indentation rules (open bracket / open tag increases indent, closing tag decreases).
 * - Provides onEnter rules (splits between matching tags or brackets with indentOutdent, aligns comments).
 * - Enables automatic reindentation when typing closing brackets or tags via `indentOnInput`.
 * - Provides dynamic position-aware comment tokens (XML, Schema //, YAML #).
 */
export const typepromptIndentation: Extension = [
  indentService.of(typepromptIndentCalculation),
  indentOnInput(),
  EditorState.languageData.of((state, pos) => {
    const commentType = Lsp.getCommentTypeAtPosition(state.doc.toString(), pos);
    let commentTokens;
    if (commentType === "javascript") {
      commentTokens = { line: "//" };
    } else if (commentType === "yaml") {
      commentTokens = { line: "#" };
    } else {
      commentTokens = { block: { open: "<!--", close: "-->" } };
    }
    return [
      {
        indentOnInput: /^\s*(?:<\/[_a-zA-Z0-9\-:]+>|[}\])]|\*\/\s*)$/,
        commentTokens,
      },
    ];
  }),
  Prec.high(keymap.of(typepromptKeymap)),
];
