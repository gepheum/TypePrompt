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
  typepromptComments,
  typepromptToggleCommentCommand,
} from "./comment.js";
import {
  findDefinitionAtCoords,
  findDefinitionAtPosition,
  jumpToDefinition,
  jumpToDefinitionClickHandlers,
  jumpToDefinitionKeymap,
  typepromptJumpToDefinition,
} from "./definition.js";
import {
  typepromptHighlightField,
  typepromptHighlighting,
} from "./highlighting.js";
import {
  typepromptIndentCalculation,
  typepromptIndentation,
} from "./indent.js";
import {
  typepromptBackspaceCommand,
  typepromptEnterCommand,
  typepromptKeybindings,
  typepromptKeymap,
} from "./keymap.js";
import { typepromptLinter, typepromptLinting } from "./linter.js";
import {
  getCompilationResult,
  getSemanticTokens,
  typepromptConfigFacet,
  typepromptStateField,
} from "./state-field.js";
import type {
  JumpToDefinitionTarget,
  TypePromptConfig,
  TypePromptState,
} from "./types.js";

import type { SchemaType } from "@typeprompt/core";
import {
  yaml as createYamlExtension,
  yamlAutocomplete,
  yamlCompletionSource,
  yamlLinter,
  yamlLinting,
  type YamlOptions,
} from "./yaml.js";

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
 * - Position-aware comment toggling (`Mod-/`)
 * - Auto-closing brackets and quotes with backspace pair deletion
 * - Bracket matching highlight
 *
 * @param config Configuration options (path, workspaceFiles, patchBase)
 */
export function typeprompt(config: TypePromptConfig): Extension {
  return [
    typepromptConfigFacet.of(config),
    typepromptStateField,
    typepromptHighlighting,
    typepromptLinting,
    typepromptAutocomplete,
    autoCloseTags(),
    autoCloseComments(),
    closeBrackets(),
    keymap.of(closeBracketsKeymap),
    bracketMatching(),
    typepromptIndentation,
    typepromptComments,
    typepromptKeybindings,
    typepromptJumpToDefinition(),
  ];
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
 * @param options Optional configuration options (e.g. document path)
 */
export function yaml(schemaType: SchemaType, options?: YamlOptions): Extension {
  return createYamlExtension(schemaType, options);
}

// Re-export all sub-modules and helpers
export {
  autoCloseComments,
  autoCloseTags,
  bracketMatching,
  closeBrackets,
  closeBracketsKeymap,
  findDefinitionAtCoords,
  findDefinitionAtPosition,
  getCompilationResult,
  getSemanticTokens,
  jumpToDefinition,
  jumpToDefinitionClickHandlers,
  jumpToDefinitionKeymap,
  typepromptAutocomplete,
  typepromptBackspaceCommand,
  typepromptComments,
  typepromptCompletionSource,
  typepromptConfigFacet,
  typepromptEnterCommand,
  typepromptHighlightField,
  typepromptHighlighting,
  typepromptIndentCalculation,
  typepromptIndentation,
  typepromptJumpToDefinition,
  typepromptKeybindings,
  typepromptKeymap,
  typepromptLinter,
  typepromptLinting,
  typepromptStateField,
  typepromptToggleCommentCommand,
  yamlAutocomplete,
  yamlCompletionSource,
  yamlLinter,
  yamlLinting,
  type JumpToDefinitionTarget,
  type SchemaType,
  type TypePromptConfig,
  type TypePromptState,
  type YamlOptions,
};
