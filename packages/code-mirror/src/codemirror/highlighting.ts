import {
  defaultHighlightStyle,
  highlightingFor,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  EditorState,
  RangeSetBuilder,
  StateField,
  type Extension,
} from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { tags as t, type Tag } from "@lezer/highlight";
import type { Lsp } from "@typeprompt/core";
import { typepromptStateField } from "./state-field.js";

/**
 * Maps TypePrompt semantic token kinds to standard CodeMirror highlight tags.
 * Any theme (One Dark, Dracula, GitHub, etc.) styles these tags.
 */
const tokenTags: Record<Lsp.SemanticToken["kind"], Tag> = {
  comment: t.comment,
  "xml-tag": t.tagName,
  "xml-attribute": t.attributeName,
  "schema-keyword": t.keyword,
  string: t.string,
  boolean: t.bool,
  number: t.number,
};

function buildHighlightDecorations(
  state: EditorState,
  tokens: readonly Lsp.SemanticToken[],
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const docLength = state.doc.length;

  // Resolve decoration classes from active theme
  const kindDecorations = new Map<Lsp.SemanticToken["kind"], Decoration>();
  for (const [kind, tag] of Object.entries(tokenTags) as [
    Lsp.SemanticToken["kind"],
    Tag,
  ][]) {
    const cls = highlightingFor(state, [tag]);
    if (cls) {
      kindDecorations.set(kind, Decoration.mark({ class: cls }));
    }
  }

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

    if (from < to && from >= lastEnd) {
      const deco = kindDecorations.get(token.kind);
      if (deco) {
        builder.add(from, to, deco);
        lastEnd = to;
      }
    }
  }

  return builder.finish();
}

/**
 * StateField producing syntax highlighting decorations derived from semantic tokens,
 * styled dynamically using whatever theme or highlighter is active in CodeMirror.
 */
export const typepromptHighlightField = StateField.define<DecorationSet>({
  create(state): DecorationSet {
    const tpState = state.field(typepromptStateField, false);
    if (!tpState) {
      return Decoration.none;
    }
    return buildHighlightDecorations(state, tpState.tokens);
  },

  update(decorations, tr): DecorationSet {
    const oldTpState = tr.startState.field(typepromptStateField, false);
    const newTpState = tr.state.field(typepromptStateField, false);

    if (!tr.docChanged && !tr.reconfigured && oldTpState === newTpState) {
      return decorations;
    }
    if (!newTpState) {
      return Decoration.none;
    }
    return buildHighlightDecorations(tr.state, newTpState.tokens);
  },

  provide: (field) => EditorView.decorations.from(field),
});

/**
 * @deprecated CodeMirror themes should be used instead. This extension is now a no-op kept for backwards compatibility.
 */
export const typepromptHighlightTheme: Extension = [];

/**
 * Extension bundling the syntax highlighting decoration field and standard fallback styling.
 * If a custom theme is provided in the editor, CodeMirror automatically uses it; otherwise,
 * defaultHighlightStyle is used as a fallback.
 */
export const typepromptHighlighting: Extension = [
  typepromptHighlightField,
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
];
