import type { Inferences } from "@typeprompt/core";
import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { stringifyAsJson } from "./formatters.js";
import { highlightJson } from "./token-highlighting.js";

export function renderToolCall(tc: Inferences.ToolCall): TemplateResult {
  const jsonStr = stringifyAsJson(tc.input);
  return html`
    <div style="margin-bottom: 0.85rem;">
      <span class="tool-badge">
        <strong>${tc.toolName}</strong>
        <span style="color: var(--tool-label, #c084fc)">(${tc.callId})</span>
      </span>
      <pre
        class="code-view is-active"
        style="background: var(--bg-inset, #070a12); border: 1px solid var(--border, #1f293d); border-radius: 6px; padding: 0.75rem 0.9rem; margin-top: 0.35rem;"
      ><code>${unsafeHTML(highlightJson(jsonStr))}</code></pre>
    </div>
  `;
}

export function renderChatMessage(message: Inferences.Message): TemplateResult {
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
              ? html`<pre>${message.rendered}</pre>`
              : role === "assistant"
                ? html`
                    ${
                      message.toolCalls
                        ? html`<div>
                            ${message.toolCalls.map((tc) => renderToolCall(tc))}
                          </div>`
                        : html`<pre><code>${unsafeHTML(highlightJson(stringifyAsJson(message.output)))}</code></pre>`
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
                                style="background: var(--success-bg, rgba(34,197,94,0.15)); color: var(--success-text, #4ade80); border-color: var(--success-border, rgba(34,197,94,0.4));"
                              >
                                ${tr.toolName} · result (${tr.callId})
                              </span>
                              <pre
                                class="code-view is-active"
                                style="background: var(--bg-inset, #070a12); border: 1px solid var(--border, #1f293d); border-radius: 6px; margin-top: 0.35rem;"
                              ><code>${unsafeHTML(highlightJson(stringifyAsJson(tr.output)))}</code></pre>
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

export function renderToolCard(tool: Inferences.Tool): TemplateResult {
  return html`
    <div class="tool-card">
      <div class="tool-card-header">
        <span class="tool-badge">
          <span class="tool-icon">⬡</span>
          <strong>${tool.name}</strong>
        </span>
      </div>
      ${
        tool.description
          ? html`<div class="tool-card-description">${tool.description}</div>`
          : ""
      }
    </div>
  `;
}

export function renderRequestContext(
  request: Inferences.InferenceRequest,
): TemplateResult {
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
                  style="background: var(--bg-inset, #070a12); border: 1px solid var(--section-request-border, #1f293d); border-radius: 6px;"
                ><code>${request.systemMessage}</code></pre>
              </div>
            `
          : ""
      }
      ${
        request.tools.length > 0
          ? html`
              <div class="tools-section">
                <div
                  class="section-title request"
                  style="margin-bottom: 0.5rem;"
                >
                  Tools (${request.tools.length})
                </div>
                <div class="tools-list">
                  ${request.tools.map((t) => renderToolCard(t))}
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
