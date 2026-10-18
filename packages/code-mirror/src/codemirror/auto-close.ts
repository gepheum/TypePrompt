import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { parseXmlDocument } from "@typeprompt/core";
import { typepromptStateField } from "./state-field.js";

/**
 * Extension that automatically closes XML tags when the user types `>`.
 *
 * Uses `parseXmlDocument` from `@typeprompt/core` to check for closing tag suggestions.
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
