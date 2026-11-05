// Run with:
// npx tsx packages/vscode/src/render-inference-set-html.ts /Users/clementroux/Documents/Gepheum/typeprompt/playground/inference-set.json /Users/clementroux/Documents/Gepheum/typeprompt/playground/inference-set.html

import type { Inferences } from "@typeprompt/core";
import {
  parseJson,
  type JsonObjectEntry,
  type JsonValue,
} from "@typeprompt/core";
import { tokenizeYaml } from "@typeprompt/core/json/yaml-parser.js";
import { tokenize } from "@typeprompt/core/lsp-util/semantic-token.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

// -----------------------------------------------------------------------------
// Tagged Template Literal HTML Escaping
// -----------------------------------------------------------------------------

export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function rawHtml(value: string): SafeHtml {
  return new SafeHtml(value);
}

export function html(
  strings: TemplateStringsArray,
  ...values: readonly unknown[]
): SafeHtml {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i]!;
    if (i < values.length) {
      const value = values[i];
      if (value instanceof SafeHtml) {
        result += value.value;
      } else if (Array.isArray(value)) {
        result += value
          .map((v) => (v instanceof SafeHtml ? v.value : escapeHtml(v)))
          .join("");
      } else {
        result += escapeHtml(value);
      }
    }
  }
  return new SafeHtml(result);
}

// -----------------------------------------------------------------------------
// Token Highlighting using AST / Semantic Tokenizers
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Formatters & Helpers
// -----------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return isoString;
  }
}

