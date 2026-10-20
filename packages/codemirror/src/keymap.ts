import { acceptCompletion, deleteBracketPair } from "@codemirror/autocomplete";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { IndentContext } from "@codemirror/language";
import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";
import { Lsp } from "@typeprompt/core";
import { typepromptToggleCommentCommand } from "./comment.js";

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
 * Otherwise delegates to `deleteBracketPair`.
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

  return deleteBracketPair(view);
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
 * Extension binding TypePrompt high-precedence editing keys.
 */
export const typepromptKeybindings: Extension = Prec.high(
  keymap.of(typepromptKeymap),
);
