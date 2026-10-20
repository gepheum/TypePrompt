import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Lsp } from "@typeprompt/core";

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
 * Extension providing dynamic position-aware comment tokens for CodeMirror
 * (XML `<!-- -->`, JavaScript `//` inside schema, YAML `#` in meta/examples).
 */
export const typepromptComments: Extension = EditorState.languageData.of(
  (state, pos) => {
    const commentType = Lsp.getCommentTypeAtPosition(state.doc.toString(), pos);
    let commentTokens;
    if (commentType === "javascript") {
      commentTokens = { line: "//" };
    } else if (commentType === "yaml") {
      commentTokens = { line: "#" };
    } else {
      commentTokens = { block: { open: "<!--", close: "-->" } };
    }
    return [{ commentTokens }];
  },
);
