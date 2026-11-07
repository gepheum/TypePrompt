import {
  parseJson,
  type JsonObjectEntry,
  type JsonValue,
} from "@typeprompt/core";
import { tokenizeYaml } from "@typeprompt/core/json/yaml-parser.js";
import { tokenize } from "@typeprompt/core/lsp-util/semantic-token.js";
import YAML from "yaml";
import { escapeHtml, rawHtml, type SafeHtml } from "./html.js";

// -----------------------------------------------------------------------------
// Token Highlighting using AST / Semantic Tokenizers
// -----------------------------------------------------------------------------

/**
 * Highlights a `.tp` file using `tokenize` from `semantic-token.ts`.
 */
export function highlightTp(content: string): SafeHtml {
  try {
    const tokens = tokenize(content);
    return applyTokens(
      content,
      tokens.map((t) => ({
        start: t.span.start,
        end: t.span.end,
        kind: t.kind,
      })),
    );
  } catch {
    return rawHtml(escapeHtml(content));
  }
}

/**
 * Highlights JSON using `parseJson` from `json-parser.ts` by collecting the AST token spans.
 */
export function highlightJson(json: string): SafeHtml {
  try {
    const parsed = parseJson(
      {
        path: "output.json",
        text: json,
        offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
      },
      "loose",
    );

    if (parsed.kind === "error") {
      return rawHtml(escapeHtml(json));
    }

    const tokens: SpanToken[] = [];
    const collectTokens = (node: JsonValue<"loose">): void => {
      if (!node || typeof node !== "object") return;
      switch (node.kind) {
        case "object":
          for (const entry of Object.values(
            node.entries,
          ) as JsonObjectEntry<"loose">[]) {
            tokens.push({
              start: entry.key.firstToken.start,
              end: entry.key.firstToken.end,
              kind: "key",
            });
            collectTokens(entry.value);
          }
          break;
        case "array":
          for (const element of node.elements) {
            collectTokens(element);
          }
          break;
        case "string":
          tokens.push({
            start: node.firstToken.start,
            end: node.firstToken.end,
            kind: "string",
          });
          break;
        case "number":
          tokens.push({
            start: node.firstToken.start,
            end: node.firstToken.end,
            kind: "number",
          });
          break;
        case "boolean":
          tokens.push({
            start: node.firstToken.start,
            end: node.firstToken.end,
            kind: "boolean",
          });
          break;
        case "null":
          tokens.push({
            start: node.firstToken.start,
            end: node.firstToken.end,
            kind: "boolean",
          });
          break;
        case "ellipsis":
          tokens.push({
            start: node.firstToken.start,
            end: node.firstToken.end,
            kind: "comment",
          });
          break;
      }
    };

    collectTokens(parsed);
    return applyTokens(json, tokens);
  } catch {
    return rawHtml(escapeHtml(json));
  }
}

/**
 * Highlights YAML using `tokenizeYaml` from `yaml-parser.ts` alongside mapping key spans.
 */
export function highlightYaml(yaml: string): SafeHtml {
  try {
    const tokens: SpanToken[] = [];

    // 1. Semantic tokens from tokenizeYaml (strings, numbers, booleans, comments)
    const semanticTokens = tokenizeYaml({
      path: "output.yaml",
      text: yaml,
      offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
    });

    for (const st of semanticTokens) {
      tokens.push({
        start: st.span.start,
        end: st.span.end,
        kind: st.kind,
      });
    }

    // 2. Collect mapping keys from YAML document AST
    const docs = YAML.parseAllDocuments(yaml, { logLevel: "silent" });
    for (const doc of docs) {
      YAML.visit(doc, {
        Pair(_, pair) {
          const keyNode = pair.key as {
            range?: readonly [number, number];
          } | null;
          if (keyNode && keyNode.range) {
            tokens.push({
              start: keyNode.range[0],
              end: keyNode.range[1],
              kind: "key",
            });
          }
        },
      });
    }

    return applyTokens(yaml, tokens);
  } catch {
    return rawHtml(escapeHtml(yaml));
  }
}

type SpanToken = {
  readonly start: number;
  readonly end: number;
  readonly kind: string;
};

/**
 * Injects `<span class="hl-${kind}">` tags into `text` according to non-overlapping spans.
 */
function applyTokens(text: string, tokens: readonly SpanToken[]): SafeHtml {
  const sorted = [...tokens]
    .filter((t) => t.start >= 0 && t.end <= text.length && t.start < t.end)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let result = "";
  let cursor = 0;

  for (const token of sorted) {
    if (token.start < cursor) {
      // Skip overlapping tokens
      continue;
    }
    if (token.start > cursor) {
      result += escapeHtml(text.slice(cursor, token.start));
    }
    const tokenText = text.slice(token.start, token.end);
    result += `<span class="hl-${token.kind}">${escapeHtml(tokenText)}</span>`;
    cursor = token.end;
  }

  if (cursor < text.length) {
    result += escapeHtml(text.slice(cursor));
  }

  return rawHtml(result);
}
