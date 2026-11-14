import type { Inferences } from "@typeprompt/core";
import { html, type TemplateResult } from "lit";
import "../common/code.js";
import "../common/copy-button.js";
import { stringifyAsJson, stringifyAsYaml } from "../common/formatters.js";
import { renderToolCall } from "../common/render-request-context.js";

export function renderResultOutput(
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
  if (result.kind === "output" || result.kind === "tool-calls") {
    return renderSuccessResponse(result, outputFormat, activeTab, onTabChange);
  }
  return renderErrorResponse(result.error);
}

export function renderSuccessResponse(
  result: Extract<
    Inferences.InferenceResult,
    { kind: "output" | "tool-calls" }
  >,
  outputFormat: "json" | "text",
  activeTab: "yaml" | "json" | "text",
  onTabChange: (tab: "yaml" | "json" | "text") => void,
): TemplateResult {
  if (result.kind === "output") {
    if (outputFormat === "json") {
      const jsonRaw = stringifyAsJson(result.output);
      const yamlRaw = stringifyAsYaml(result.output);
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
                  <tp-code
                    class="output-code-view"
                    .code=${yamlRaw}
                    language="yaml"
                  ></tp-code>
                `
              : html`
                  <tp-code
                    class="output-code-view"
                    .code=${jsonRaw}
                    language="json"
                  ></tp-code>
                `
          }
        </div>
      `;
    }

    // Text output
    return html`
      <div class="output-card">
        <div class="output-card-header">
          <span class="output-card-label">Text</span>
          <tp-copy-button .text=${result.rawText}></tp-copy-button>
        </div>
        <tp-code
          class="output-code-view"
          .code=${result.rawText}
          language="text"
        ></tp-code>
      </div>
    `;
  }

  // Tool calls response
  return html`
    <div class="output-card">
      <div class="output-card-header">
        <span class="output-card-label"
          >Tool calls (${result.toolCalls.length})</span
        >
      </div>
      <div class="output-card-body">
        ${result.toolCalls.map((tc) => renderToolCall(tc))}
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
        <span class="output-card-label error">Error: ${error.kind}</span>
      </div>
      <div class="output-card-body">
        <p class="error-message">${error.message}</p>
        ${
          "rawText" in error && error.rawText
            ? html`
                <div>
                  <div class="raw-output-label">Raw model output:</div>
                  <tp-code
                    class="raw-output-code"
                    .code=${error.rawText}
                    language="text"
                  ></tp-code>
                </div>
              `
            : ""
        }
      </div>
    </div>
  `;
}
