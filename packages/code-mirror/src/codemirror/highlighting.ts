import { RangeSetBuilder, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { SemanticToken } from "@typeprompt/core";
import { typepromptStateField } from "./state-field.js";

const tokenDecorations: Record<SemanticToken["kind"], Decoration> = {
  comment: Decoration.mark({ class: "cm-tp-comment" }),
  "xml-tag": Decoration.mark({ class: "cm-tp-tag" }),
  "xml-attribute": Decoration.mark({ class: "cm-tp-attribute" }),
  "schema-keyword": Decoration.mark({ class: "cm-tp-keyword" }),
  string: Decoration.mark({ class: "cm-tp-string" }),
  boolean: Decoration.mark({ class: "cm-tp-boolean" }),
  number: Decoration.mark({ class: "cm-tp-number" }),
};

function buildHighlightDecorations(
  tokens: readonly SemanticToken[],
  docLength: number,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  // Ensure tokens are sorted strictly by start, then end
  const sorted = [...tokens].sort((a, b) => {
    if (a.span.start !== b.span.start) {
      return a.span.start - b.span.start;
    }
    return a.span.end - b.span.end;
  });

  let lastEnd = 0;
  for (const token of sorted) {
    const from = Math.max(0, Math.min(docLength, token.span.start));
    const to = Math.max(from, Math.min(docLength, token.span.end));

    // RangeSetBuilder requires non-overlapping strictly advancing ranges
    if (from < to && from >= lastEnd) {
      const deco = tokenDecorations[token.kind];
      if (deco) {
        builder.add(from, to, deco);
        lastEnd = to;
      }
    }
  }

  return builder.finish();
}

/**
 * StateField producing syntax highlighting decorations derived from the semantic tokens
 * computed in `typepromptStateField`.
 */
export const typepromptHighlightField = StateField.define<DecorationSet>({
  create(state): DecorationSet {
    const tpState = state.field(typepromptStateField);
    return buildHighlightDecorations(tpState.tokens, state.doc.length);
  },

  update(decorations, tr): DecorationSet {
    if (!tr.docChanged) {
      return decorations;
    }
    const tpState = tr.state.field(typepromptStateField);
    return buildHighlightDecorations(tpState.tokens, tr.state.doc.length);
  },

  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Clean, readable base theme providing syntactic colors for TypePrompt tokens in both light and dark modes.
 */
export const typepromptHighlightTheme = EditorView.baseTheme({
  ".cm-tp-comment": {
    color: "#6a737d",
    fontStyle: "italic",
  },
  ".cm-tp-tag": {
    color: "#22863a",
    fontWeight: "600",
  },
  ".cm-tp-attribute": {
    color: "#6f42c1",
  },
  ".cm-tp-keyword": {
    color: "#d73a49",
    fontWeight: "600",
  },
  ".cm-tp-string": {
    color: "#032f62",
  },
  ".cm-tp-boolean": {
    color: "#005cc5",
    fontWeight: "600",
  },
  ".cm-tp-number": {
    color: "#005cc5",
  },

  // Dark mode styling
  "&dark .cm-tp-comment, .cm-theme-dark .cm-tp-comment": {
    color: "#8b949e",
    fontStyle: "italic",
  },
  "&dark .cm-tp-tag, .cm-theme-dark .cm-tp-tag": {
    color: "#7ee787",
    fontWeight: "600",
  },
  "&dark .cm-tp-attribute, .cm-theme-dark .cm-tp-attribute": {
    color: "#d2a8ff",
  },
  "&dark .cm-tp-keyword, .cm-theme-dark .cm-tp-keyword": {
    color: "#ff7b72",
    fontWeight: "600",
  },
  "&dark .cm-tp-string, .cm-theme-dark .cm-tp-string": {
    color: "#a5d6ff",
  },
  "&dark .cm-tp-boolean, .cm-theme-dark .cm-tp-boolean": {
    color: "#79c0ff",
    fontWeight: "600",
  },
  "&dark .cm-tp-number, .cm-theme-dark .cm-tp-number": {
    color: "#79c0ff",
  },
});

/**
 * Extension bundling the syntax highlighting decoration field and theme styles.
 */
export const typepromptHighlighting: Extension = [
  typepromptHighlightField,
  typepromptHighlightTheme,
];
