import {
  parseJson,
  type JsonObjectEntry,
  type JsonValue,
} from "@typeprompt/core";
import { tokenizeYaml } from "@typeprompt/core/json/yaml-parser.js";
import { tokenize } from "@typeprompt/core/lsp-util/semantic-token.js";
import { css, html, LitElement, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import YAML from "yaml";
import { registerCustomElement } from "./register-custom-element.js";
import { commonStyles } from "./styles.js";

@registerCustomElement("tp-code")
export class CodeElement extends LitElement {
  static override styles = [
    commonStyles,
    css`
      :host {
        display: block;
        padding: 0.85rem 1rem;
        background: var(--bg-inset);
        border: 1px solid var(--border);
        border-radius: 6px;
        font-family: var(--font-mono);
        font-size: 0.84rem;
        line-height: 1.5;
        overflow-x: auto;
        box-sizing: border-box;
      }

      pre {
        margin: 0;
        padding: 0;
        font-family: inherit;
        font-size: inherit;
        line-height: inherit;
        white-space: pre-wrap;
        word-break: break-word;
      }

      code {
        font-family: inherit;
        font-size: inherit;
      }
    `,
  ];

  @property({ type: String })
  code: string = "";

  @property({ type: String })
  language: "tp" | "json" | "yaml" | "text" = "text";

  override render(): TemplateResult {
    const content = highlight(this.code, this.language);
    return html`<pre><code>${unsafeHTML(content)}</code></pre>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tp-code": CodeElement;
  }
}

type SpanToken = {
  readonly start: number;
  readonly end: number;
  readonly kind: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function applyTokens(text: string, tokens: readonly SpanToken[]): string {
  const sorted = [...tokens]
    .filter((t) => t.start >= 0 && t.end <= text.length && t.start < t.end)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let result = "";
  let cursor = 0;

  for (const token of sorted) {
    if (token.start < cursor) {
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

  return result;
}

function highlightTp(content: string): string {
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
    return escapeHtml(content);
  }
}

function highlightJson(json: string): string {
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
      return escapeHtml(json);
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
    return escapeHtml(json);
  }
}

function highlightYaml(yaml: string): string {
  try {
    const tokens: SpanToken[] = [];

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
    return escapeHtml(yaml);
  }
}

function highlight(code: string, language: string): string {
  if (!code) return "";
  switch (language) {
    case "tp":
      return highlightTp(code);
    case "json":
      return highlightJson(code);
    case "yaml":
      return highlightYaml(code);
    default:
      return escapeHtml(code);
  }
}
