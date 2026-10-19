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
      compilationResult,
      tokens,
    };
  },

  update(oldState: TypePromptState, tr: Transaction): TypePromptState {
    if (!tr.docChanged) {
      return oldState;
    }

    const newContent = tr.state.doc.toString();

    // Reconstruct pathToContent from compilationResult.sourceFiles
    const pathToContent = Object.fromEntries(
      Object.values(oldState.compilationResult.sourceFiles).map((f) => [
        f.path,
        f.content,
      ]),
    );
    pathToContent[oldState.path] = newContent;

    // Incremental compilation leveraging the cached, immutable CompilationResult
    const compilationResult = compile(pathToContent, {
      cache: oldState.compilationResult,
      patchBase: oldState.compilationResult.patchBase,
    });
    const tokens = tokenize(newContent, oldState.path);

    return {
      path: oldState.path,
      compilationResult,
      tokens,
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
