import type { Inferences } from "@typeprompt/core";
import { html, type TemplateResult } from "lit";
import "./code.js";
import { stringifyAsJson } from "./formatters.js";

export function renderToolCall(tc: Inferences.ToolCall): TemplateResult {
  const jsonStr = stringifyAsJson(tc.input);
  return html`
    <div style="margin-bottom: 0.85rem;">
      <span class="tool-badge">
        <strong>${tc.toolName}</strong>
        <span style="color: var(--tool-label, #c084fc)">(${tc.callId})</span>
      </span>
      <tp-code
        .code=${jsonStr}
        language="json"
        style="padding: 0.75rem 0.9rem; margin-top: 0.35rem;"
      ></tp-code>
    </div>
  `;
}

export function renderChatMessage(message: Inferences.Message): TemplateResult {
  const role = message.role;

  return html`
    <div class="chat-bubble-wrap role-${role}">
      <div class="chat-bubble">
        <div class="chat-bubble-header">
          <span>${role === "tool" ? "tool result" : role}</span>
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
                        : html`<tp-code
                            .code=${stringifyAsJson(message.output)}
                            language="json"
                          ></tp-code>`
                    }
                  `
                : role === "tool"
                  ? html`
                      <div>
                        ${message.toolResults.map(
                          (tr) => html`
                            <div style="margin-bottom: 0.65rem;">
                              <span class="tool-badge success">
                                ${tr.toolName} · result (${tr.callId})
                              </span>
                              <tp-code
                                .code=${stringifyAsJson(tr.output)}
                                language="json"
                                style="margin-top: 0.35rem;"
                              ></tp-code>
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
                <tp-code
                  .code=${request.systemMessage}
                  language="text"
                  style="border-color: var(--section-request-border, #1f293d);"
                ></tp-code>
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
