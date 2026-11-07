import type { Inferences } from "@typeprompt/core";
import { stringifyAsJson } from "./formatters.js";
import { html, type SafeHtml } from "./html.js";
import { highlightJson } from "./token-highlighting.js";

export function renderToolCall(tc: Inferences.ToolCall): SafeHtml {
  const jsonStr = stringifyAsJson(tc.input);
  return html`
    <div style="margin-bottom: 0.85rem;">
      <span class="tool-badge">
        <strong>${tc.toolName}</strong>
        <span style="color: var(--tool-label)">(${tc.callId})</span>
      </span>
      <pre
        class="code-view is-active"
        style="background: var(--bg-inset); border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem 0.9rem; margin-top: 0.35rem;"
      >
${highlightJson(jsonStr)}</pre>
    </div>
  `;
}

export function renderRequestContext(
  request: Inferences.InferenceRequest,
): SafeHtml {
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
                  style="background: var(--bg-inset); border: 1px solid var(--section-request-border); border-radius: 6px;"
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

export function renderChatMessage(message: Inferences.Message): SafeHtml {
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
                                style="background: var(--success-bg); color: var(--success-text); border-color: var(--success-border);"
                              >
                                ${tr.toolName} · result (${tr.callId})
                              </span>
                              <pre
                                class="code-view is-active"
                                style="background: var(--bg-inset); border: 1px solid var(--border); border-radius: 6px; margin-top: 0.35rem;"
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

