import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { InternalError } from "@typeprompt/core";
import { typepromptStateField } from "./state-field.js";

/**
 * Linter function that extracts compilation diagnostics from the cached `CompilationResult`.
 *
 * Because `CompilationResult` is immutable and already computed in `typepromptStateField`,
 * the linter runs instantaneously without any redundant compilation!
 */
export function typepromptLinter(view: EditorView): readonly Diagnostic[] {
  const tpState = view.state.field(typepromptStateField, false);
  if (!tpState) {
    return [];
  }

  const { path, compilationResult } = tpState;
  const errors = compilationResult.finalErrors[path] ?? [];
  const warnings = compilationResult.warnings[path] ?? [];
  const docLength = view.state.doc.length;

  const diagnostics: Diagnostic[] = [];

  const addDiagnostic = (
    err: InternalError,
    severity: "error" | "warning",
  ): void => {
    let from = Math.max(0, Math.min(docLength, err.span.start));
    let to = Math.max(from, Math.min(docLength, err.span.end));

    // Ensure non-zero width for visibility when highlighting in CodeMirror
    if (from === to) {
      if (to < docLength) {
        to++;
      } else if (from > 0) {
        from--;
      }
    }

    const actions = err.suggestions?.map((suggestion) => ({
      name: `Replace with "${suggestion}"`,
      apply: (editorView: EditorView): void => {
        const spanStart = Math.max(
          0,
          Math.min(editorView.state.doc.length, err.span.start),
        );
        const spanEnd = Math.max(
          spanStart,
          Math.min(editorView.state.doc.length, err.span.end),
        );
        editorView.dispatch({
          changes: { from: spanStart, to: spanEnd, insert: suggestion },
        });
      },
    }));

    diagnostics.push({
      from,
      to,
      severity,
      message: err.message,
      source: "TypePrompt",
      actions: actions && actions.length > 0 ? actions : undefined,
    });
  };

  for (const err of errors) {
    addDiagnostic(err, "error");
  }
  for (const warn of warnings) {
    addDiagnostic(warn, "warning");
  }

  return diagnostics;
}

/**
 * Extension bundling the linter and lint gutter for TypePrompt validation.
 */
export const typepromptLinting: Extension = [
  linter(typepromptLinter),
  lintGutter(),
];
