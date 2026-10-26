import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

export const typepromptEditorTheme = EditorView.theme(
  {
    "&": {
      color: "#e2e8f0",
      backgroundColor: "#090c14",
      height: "100%",
      fontSize: "13.5px",
      fontFamily:
        "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    ".cm-content": {
      caretColor: "#818cf8",
      padding: "16px 0",
      lineHeight: "1.65",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "#818cf8",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        backgroundColor: "rgba(99, 102, 241, 0.28) !important",
      },
    ".cm-gutters": {
      backgroundColor: "#070a10",
      color: "#475569",
      borderRight: "1px solid #1e293b",
      paddingRight: "6px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      color: "#94a3b8",
      fontWeight: "600",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.02)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#1e293b",
      border: "none",
      color: "#94a3b8",
      padding: "0 6px",
      borderRadius: "4px",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "inherit",
    },
  },
  { dark: true },
);

export const typepromptDarkHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.tagName, color: "#818cf8", fontWeight: "600" },
    { tag: t.attributeName, color: "#38bdf8" },
    { tag: t.keyword, color: "#f472b6", fontWeight: "600" },
    { tag: t.string, color: "#34d399" },
    { tag: t.number, color: "#fbbf24" },
    { tag: t.bool, color: "#f87171" },
    { tag: t.comment, color: "#64748b", fontStyle: "italic" },
  ]),
);
