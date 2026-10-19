import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { Lsp } from "@typeprompt/core";
import { typepromptStateField } from "./state-field.js";

export function typepromptCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const previousState = context.state.field(typepromptStateField, false);
  if (!previousState) {
    return null;
  }

  const { path, compilationResult } = previousState;
  const content = context.state.doc.toString();
  const position = context.pos;

  const isConfig = path === "typeprompt.yaml" || path === "typeprompt.yml";

  const completionItems = isConfig
    ? Lsp.getConfigCompletionItems(content, position)
    : Lsp.getCompletionItems({
        newContent: content,
        path,
        position,
        cache: compilationResult,
      });

  if (!completionItems || completionItems.suggestions.length === 0) {
    return null;
  }

  const { span, suggestions } = completionItems;
  const docLen = context.state.doc.length;
  const from = Math.max(0, Math.min(docLen, span.start));
  const to = Math.max(from, Math.min(docLen, span.end));

  const options: Completion[] = suggestions.map((suggestion) => ({
    label: suggestion,
  }));

  return {
    from,
    to,
    options,
    validFor: /^[\w-]*$/,
    filter: true,
  };
}

/**
 * Extension providing autocompletion for the TypePrompt language.
 */
export const typepromptAutocomplete: Extension = autocompletion({
  override: [typepromptCompletionSource],
});