function stringifyAsJson(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function stringifyAsYaml(value: unknown): string {
  if (typeof value === "string") {
    try {
      return YAML.stringify(JSON.parse(value)).trimEnd();
    } catch {
      return value;
    }
  }
  return YAML.stringify(value).trimEnd();
}

// -----------------------------------------------------------------------------
// HTML Page Rendering
// -----------------------------------------------------------------------------

export function renderInferenceSetHtml(data: Inferences.InferenceSet): string {
  const modelYaml = YAML.stringify(data.model).trimEnd();
  const isSingleSample = data.inferences.length === 1;
  const displayTemplateId = data.templateId.startsWith("Main:")
    ? data.templateId.slice("Main:".length)
    : data.templateId;

  return html`<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${displayTemplateId} · TypePrompt inferences</title>
        <style>
          :root {
            --font-sans:
              -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
              Arial, sans-serif;
            --font-mono:
              "SF Mono", Monaco, "Cascadia Code", "Liberation Mono", Menlo,
              Courier, monospace;

            /* Dark Slate Minimalist Palette */
            --bg: #0b0f19;
            --bg-surface: #111827;
            --bg-surface-elevated: #1a2234;
            --bg-inset: #070a12;

            --border: #1f293d;
            --border-subtle: #162032;
            --border-focus: #38bdf8;

            --text: #f1f5f9;
            --text-muted: #94a3b8;
            --text-soft: #64748b;

            /* Distinct Sections */
            --section-result: #0d1e35;
            --section-result-bg: #070c18;
            --section-result-border: #1e3a5f;
            --section-result-label: #38bdf8;

            --section-request: #121828;
            --section-request-bg: #0a0e19;
            --section-request-header: #121828;
            --section-request-border: #1e263c;
            --section-request-label: #94a3b8;
            --section-request-opacity: 0.88;

            /* Messaging Roles */
            --user-bg: #1e293b;
            --user-border: #334155;
            --user-label: #94a3b8;

            --assistant-bg: #0f2c42;
            --assistant-border: #164e63;
            --assistant-label: #38bdf8;

            --tool-bg: #281a3d;
            --tool-border: #4c1d95;
            --tool-label: #c084fc;

            /* Status */
            --success-text: #34d399;
            --success-bg: rgba(52, 211, 153, 0.1);
            --success-border: rgba(52, 211, 153, 0.3);

            --error-text: #f87171;
            --error-bg: rgba(248, 113, 113, 0.1);
            --error-border: rgba(248, 113, 113, 0.3);

            /* Syntax Highlighting */
            --hl-key: #7dd3fc;
            --hl-string: #a7f3d0;
            --hl-number: #fde047;
            --hl-boolean: #f472b6;
            --hl-comment: #64748b;
            --hl-xml-tag: #38bdf8;
            --hl-xml-attribute: #c084fc;
            --hl-schema-keyword: #f472b6;

            --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.4);
            --shadow-md: 0 4px 12px 0 rgba(0, 0, 0, 0.5);
          }

          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: var(--font-sans);
            background-color: var(--bg);
            color: var(--text);
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
            padding: 2rem 1.25rem 4rem;
          }

          .container {
            max-width: 980px;
            margin: 0 auto;
          }

          /* Header */
          header {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 1.25rem 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow: var(--shadow-sm);
          }

          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 1.25rem;
            flex-wrap: wrap;
          }

          .title-group h1 {
            font-size: 1.35rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: var(--text);
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }

          .badge-tag {
            font-size: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.03em;
            padding: 0.15rem 0.45rem;
            border-radius: 4px;
            background: #1e293b;
            color: #94a3b8;
            border: 1px solid var(--border);
          }

          .timestamp {
            font-size: 0.82rem;
            color: var(--text-muted);
            margin-top: 0.3rem;
          }

          /* Model Config YAML Box */
          .model-yaml-card {
            background: var(--bg-inset);
            border: 1px solid var(--border);
            border-radius: 6px;
            overflow: hidden;
            min-width: 260px;
          }

          .model-yaml-body {
            padding: 0.45rem 0.65rem;
            font-family: var(--font-mono);
            font-size: 0.82rem;
            line-height: 1.45;
            color: #e2e8f0;
            white-space: pre;
            max-height: calc(2.9em + 0.9rem);
            overflow: auto;
            scrollbar-width: thin;
          }

          /* Toolbar for expanding/collapsing all */
          .samples-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
            padding: 0 0.2rem;
          }

          .samples-count {
            font-size: 0.82rem;
            font-weight: 600;
            color: var(--text-muted);
          }

          .toolbar-actions {
            display: flex;
            gap: 0.4rem;
          }

          .btn-action {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            color: var(--text-muted);
            font-size: 0.78rem;
            font-weight: 600;
            padding: 0.25rem 0.6rem;
            border-radius: 5px;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .btn-action:hover {
            background: var(--bg-surface-elevated);
            color: var(--text);
            border-color: #334155;
          }

          /* Inferences List */
          .inferences-section {
            display: flex;
            flex-direction: column;
            gap: 0.85rem;
          }

          .inference-card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 10px;
            overflow: hidden;
            box-shadow: var(--shadow-sm);
            transition:
              border-color 0.15s ease,
              box-shadow 0.15s ease;
          }

          .inference-card:hover {
            border-color: #2e3e5c;
          }

          /* Top Bar Header */
          .card-header-bar {
            width: 100%;
            padding: 0.85rem 1.25rem;
            background: var(--bg-surface);
            border: none;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 0.85rem;
            cursor: pointer;
            text-align: left;
            user-select: none;
            transition: background 0.15s ease;
          }

          .card-header-bar:hover {
            background: var(--bg-surface-elevated);
          }

          .inference-card.is-expanded .card-header-bar {
            border-bottom: 1px solid var(--border);
          }

          .card-title-group {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex-wrap: wrap;
          }

          .toggle-arrow {
            font-size: 0.75rem;
            color: var(--text-soft);
            transition: transform 0.2s ease;
            display: inline-block;
            width: 16px;
            text-align: center;
          }

          .inference-card.is-expanded .toggle-arrow {
            transform: rotate(90deg);
            color: var(--text-muted);
          }

          .sample-index {
            font-size: 0.75rem;
            font-weight: 700;
            font-family: var(--font-mono);
            background: #1e293b;
            color: var(--text-muted);
            width: 24px;
            height: 24px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
          }

          .sample-name {
            font-size: 0.98rem;
            font-weight: 600;
            color: var(--text);
          }

          .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            font-size: 0.75rem;
            font-weight: 600;
            padding: 0.22rem 0.6rem;
            border-radius: 9999px;
            line-height: 1;
          }

          .status-badge.success {
            background: var(--success-bg);
            color: var(--success-text);
            border: 1px solid var(--success-border);
          }

          .status-badge.error {
            background: var(--error-bg);
            color: var(--error-text);
            border: 1px solid var(--error-border);
          }

          .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
          }

          .telemetry-strip {
            display: flex;
            align-items: center;
            gap: 0.85rem;
            font-size: 0.8rem;
            color: var(--text-muted);
            font-family: var(--font-mono);
            margin-left: auto;
          }

          .telemetry-item {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
          }

          .telemetry-label {
            font-family: var(--font-sans);
            color: var(--text-soft);
            font-size: 0.72rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          /* Expandable Body */
          .card-body {
            display: none;
            padding: 1.1rem 1.25rem;
            flex-direction: column;
            gap: 1.1rem;
            background: var(--bg-surface);
          }

          .inference-card.is-expanded .card-body {
            display: flex;
          }

          /* Sections */
          .section-block {
            display: flex;
            flex-direction: column;
            gap: 0.55rem;
          }

          .section-title {
            font-size: 0.82rem;
            font-weight: 600;
            letter-spacing: 0.02em;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }

          .section-title.result {
            color: var(--section-result-label);
          }

          .section-title.request {
            color: var(--section-request-label);
          }

          /* Request Panel (Muted / softer opacity for conversation & inputs) */
          .request-details {
            border: 1px solid var(--section-request-border);
            border-radius: 8px;
            background: var(--section-request-bg);
            overflow: hidden;
            opacity: var(--section-request-opacity);
            transition:
              opacity 0.2s ease,
              border-color 0.2s ease;
          }

          .request-details:hover,
          .request-details[open] {
            opacity: 0.98;
          }

          .request-summary {
            padding: 0.6rem 1rem;
            font-size: 0.82rem;
            font-weight: 600;
            color: var(--section-request-label);
            background: var(--section-request-header);
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transition:
              background 0.15s ease,
              color 0.15s ease;
          }

          .request-summary:hover {
            background: #19223c;
            color: #e0e7ff;
          }

          .request-details[open] .request-summary {
            border-bottom: 1px solid var(--section-request-border);
          }

          .request-tab-bar {
            padding: 0.45rem 0.9rem;
            background: #0f1424;
            border-bottom: 1px solid var(--section-request-border);
          }

          .request-tab-btn:hover {
            color: #e0e7ff;
            background: rgba(129, 140, 248, 0.1);
          }

          .request-tab-btn.is-active {
            color: #c7d2fe;
            background: #242c4e;
            border-color: #6366f1;
          }

          /* Output Card (Crisp Cyan / Sky - Full Opacity) */
          .output-card {
            background: var(--section-result-bg);
            border: 1px solid var(--section-result-border);
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
          }

          .output-card.error {
            border-color: var(--error-border);
            background: #140b0f;
          }

          .output-card-header {
            background: var(--section-result);
            border-bottom: 1px solid var(--section-result-border);
            padding: 0.45rem 0.9rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 0.85rem;
          }

          .output-card.error .output-card-header {
            background: #2a1118;
            border-color: var(--error-border);
          }

          .panel-tab-bar {
            padding: 0.45rem 0.9rem;
            background: #101726;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 0.85rem;
          }

          .panel-tabs,
          .output-tabs {
            display: flex;
            gap: 0.35rem;
          }

          .panel-tab-btn,
          .output-tab-btn {
            background: transparent;
            border: 1px solid transparent;
            color: var(--text-muted);
            font-family: var(--font-mono);
            font-size: 0.78rem;
            font-weight: 600;
            padding: 0.25rem 0.6rem;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .panel-tab-btn:hover,
          .output-tab-btn:hover {
            color: var(--text);
            background: rgba(255, 255, 255, 0.05);
          }

          .panel-tab-btn.is-active,
          .output-tab-btn.is-active {
            color: #38bdf8;
            background: #1e3a5f;
            border-color: #38bdf8;
          }

          .request-tab-view {
            display: none;
          }

          .request-tab-view.is-active {
            display: block;
          }

          .btn-copy {
            background: #1e293b;
            border: 1px solid #334155;
            color: #cbd5e1;
            font-size: 0.75rem;
            font-weight: 600;
            padding: 0.25rem 0.6rem;
            border-radius: 5px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            transition: all 0.15s ease;
          }

          .btn-copy:hover {
            background: #334155;
            color: #ffffff;
            border-color: #475569;
          }

          .btn-copy.copied {
            background: var(--success-bg);
            color: var(--success-text);
            border-color: var(--success-border);
          }

          .code-view {
            font-family: var(--font-mono);
            font-size: 0.84rem;
            line-height: 1.5;
            padding: 0.85rem 1rem;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-word;
            color: #e2e8f0;
            display: none;
          }

          .code-view.is-active {
            display: block;
          }

          /* Reasoning box */
          .reasoning-box {
            background: #0f1624;
            border: 1px dashed #243554;
            border-radius: 6px;
            padding: 0.8rem 1rem;
            font-size: 0.85rem;
            color: #cbd5e1;
            line-height: 1.55;
          }

          .reasoning-box em {
            display: block;
            font-style: normal;
            font-weight: 600;
            font-size: 0.75rem;
            letter-spacing: 0.02em;
            color: #7dd3fc;
            margin-bottom: 0.35rem;
          }

          /* Chat Messages Layout (Messaging app style) */
          .chat-stream {
            display: flex;
            flex-direction: column;
            gap: 0.85rem;
            padding: 0.5rem 0;
          }

          .chat-bubble-wrap {
            display: flex;
            width: 100%;
          }

          /* System message aligned to the left (with the same right margin as user) */
          .system-message-wrap {
            padding-right: 12%;
          }

          /* User messages aligned to the left (with right margin) */
          .chat-bubble-wrap.role-user {
            justify-content: flex-start;
            padding-right: 12%;
          }

          /* Assistant messages aligned to the right (with left margin) */
          .chat-bubble-wrap.role-assistant {
            justify-content: flex-end;
            padding-left: 12%;
          }

          /* Tool execution messages centered / slightly indented */
          .chat-bubble-wrap.role-tool {
            justify-content: center;
            padding: 0 6%;
          }

          .chat-bubble {
            width: 100%;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border);
            box-shadow: var(--shadow-sm);
          }

          .chat-bubble-wrap.role-user .chat-bubble {
            background: var(--user-bg);
            border-color: var(--user-border);
          }

          .chat-bubble-wrap.role-assistant .chat-bubble {
            background: var(--assistant-bg);
            border-color: var(--assistant-border);
          }

          .chat-bubble-wrap.role-tool .chat-bubble {
            background: var(--tool-bg);
            border-color: var(--tool-border);
          }

          .chat-bubble-header {
            padding: 0.4rem 0.85rem;
            font-size: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.02em;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .chat-bubble-wrap.role-user .chat-bubble-header {
            color: var(--user-label);
            background: rgba(0, 0, 0, 0.2);
          }

          .chat-bubble-wrap.role-assistant .chat-bubble-header {
            color: var(--assistant-label);
            background: rgba(0, 0, 0, 0.25);
          }

          .chat-bubble-wrap.role-tool .chat-bubble-header {
            color: var(--tool-label);
            background: rgba(0, 0, 0, 0.25);
          }

          .chat-bubble-body {
            padding: 0.75rem 0.9rem;
            font-size: 0.85rem;
            line-height: 1.5;
          }

          .chat-bubble-body pre {
            font-family: var(--font-mono);
            font-size: 0.84rem;
            white-space: pre-wrap;
            word-break: break-word;
            color: #e2e8f0;
          }

          /* Tool Call Badges */
          .tool-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            font-family: var(--font-mono);
            font-size: 0.78rem;
            background: #311d4d;
            color: #d8b4fe;
            border: 1px solid #581c87;
            padding: 0.22rem 0.55rem;
            border-radius: 5px;
            margin-bottom: 0.35rem;
          }

          /* Collapsible Details */
          details {
            border: 1px solid var(--border);
            border-radius: 6px;
            background: var(--bg-inset);
            overflow: hidden;
          }

          details summary {
            padding: 0.6rem 1rem;
            font-size: 0.82rem;
            font-weight: 600;
            color: var(--text-muted);
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            background: #131b2e;
            transition:
              background 0.15s ease,
              color 0.15s ease;
          }

          details summary:hover {
            background: #1a253d;
            color: var(--text);
          }

          details[open] summary {
            border-bottom: 1px solid var(--border);
          }

          .details-body {
            padding: 0.85rem 1rem;
          }

          .source-file-item {
            border: 1px solid var(--border);
            border-radius: 5px;
            background: #090d16;
            overflow: hidden;
          }

          .source-file-header {
            padding: 0.45rem 0.85rem;
            background: #172136;
            color: #94a3b8;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            transition:
              background 0.15s ease,
              color 0.15s ease;
          }

          .source-file-header:hover {
            background: #1e2c47;
            color: #e2e8f0;
          }

          .source-file-item[open] .source-file-header {
            border-bottom: 1px solid var(--border);
          }

          /* Syntax Highlighting Classes */
          .hl-key {
            color: var(--hl-key);
          }
          .hl-string {
            color: var(--hl-string);
          }
          .hl-number {
            color: var(--hl-number);
          }
          .hl-boolean {
            color: var(--hl-boolean);
            font-weight: 600;
          }
          .hl-comment {
            color: var(--hl-comment);
            font-style: italic;
          }
          .hl-xml-tag {
            color: var(--hl-xml-tag);
            font-weight: 600;
          }
          .hl-xml-attribute {
            color: var(--hl-xml-attribute);
          }
          .hl-schema-keyword {
            color: var(--hl-schema-keyword);
            font-weight: 600;
          }

          .source-files-section {
            margin-top: 2.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid var(--border);
          }

          footer {
            margin-top: 2.5rem;
            text-align: center;
            font-size: 0.82rem;
            color: var(--text-soft);
          }

          footer a {
            color: var(--text-muted);
            text-decoration: none;
          }

          footer a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <header>
            <div class="header-top">
              <div class="title-group">
                <h1>
                  <span>${displayTemplateId}</span>
                  <span class="badge-tag">playground</span>
                </h1>
                <div class="timestamp">
                  Run at ${formatTimestamp(data.isoTimestamp)} · ID:
                  ${data.id.slice(0, 8)}
                </div>
              </div>

              <!-- Model YAML block -->
              <div class="model-yaml-card">
                <pre class="model-yaml-body">${highlightYaml(modelYaml)}</pre>
              </div>
            </div>
          </header>

          <!-- Samples Toolbar -->
          <div class="samples-toolbar">
            <div class="samples-count">
              ${data.inferences.length}
              sample${data.inferences.length !== 1 ? "s" : ""}
            </div>
            <div class="toolbar-actions">
              <button
                type="button"
                class="btn-action"
                onclick="toggleAllSamples(true)"
              >
                Expand all
              </button>
              <button
                type="button"
                class="btn-action"
                onclick="toggleAllSamples(false)"
              >
                Collapse all
              </button>
            </div>
          </div>

          <!-- Inferences List -->
          <main class="inferences-section">
            ${data.inferences.map((inf) => {
              const sampleYaml = extractSampleYaml(
                inf,
                data.templateFiles,
                data.templateId,
              );
              return renderInferenceCard(inf, isSingleSample, sampleYaml);
            })}
          </main>

          <!-- Source Files Section (at the end with a clear separator) -->
          ${
            Object.keys(data.templateFiles).length > 0
              ? html`
                  <div class="source-files-section">
                    <details>
                      <summary>
                        View source files
                        (${Object.keys(data.templateFiles).length})
                      </summary>
                      <div
                        class="details-body"
                        style="display: flex; flex-direction: column; gap: 0.65rem;"
                      >
                        ${Object.entries(data.templateFiles)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(
                            ([filePath, content]) => html`
                              <details class="source-file-item">
                                <summary class="source-file-header">
                                  <span
                                    style="font-family: var(--font-mono); font-size: 0.82rem; font-weight: 600;"
                                    >${filePath}</span
                                  >
                                </summary>
                                <pre
                                  class="code-view is-active"
                                  style="padding: 0.85rem 1rem; background: #070a12; margin: 0;"
                                >
${highlightTp(content)}</pre>
                              </details>
                            `,
                          )}
                      </div>
                    </details>
                  </div>
                `
              : ""
          }

          <footer>
            Generated with
            <a href="https://typeprompt.dev" target="_blank" rel="noopener"
              >TypePrompt</a
            >
          </footer>
        </div>

        <script>
          function toggleSample(cardId) {
            const card = document.getElementById(cardId);
            if (!card) return;
            card.classList.toggle("is-expanded");
          }

          function toggleAllSamples(expanded) {
            const cards = document.querySelectorAll(".inference-card");
            cards.forEach((c) => {
              if (expanded) {
                c.classList.add("is-expanded");
              } else {
                c.classList.remove("is-expanded");
              }
            });
          }

          function switchRequestTab(cardId, tabName) {
            const card = document.getElementById(cardId);
            if (!card) return;

            const buttons = card.querySelectorAll(".request-tab-btn");
            buttons.forEach((btn) => {
              if (btn.getAttribute("data-tab") === tabName) {
                btn.classList.add("is-active");
              } else {
                btn.classList.remove("is-active");
              }
            });

            const views = card.querySelectorAll(".request-tab-view");
            views.forEach((v) => {
              if (v.getAttribute("data-view") === tabName) {
                v.classList.add("is-active");
              } else {
                v.classList.remove("is-active");
              }
            });
          }

          function switchOutputTab(cardId, tabName) {
            const card = document.getElementById(cardId);
            if (!card) return;

            const buttons = card.querySelectorAll(".output-tab-btn");
            buttons.forEach((btn) => {
              if (btn.getAttribute("data-tab") === tabName) {
                btn.classList.add("is-active");
              } else {
                btn.classList.remove("is-active");
              }
            });

            const views = card.querySelectorAll(".output-code-view");
            views.forEach((v) => {
              if (v.getAttribute("data-view") === tabName) {
                v.classList.add("is-active");
              } else {
                v.classList.remove("is-active");
              }
            });
          }

          async function copyActiveOutput(button, cardId) {
            const card = document.getElementById(cardId);
            if (!card) return;

            const activeView = card.querySelector(
              ".output-code-view.is-active",
            );
            if (!activeView) return;

            const text =
              activeView.getAttribute("data-raw") ||
              activeView.textContent ||
              "";
            try {
              await navigator.clipboard.writeText(text);
              const originalText = button.innerHTML;
              button.classList.add("copied");
              button.textContent = "Copied!";
              setTimeout(() => {
                button.classList.remove("copied");
                button.innerHTML = originalText;
              }, 1500);
            } catch (err) {
              console.error("Failed to copy text: ", err);
            }
          }
        </script>
      </body>
    </html>`.value;
}

function extractSampleYaml(
  inference: Inferences.Inference,
  templateFiles: { readonly [path: string]: string } | undefined,
  templateId: string,
): string {
  if (templateFiles) {
    const shortTemplateId = templateId.split(":").pop() ?? templateId;
    let targetSamplesYaml: string | null = null;

    // 1. Look for playground matching templateId
    for (const content of Object.values(templateFiles)) {
      const playMatch =
        /<playground\s+[^>]*for=["']([^"']+)["'][^>]*>([\s\S]*?)<\/playground>/.exec(
          content,
        );
      if (playMatch) {
        const forAttr = playMatch[1];
        if (forAttr === templateId || forAttr === shortTemplateId) {
          const samplesMatch = /<samples>([\s\S]*?)<\/samples>/.exec(
            playMatch[2] ?? "",
          );
          if (samplesMatch) {
            targetSamplesYaml = samplesMatch[1] ?? null;
            break;
          }
        }
      }
    }

    // 2. Fallback: look for any <samples> in template files
    if (!targetSamplesYaml) {
      for (const content of Object.values(templateFiles)) {
        const match = /<samples>([\s\S]*?)<\/samples>/.exec(content);
        if (match) {
          targetSamplesYaml = match[1] ?? null;
          break;
        }
      }
    }

    if (targetSamplesYaml) {
      try {
        const doc = YAML.parseDocument(targetSamplesYaml);
        if (YAML.isSeq(doc.contents)) {
          if (inference.name) {
            const found = doc.contents.items.find((it) => {
              if (YAML.isMap(it)) {
                return it.get("name") === inference.name;
              }
              return false;
            });
            if (found) {
              return YAML.stringify(found).trim();
            }
          }
          const itemByIndex = doc.contents.items[inference.sampleIndex];
          if (itemByIndex) {
            return YAML.stringify(itemByIndex).trim();
          }
        }
      } catch {
        // Fall back to reconstructed sample
      }
    }
  }

  // Fallback: reconstruct from inference request messages
  const sampleObj: Record<string, unknown> = {};
  if (inference.name) {
    sampleObj.name = inference.name;
  }
  const lastUserMsg = [...inference.request.messages]
    .reverse()
    .find((m) => m.role === "user");
  if (
    lastUserMsg &&
    "input" in lastUserMsg &&
    lastUserMsg.input !== undefined
  ) {
    sampleObj.input = lastUserMsg.input;
  }
  return YAML.stringify(sampleObj).trim();
}

function renderInferenceCard(
  inference: Inferences.Inference,
  isSingleSample: boolean,
  sampleYaml: string,
): SafeHtml {
  const { sampleIndex, name, request, result } = inference;
  const isSuccess = result.kind === "success";
  const cardId = `sample-${sampleIndex}`;
  const expandedClass = isSingleSample ? "is-expanded" : "";

  return html`
    <article id="${cardId}" class="inference-card ${expandedClass}">
      <button
        type="button"
        class="card-header-bar"
        onclick="toggleSample('${cardId}')"
        aria-label="Toggle sample details"
      >
        <div class="card-title-group">
          <span class="toggle-arrow">▶</span>
          <span class="sample-index">${sampleIndex + 1}</span>
          <span class="sample-name"
            >${name ?? `Sample ${sampleIndex + 1}`}</span
          >
          <span class="status-badge ${isSuccess ? "success" : "error"}">
            <span class="status-dot"></span>
            ${isSuccess ? "Success" : result.error.kind}
          </span>
        </div>

        ${result.telemetry ? renderTelemetryStrip(result.telemetry) : ""}
      </button>

      <div class="card-body">
        <!-- Conversation & inputs (collapsible) -->
        <details class="request-details">
          <summary class="request-summary">
            <span
              >Conversation &amp; inputs (${request.messages.length}
              message${request.messages.length !== 1 ? "s" : ""})</span
            >
          </summary>
          <div class="panel-tab-bar request-tab-bar">
            <div class="panel-tabs">
              <button
                type="button"
                class="panel-tab-btn request-tab-btn is-active"
                data-tab="yaml"
                onclick="switchRequestTab('${cardId}', 'yaml')"
              >
                YAML
              </button>
              <button
                type="button"
                class="panel-tab-btn request-tab-btn"
                data-tab="rendered"
                onclick="switchRequestTab('${cardId}', 'rendered')"
              >
                Rendered
              </button>
            </div>
          </div>

          <!-- YAML View (Default Active) -->
          <div class="request-tab-view is-active" data-view="yaml">
            <pre
              id="${cardId}-request-yaml"
              class="code-view is-active"
              data-raw="${escapeHtml(sampleYaml)}"
              style="margin: 0; background: #070a12; padding: 0.85rem 1rem;"
            >
${highlightYaml(sampleYaml)}</pre>
          </div>

          <!-- Rendered View -->
          <div class="request-tab-view" data-view="rendered">
            <div class="details-body">${renderRequestContext(request)}</div>
          </div>
        </details>

        <!-- Optional Reasoning / Thinking Box -->
        ${
          result.reasoning
            ? html`
                <div class="reasoning-box">
                  <em>Thinking / reasoning</em>
                  ${result.reasoning}
                </div>
              `
            : ""
        }

        <!-- Result / Output Section -->
        <div class="section-block">
          <div class="section-title result">Output</div>
          ${renderResultOutput(cardId, result, request.outputFormat.format)}
        </div>
      </div>
    </article>
  `;
}

function renderTelemetryStrip(
  telemetry: Inferences.InferenceTelemetry,
): SafeHtml {
  const { latencyMs, usage } = telemetry;

  return html`
    <div class="telemetry-strip">
      <span class="telemetry-item" title="Latency">
        <span class="telemetry-label">lat</span>
        <strong>${formatDuration(latencyMs)}</strong>
      </span>
      ${
        usage
          ? html`
              <span class="telemetry-item" title="Total Tokens (In / Out)">
                <span class="telemetry-label">tokens</span>
                <strong>${formatNumber(usage.totalTokens)}</strong>
                <span style="color: var(--text-soft)"
                  >(${usage.inputTokens} in / ${usage.outputTokens} out)</span
                >
              </span>
              ${
                usage.reasoningTokens
                  ? html`
                      <span class="telemetry-item" title="Reasoning Tokens">
                        <span class="telemetry-label">reasoning</span>
                        <strong>${formatNumber(usage.reasoningTokens)}</strong>
                      </span>
                    `
                  : ""
              }
            `
          : ""
      }
    </div>
  `;
}

function renderResultOutput(
  cardId: string,
  result: Inferences.InferenceResult,
  outputFormat: "json" | "text",
): SafeHtml {
  if (result.kind === "success") {
    return renderSuccessResponse(cardId, result.response, outputFormat);
  }
  return renderErrorResponse(result.error);
}

function renderSuccessResponse(
  cardId: string,
  response: Inferences.InferenceResponse,
  outputFormat: "json" | "text",
): SafeHtml {
  if (response.kind === "output") {
    if (outputFormat === "json") {
      const jsonRaw = stringifyAsJson(response.output);
      const yamlRaw = stringifyAsYaml(response.output);

      return html`
        <div class="output-card">
          <div class="output-card-header">
            <div class="output-tabs">
              <button
                type="button"
                class="output-tab-btn is-active"
                data-tab="yaml"
                onclick="switchOutputTab('${cardId}', 'yaml')"
              >
                YAML
              </button>
              <button
                type="button"
                class="output-tab-btn"
                data-tab="json"
                onclick="switchOutputTab('${cardId}', 'json')"
              >
                JSON
              </button>
            </div>

            <button
              type="button"
              class="btn-copy"
              onclick="copyActiveOutput(this, '${cardId}')"
              title="Copy code to clipboard"
            >
              Copy
            </button>
          </div>

          <!-- YAML View (Default Active) -->
          <pre
            class="code-view output-code-view is-active"
            data-view="yaml"
            data-raw="${escapeHtml(yamlRaw)}"
          >
${highlightYaml(yamlRaw)}</pre>

          <!-- JSON View -->
          <pre
            class="code-view output-code-view"
            data-view="json"
            data-raw="${escapeHtml(jsonRaw)}"
          >
${highlightJson(jsonRaw)}</pre>
        </div>
      `;
    }

    // Text output
    return html`
      <div class="output-card">
        <div class="output-card-header">
          <span
            style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted);"
            >Text</span
          >
          <button
            type="button"
            class="btn-copy"
            onclick="copyActiveOutput(this, '${cardId}')"
            title="Copy code to clipboard"
          >
            Copy
          </button>
        </div>
        <pre
          class="code-view output-code-view is-active"
          data-view="text"
          data-raw="${escapeHtml(response.rawText)}"
        >
${response.rawText}</pre>
      </div>
    `;
  }

  // Tool calls response
  return html`
    <div class="output-card">
      <div class="output-card-header">
        <span
          style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);"
          >Tool calls (${response.toolCalls.length})</span
        >
      </div>
      <div style="padding: 0.85rem 1rem;">
        ${response.toolCalls.map((tc) => renderToolCall(tc))}
      </div>
    </div>
  `;
}

function renderErrorResponse(error: Inferences.InferenceError): SafeHtml {
  return html`
    <div class="output-card error">
      <div class="output-card-header">
        <span
          style="font-size: 0.82rem; font-weight: 700; color: var(--error-text);"
          >Error: ${error.kind}</span
        >
      </div>
      <div style="padding: 0.85rem 1rem;">
        <p
          style="color: var(--error-text); font-weight: 600; margin-bottom: 0.75rem;"
        >
          ${error.message}
        </p>
        ${
          "rawText" in error && error.rawText
            ? html`
                <div>
                  <div
                    style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem;"
                  >
                    Raw model output:
                  </div>
                  <pre
                    class="code-view is-active"
                    style="background: #070a12; border: 1px solid var(--border);"
                  >
${error.rawText}</pre>
                </div>
              `
            : ""
        }
      </div>
    </div>
  `;
}

function renderToolCall(tc: Inferences.ToolCall): SafeHtml {
  const jsonStr = stringifyAsJson(tc.input);
  return html`
    <div style="margin-bottom: 0.85rem;">
      <span class="tool-badge">
        <strong>${tc.toolName}</strong>
        <span style="color: #a855f7">(${tc.callId})</span>
      </span>
      <pre
        class="code-view is-active"
        style="background: #070a12; border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem 0.9rem; margin-top: 0.35rem;"
      >
${highlightJson(jsonStr)}</pre>
    </div>
  `;
}

function renderRequestContext(request: Inferences.InferenceRequest): SafeHtml {
  return html`
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      ${
        request.systemMessage
          ? html`
              <div class="system-message-wrap">
                <div
                  class="section-title request"
                  style="margin-bottom: 0.45rem;"
                >
                  System message
                </div>
                <pre
                  class="code-view is-active"
                  style="background: #070a12; border: 1px solid var(--section-request-border); border-radius: 6px;"
                >
${request.systemMessage}</pre>
              </div>
            `
          : ""
      }
      ${
        request.tools.length > 0
          ? html`
              <div>
                <div
                  class="section-title request"
                  style="margin-bottom: 0.45rem;"
                >
                  Available tools (${request.tools.length})
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                  ${request.tools.map(
                    (t) => html`
                      <span class="tool-badge" title="${t.description}">
                        ${t.name}
                      </span>
                    `,
                  )}
                </div>
              </div>
            `
          : ""
      }

      <div>
        <div class="section-title request" style="margin-bottom: 0.6rem;">
          Conversation history &amp; messages
        </div>
        <div class="chat-stream">
          ${request.messages.map((msg) => renderChatMessage(msg))}
        </div>
      </div>
    </div>
  `;
}

function renderChatMessage(message: Inferences.Message): SafeHtml {
  const role = message.role;

  return html`
    <div class="chat-bubble-wrap role-${role}">
      <div class="chat-bubble">
        <div class="chat-bubble-header">
          <span>${role}</span>
        </div>
        <div class="chat-bubble-body">
          ${
            role === "user"
              ? html` <pre>${message.rendered}</pre> `
              : role === "assistant"
                ? html`
                    ${
                      message.toolCalls
                        ? html`
                            <div>
                              ${message.toolCalls.map((tc) => renderToolCall(tc))}
                            </div>
                          `
                        : html`
                            <pre>
${highlightJson(stringifyAsJson(message.output))}</pre>
                          `
                    }
                  `
                : role === "tool"
                  ? html`
                      <div>
                        ${message.toolResults.map(
                          (tr) => html`
                            <div style="margin-bottom: 0.65rem;">
                              <span
                                class="tool-badge"
                                style="background: #14352b; color: #6ee7b7; border-color: #065f46;"
                              >
                                ${tr.toolName} · result (${tr.callId})
                              </span>
                              <pre
                                class="code-view is-active"
                                style="background: #070a12; border: 1px solid var(--border); border-radius: 6px; margin-top: 0.35rem;"
                              >
${highlightJson(stringifyAsJson(tr.output))}</pre>
                            </div>
                          `,
                        )}
                      </div>
                    `
                  : ""
          }
        </div>
      </div>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// CLI Execution
// -----------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(
      "Usage: npx tsx packages/vscode/src/render-inference-set-html.ts <input-json-path> [output-html-path]",
    );
    process.exit(1);
  }

  const inputPath = resolve(args[0]!);
  const outputPath = args[1]
    ? resolve(args[1])
    : inputPath.replace(/\.json$/i, ".html");

  const rawJson = readFileSync(inputPath, "utf-8");
  const inferenceSet: Inferences.InferenceSet = JSON.parse(rawJson);

  if (inferenceSet.kind !== "playground-inference-set") {
    console.error(
      `Error: Expected JSON with kind 'playground-inference-set', got '${inferenceSet.kind}'`,
    );
    process.exit(1);
  }

  const renderedHtml = renderInferenceSetHtml(inferenceSet);
  writeFileSync(outputPath, renderedHtml, "utf-8");
  console.log(`Rendered HTML written to: ${outputPath}`);
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("render-inference-set-html.ts") ||
    process.argv[1].endsWith("render-inference-set-html.js"));

if (isDirectRun) {
  main();
}
