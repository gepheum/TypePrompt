import { yaml as codemirrorYaml } from "@codemirror/lang-yaml";
import type { Extension } from "@codemirror/state";
import type { SchemaType } from "@typeprompt/core";
import { yamlAutocomplete, yamlCompletionSource } from "./yaml-autocomplete.js";
import { yamlLinter, yamlLinting } from "./yaml-linter.js";

export interface YamlOptions {
  /**
   * Path of the YAML document (used in error diagnostic locations).
   * Defaults to `"document.yaml"`.
   */
  readonly path?: string;
}

/**
 * Creates a CodeMirror 6 extension for YAML documents validated against a TypePrompt SchemaType.
 *
 * Extends CodeMirror's default YAML extension with:
 * - Lezer-based YAML syntax highlighting, indentation, and folding
 * - Schema-aware autocompletion
 * - Realtime validation and error diagnostics
 *
 * @param schemaType The schema used to validate and autocomplete the YAML content
 * @param options Optional configuration options
 */
export function yaml(schemaType: SchemaType, options?: YamlOptions): Extension {
  return [
    codemirrorYaml(),
    yamlAutocomplete(schemaType),
    yamlLinting(schemaType, options?.path),
  ];
}

export { yamlAutocomplete, yamlCompletionSource, yamlLinter, yamlLinting };
