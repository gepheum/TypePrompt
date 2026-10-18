import type { Extension } from "@codemirror/state";
import { autoCloseTags } from "./auto-close.js";
import {
  typepromptAutocomplete,
  typepromptCompletionSource,
} from "./autocomplete.js";
import {
  typepromptHighlightField,
  typepromptHighlighting,
  typepromptHighlightTheme,
} from "./highlighting.js";
import {
  CLOSE_RE,
  OPEN_BRACKET_RE,
  OPEN_TAG_RE,
  typepromptEnterCommand,
  typepromptIndentation,
  typepromptIndentCalculation,
  typepromptKeymap,
} from "./indent.js";
import { typepromptLinter, typepromptLinting } from "./linter.js";
import {
  getCompilationResult,
  getSemanticTokens,
  typepromptConfigFacet,
  typepromptStateField,
} from "./state-field.js";
import type { TypePromptConfig, TypePromptState } from "./types.js";

/**
 * Creates a comprehensive CodeMirror 6 extension for the TypePrompt language.
 *
 * Includes:
 * - Syntactic coloring using `@typeprompt/core`'s semantic tokenizer
 * - Automatic live validation and error squiggles using `CompilationResult.finalErrors`
 * - Autocompletion using `@typeprompt/core`'s `getCompletionItems`
 * - XML tag auto-closing on `>`
 * - Smart auto-indentation on Enter (open tags, open brackets, YAML colons)
 * - On-Enter tag and bracket split with indentOutdent
 * - Full immutability caching for instant re-evaluations and high performance
 *
 * @param config Optional configuration options (file path, workspace files, patchBase, toggles)
 */
export function typeprompt(config: TypePromptConfig = {}): Extension {
  const extensions: Extension[] = [
    typepromptConfigFacet.of(config),
    typepromptStateField,
  ];

  if (config.highlight !== false) {
    extensions.push(typepromptHighlighting);
  }

  if (config.lint !== false) {
    extensions.push(typepromptLinting);
  }

  if (config.autocomplete !== false) {
    extensions.push(typepromptAutocomplete);
  }

  if (config.autoCloseTags !== false) {
    extensions.push(autoCloseTags());
  }

  if (config.indent !== false) {
    extensions.push(typepromptIndentation);
  }

  return extensions;
}

// Re-export all sub-modules and helpers
export {
  autoCloseTags,
  CLOSE_RE,
  getCompilationResult,
  getSemanticTokens,
  OPEN_BRACKET_RE,
  OPEN_TAG_RE,
  typepromptAutocomplete,
  typepromptCompletionSource,
  typepromptConfigFacet,
  typepromptEnterCommand,
  typepromptHighlightField,
  typepromptHighlighting,
  typepromptHighlightTheme,
  typepromptIndentation,
  typepromptIndentCalculation,
  typepromptKeymap,
  typepromptLinter,
  typepromptLinting,
  typepromptStateField,
  type TypePromptConfig,
  type TypePromptState,
};
