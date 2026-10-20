import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { bracketMatching } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { autoCloseComments, autoCloseTags } from "./auto-close.js";
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
  typepromptBackspaceCommand,
  typepromptEnterCommand,
  typepromptIndentation,
  typepromptIndentCalculation,
  typepromptKeymap,
  typepromptToggleCommentCommand,
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
 * - Syntactic coloring
 * - Automatic live validation and error squiggles
 * - Autocompletion
 * - XML tag auto-closing on `>`
 * - Multiline comment auto-closing on `/*`
 * - Smart auto-indentation on Enter (open tags, open brackets, YAML colons)
 * - On-Enter tag and bracket split with indentOutdent
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

  if (config.autoCloseComments !== false) {
    extensions.push(autoCloseComments());
  }

  if (config.closeBrackets !== false) {
    extensions.push(closeBrackets());
    extensions.push(keymap.of(closeBracketsKeymap));
  }

  if (config.bracketMatching !== false) {
    extensions.push(bracketMatching());
  }

  if (config.indent !== false) {
    extensions.push(typepromptIndentation);
  }

  return extensions;
}

// Re-export all sub-modules and helpers
export {
  autoCloseComments,
  autoCloseTags,
  bracketMatching,
  closeBrackets,
  closeBracketsKeymap,
  getCompilationResult,
  getSemanticTokens,
  typepromptAutocomplete,
  typepromptBackspaceCommand,
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
  typepromptToggleCommentCommand,
  type TypePromptConfig,
  type TypePromptState,
};
