import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { Lsp, type SchemaType } from "@typeprompt/core";

/**
 * Creates a completion source function for YAML documents validated against a SchemaType.
 */
export function yamlCompletionSource(schemaType: SchemaType): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const content = context.state.doc.toString();
    const position = context.pos;

    const completionItems = Lsp.getYamlCompletionItems(
      content,
      position,
      schemaType,
    );

    if (!completionItems || completionItems.suggestions.length === 0) {
      return null;
    }

    const { span, suggestions } = completionItems;
    const docLen = context.state.doc.length;
    const from = Math.max(0, Math.min(docLen, span.start));
    const to = Math.max(from, Math.min(docLen, span.end));

    const options: Completion[] = suggestions.map((suggestion) => ({
      label: suggestion,
      type: "property",
    }));

    return {
      from,
      to,
      options,
      validFor: /^[\w-]*$/,
      filter: true,
    };
  };
}

/**
 * Extension providing schema-aware autocompletion for YAML documents.
 */
export function yamlAutocomplete(schemaType: SchemaType): Extension {
  return autocompletion({
    override: [yamlCompletionSource(schemaType)],
  });
}
