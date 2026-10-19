import type {
  CompilationResult,
  SemanticToken,
  ValidCompilationResult,
} from "@typeprompt/core";

/**
 * Configuration options for the TypePrompt CodeMirror extension.
 */
export type TypePromptConfig = {
  /**
   * The virtual path of the file being edited (e.g. "prompts/template.xml").
   * Defaults to "template.xml".
   */
  readonly path?: string;

  /**
   * Additional files in the workspace (e.g. namespace files or other templates).
   * Keyed by path, mapping to file content.
   */
  readonly workspaceFiles?: { readonly [path: string]: string };

  /**
   * Optional patch base for incremental validation against a baseline.
   */
  readonly patchBase?: ValidCompilationResult | null;

  /**
   * Whether to enable linting (diagnostics squiggles and tooltips).
   * Defaults to true.
   */
  readonly lint?: boolean;

  /**
   * Whether to enable autocompletion popup.
   * Defaults to true.
   */
  readonly autocomplete?: boolean;

  /**
   * Whether to enable syntactic coloring.
   * Defaults to true.
   */
  readonly highlight?: boolean;

  /**
   * Whether to enable XML tag auto-closing (typing `>` inserts matching `</tag>`).
   * Defaults to true.
   */
  readonly autoCloseTags?: boolean;

  /**
   * Whether to enable automatic indentation and onEnter rules.
   * Defaults to true.
   */
  readonly indent?: boolean;
};

/**
 * The immutable state cached inside CodeMirror's StateField.
 */
export type TypePromptState = {
  readonly path: string;
  readonly content: string;
  readonly compilationResult: CompilationResult;
  readonly tokens: readonly SemanticToken[];
  readonly workspaceFiles: { readonly [path: string]: string };
};
