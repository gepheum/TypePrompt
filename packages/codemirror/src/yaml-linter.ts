import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { parseAndValidateYaml, type SchemaType } from "@typeprompt/core";

/**
 * Linter function that validates YAML document text against a SchemaType.
 */
export function yamlLinter(
  schemaType: SchemaType,
  path: string = "document.yaml",
): (view: EditorView) => readonly Diagnostic[] {
  return (view: EditorView): readonly Diagnostic[] => {
    const content = view.state.doc.toString();
    const result = parseAndValidateYaml(content, path, schemaType);
    if (result.kind !== "error") {
      return [];
    }

    const docLength = view.state.doc.length;
    const diagnostics: Diagnostic[] = [];

    for (const err of result.errors) {
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

      diagnostics.push({
        from,
        to,
        severity: "error",
        message: err.message,
        source: "YAML",
      });
    }

    return diagnostics;
  };
}

/**
 * Extension bundling the YAML linter and lint gutter for realtime validation.
 */
export function yamlLinting(schemaType: SchemaType, path?: string): Extension {
  return [linter(yamlLinter(schemaType, path)), lintGutter()];
}
