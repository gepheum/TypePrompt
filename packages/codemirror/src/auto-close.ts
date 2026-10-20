import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Lsp } from "@typeprompt/core";

/**
 * Extension that automatically closes XML tags when the user types `>`.
 */
export function autoCloseTags(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== ">" || view.state.readOnly) {
      return false;
    }

    const doc = view.state.doc;
    const fullText = doc.sliceString(0, from) + ">" + doc.sliceString(to);
    const insertPosition = from + 1;

    const closingTag = Lsp.getAutoCloseTagAction(fullText, insertPosition);
    if (!closingTag) {
      return false;
    }

    view.dispatch({
      changes: [{ from, to, insert: ">" + closingTag }],
      selection: { anchor: insertPosition },
    });
    return true;
  });
}

/**
 * Extension that automatically closes a comment block when typing star after slash.
 */
export function autoCloseComments(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (view.state.readOnly) {
      return false;
    }

    const doc = view.state.doc;
    const action = Lsp.getAutoCloseCommentAction(doc.toString(), from, text);
    if (!action) {
      return false;
    }

    view.dispatch({
      changes: [{ from, to, insert: action.insert }],
      selection: { anchor: action.cursorOffset },
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  });
}
