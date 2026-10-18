import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { getCompletionItems, getConfigCompletionItems } from "@typeprompt/core";
import { typepromptStateField } from "./state-field.js";

/**
 * CompletionSource that delegates to `@typeprompt/core`'s `getCompletionItems` or
 * `getConfigCompletionItems`, leveraging the cached CompilationResult.
 */
export function typepromptCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const tpState = context.state.field(typepromptStateField, false);
  if (!tpState) {
    return null;
  }

  const { path, compilationResult, workspaceFiles, patchBase } = tpState;
  const content = context.state.doc.toString();
  const position = context.pos;

  const isConfig =
    path.endsWith("typeprompt.yaml") || path.endsWith("typeprompt.yml");

  const completionItems = isConfig
    ? getConfigCompletionItems(content, position)
    : getCompletionItems({
        newContent: content,
        path,
        pathToOldContent: { ...workspaceFiles, [path]: tpState.content },
        position,
        cache: compilationResult,
        patchBase,
      });

  if (!completionItems || completionItems.suggestions.length === 0) {
    return null;
  }

  const { span, suggestions } = completionItems;
  const docLen = context.state.doc.length;
  const from = Math.max(0, Math.min(docLen, span.start));
  const to = Math.max(from, Math.min(docLen, span.end));

  const options: Completion[] = suggestions.map((suggestion) => {
    let type: string = "text";
    let boost = 0;

    if (suggestion.startsWith("<") || suggestion.endsWith(">")) {
      type = "type";
      boost = 2;
    } else if (suggestion.includes("=")) {
      type = "property";
      boost = 1;
    } else if (
      suggestion === "type" ||
      suggestion === "interface" ||
      suggestion === "namespace"
    ) {
      type = "keyword";
      boost = 1;
    } else if (
      suggestion === "string" ||
      suggestion === "number" ||
      suggestion === "boolean"
    ) {
      type = "type";
      boost = 1;
    }

    return {
      label: suggestion,
      type,
      boost,
    };
  });

  return {
    from,
    to,
    options,
    filter: true,
  };
}

/**
 * Extension providing autocompletion for the TypePrompt language.
 */
export const typepromptAutocomplete: Extension = autocompletion({
  override: [typepromptCompletionSource],
});
