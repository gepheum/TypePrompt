import type { Inferences } from "@typeprompt/core";
import { stringifyAsJson, stringifyAsYaml } from "../common/formatters.js";
import { escapeHtml, html, type SafeHtml } from "../common/html.js";
import { renderToolCall } from "../common/render-request-context.js";
import { highlightJson, highlightYaml } from "../common/token-highlighting.js";

export function renderResultOutput(
  cardId: string,
  result: Inferences.InferenceResult<Inferences.Pending>,
  outputFormat: "json" | "text",
): SafeHtml {
  if (result.kind === "pending") {
    return html`
      <div class="pending-output">
        <span class="pending-spinner">⏳</span> Inference pending...
      </div>
    `;
  }
  if (result.kind === "success") {
    return renderSuccessResponse(cardId, result.response, outputFormat);
  }
  return renderErrorResponse(result.error);
}

export function renderSuccessResponse(
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

export function renderErrorResponse(
  error: Inferences.InferenceError,
): SafeHtml {
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
                    style="background: var(--bg-inset); border: 1px solid var(--border);"
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
