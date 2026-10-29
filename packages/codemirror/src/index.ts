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
  type JumpToDefinitionTarget,
  type TypePromptConfig,
  type TypePromptState,
};
