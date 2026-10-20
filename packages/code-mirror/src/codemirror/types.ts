import type {
  CompilationResult,
  Lsp,
  ValidCompilationResult,
} from "@typeprompt/core";

/**
 * Configuration options for the TypePrompt CodeMirror extension.
 */
export type TypePromptConfig = {
  /** The virtual path of the file being edited, e.g. "prompts/MyTemplate.xml". */
  readonly path: string;

  /**
   * Additional files in the workspace.
   * Keyed by path, mapping to file content.
   */
  readonly workspaceFiles: { readonly [path: string]: string };

  /** Optional patch base for incremental validation against a baseline. */
  readonly patchBase: ValidCompilationResult | null;
};

/** The immutable state cached inside CodeMirror's StateField. */
export type TypePromptState = {
  readonly path: string;
  readonly compilationResult: CompilationResult;
  readonly tokens: readonly Lsp.SemanticToken[];
};
