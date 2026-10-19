import {
  Facet,
  StateField,
  type EditorState,
  type Transaction,
} from "@codemirror/state";
import {
  compile,
  tokenize,
  type CompilationResult,
  type SemanticToken,
} from "@typeprompt/core";
import type { TypePromptConfig, TypePromptState } from "./types.js";

/**
 * Facet holding the TypePrompt configuration for the editor state.
 */
export const typepromptConfigFacet = Facet.define<
  TypePromptConfig,
  TypePromptConfig
>({
  combine(values: readonly TypePromptConfig[]): TypePromptConfig {
    return Object.assign({}, ...values);
  },
});

/**
 * StateField that compiles the TypePrompt document and caches the immutable CompilationResult.
 *
 * It takes full advantage of the fact that `CompilationResult` is immutable:
 * - When transactions do not modify the document (`!tr.docChanged`), the previous state
 *   is returned by identity with zero recomputation.
 * - When the document changes, `compile` is called with `cache: oldState.compilationResult`.
 *   This enables incremental compilation in `@typeprompt/core`, reusing unchanged source file
 *   parses and ASTs without re-evaluating unmodified parts.
 */
export const typepromptStateField = StateField.define<TypePromptState>({
  create(state: EditorState): TypePromptState {
    const config = state.facet(typepromptConfigFacet);
    const path = config.path ?? "template.xml";
    const content = state.doc.toString();
    const workspaceFiles = config.workspaceFiles ?? {};
    const patchBase = config.patchBase ?? null;

    const compilationResult = compile(
      { ...workspaceFiles, [path]: content },
      { cache: null, patchBase },
    );
    const tokens = tokenize(content, path);

    return {
      path,
      content,
      compilationResult,
      tokens,
      workspaceFiles,
    };
  },

  update(oldState: TypePromptState, tr: Transaction): TypePromptState {
    const config = tr.state.facet(typepromptConfigFacet);
    const newPath = config.path ?? oldState.path;
    const newWorkspaceFiles = config.workspaceFiles ?? oldState.workspaceFiles;
    const { patchBase } = config;

    const docChanged = tr.docChanged;
    const configChanged =
      newPath !== oldState.path ||
      newWorkspaceFiles !== oldState.workspaceFiles;

    // Fast path: if neither the document nor the configuration changed,
    // return the exact same immutable state reference.
    if (!docChanged && !configChanged) {
      return oldState;
    }

    const newContent = tr.state.doc.toString();
    if (!configChanged && newContent === oldState.content) {
      return oldState;
    }

    // Incremental compilation leveraging the cached, immutable CompilationResult
    const pathToContent = { ...newWorkspaceFiles, [newPath]: newContent };
    const compilationResult = compile(pathToContent, {
      cache: oldState.compilationResult,
      patchBase: patchBase ?? null,
    });
    const tokens = tokenize(newContent, newPath);

    return {
      path: newPath,
      content: newContent,
      compilationResult,
      tokens,
      workspaceFiles: newWorkspaceFiles,
    };
  },
});

/**
 * Retrieve the current immutable CompilationResult from an EditorState, if available.
 */
export function getCompilationResult(
  state: EditorState,
): CompilationResult | null {
  const tpState = state.field(typepromptStateField, false);
  return tpState ? tpState.compilationResult : null;
}

/**
 * Retrieve the current SemanticTokens from an EditorState, if available.
 */
export function getSemanticTokens(
  state: EditorState,
): readonly SemanticToken[] | null {
  const tpState = state.field(typepromptStateField, false);
  return tpState ? tpState.tokens : null;
}
