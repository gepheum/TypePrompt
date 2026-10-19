import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { parseXmlDocument } from "@typeprompt/core";
import { typepromptStateField } from "./state-field.js";

/**
 * Extension that automatically closes XML tags when the user types `>`.
 */
export function autoCloseTags(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== ">" || view.state.readOnly) {
      return false;
    }

    const doc = view.state.doc;
    const path =
      view.state.field(typepromptStateField, false)?.path ?? "template.xml";
    const fullText = doc.sliceString(0, from) + ">" + doc.sliceString(to);
    const insertPosition = from + 1;

    const parsed = parseXmlDocument(fullText, path);
    if (parsed.kind !== "error" || !parsed.closingTagSuggestions) {
      return false;
    }

    const suggestion = parsed.closingTagSuggestions.find(
      (s) => s.position === insertPosition,
    );
    if (!suggestion) {
      return false;
    }

    const closingTag = `</${suggestion.tagName}>`;
    view.dispatch({
      changes: [{ from, to, insert: ">" + closingTag }],
      selection: { anchor: insertPosition },
    });
    return true;
  });
}

/**
 * Extension that automatically appends ' *\/' when the user enters '*'
 * and the previous character was '/'.
 */
export function autoCloseComments(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (view.state.readOnly) {
      return false;
    }

    const doc = view.state.doc;
    const isTypingStarAfterSlash =
      text === "*" && from >= 1 && doc.sliceString(from - 1, from) === "/";
    const isEnteringCommentOpen = text === "/*";

    if (!isTypingStarAfterSlash && !isEnteringCommentOpen) {
      return false;
    }

    // Do not append if already followed by closing comment
    const nextChars = doc.sliceString(to, to + 3);
    if (nextChars.startsWith("*/") || nextChars.startsWith(" */")) {
      return false;
    }

    if (isTypingStarAfterSlash) {
      view.dispatch({
        changes: [{ from, to, insert: "* */" }],
        selection: { anchor: from + 1 },
        scrollIntoView: true,
        userEvent: "input",
      });
      return true;
    }

    if (isEnteringCommentOpen) {
      view.dispatch({
        changes: [{ from, to, insert: "/* */" }],
        selection: { anchor: from + 2 },
        scrollIntoView: true,
        userEvent: "input",
      });
      return true;
    }

    return false;
  });
}
