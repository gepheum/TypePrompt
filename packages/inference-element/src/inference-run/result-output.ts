import type { Inferences } from "@typeprompt/core";
import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import "../common/copy-button.js";
import { stringifyAsJson, stringifyAsYaml } from "../common/formatters.js";
import { renderToolCall } from "../common/render-request-context.js";
import { highlightJson, highlightYaml } from "../common/token-highlighting.js";

export function renderResultOutput(
  cardId: string,
  result: Inferences.InferenceResult<Inferences.Pending>,
  outputFormat: "json" | "text",
  activeTab: "yaml" | "json" | "text",
  onTabChange: (tab: "yaml" | "json" | "text") => void,
): TemplateResult {
  if (result.kind === "pending") {
    return html`
      <div class="pending-output">
        <span class="pending-spinner">⏳</span> Inference pending...
      </div>
    `;
  }
  if (result.kind === "success") {
    return renderSuccessResponse(
      cardId,
      result.response,
      outputFormat,
      activeTab,
      onTabChange,
    );
  }
  return renderErrorResponse(result.error);
}

export function renderSuccessResponse(
  cardId: string,
  response: Inferences.InferenceResponse,
  outputFormat: "json" | "text",
  activeTab: "yaml" | "json" | "text",
  onTabChange: (tab: "yaml" | "json" | "text") => void,
): TemplateResult {
  if (response.kind === "output") {
    if (outputFormat === "json") {
      const jsonRaw = stringifyAsJson(response.output);
      const yamlRaw = stringifyAsYaml(response.output);
      const currentTab = activeTab === "text" ? "yaml" : activeTab;
      const textToCopy = currentTab === "yaml" ? yamlRaw : jsonRaw;

      return html`
        <div class="output-card">
          <div class="output-card-header">
            <div class="output-tabs">
              <button
                type="button"
                class="output-tab-btn ${currentTab === "yaml" ? "is-active" : ""}"
                @click=${(): void => onTabChange("yaml")}
              >
                YAML
              </button>
              <button
                type="button"
                class="output-tab-btn ${currentTab === "json" ? "is-active" : ""}"
                @click=${(): void => onTabChange("json")}
              >
                JSON
              </button>
            </div>

            <tp-copy-button .text=${textToCopy}></tp-copy-button>
          </div>

          ${
            currentTab === "yaml"
              ? html`
                  <pre
                    class="code-view output-code-view is-active"
                  ><code>${unsafeHTML(highlightYaml(yamlRaw))}</code></pre>
                `
              : html`
                  <pre
                    class="code-view output-code-view is-active"
                  ><code>${unsafeHTML(highlightJson(jsonRaw))}</code></pre>
                `
          }
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
          <tp-copy-button .text=${response.rawText}></tp-copy-button>
        </div>
        <pre
          class="code-view output-code-view is-active"
        ><code>${response.rawText}</code></pre>
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

export function renderErrorResponse(
  error: Inferences.InferenceError,
): TemplateResult {
  return html`
    <div class="output-card error">
      <div class="output-card-header">
        <span
          style="font-size: 0.82rem; font-weight: 700; color: var(--error-text, #f87171);"
          >Error: ${error.kind}</span
        >
      </div>
      <div style="padding: 0.85rem 1rem;">
        <p
          style="color: var(--error-text, #f87171); font-weight: 600; margin-bottom: 0.75rem;"
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
                    style="background: var(--bg-inset); border: 1px solid var(--border);"
                  ><code>${error.rawText}</code></pre>
                </div>
              `
            : ""
        }
      </div>
    </div>
  `;
}
