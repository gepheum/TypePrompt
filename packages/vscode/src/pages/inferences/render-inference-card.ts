import type { Inferences } from "@typeprompt/core";
import YAML from "yaml";
import { escapeHtml, html, type SafeHtml } from "../common/html.js";
import { renderRequestContext } from "../common/render-request-context.js";
import { highlightYaml } from "../common/token-highlighting.js";
import { renderResultOutput } from "./render-result-output.js";
import { renderTelemetryStrip } from "./render-telemetry.js";

export function extractSampleYaml(
  inference: Inferences.Inference<Inferences.Pending>,
): string {
  const sampleObj: Record<string, unknown> = {};
  if (inference.name) {
    sampleObj.name = inference.name;
  }
  if (inference.note) {
    sampleObj.note = inference.note;
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

export function renderInferenceCard(
  inference: Inferences.Inference<Inferences.Pending>,
  isSingleSample: boolean,
  sampleYaml: string,
): SafeHtml {
  const { sampleIndex, name, request, result } = inference;
  const isSuccess = result.kind === "success";
  const isPending = result.kind === "pending";
  const cardId = `sample-${sampleIndex}`;
  const expandedClass = isSingleSample ? "is-expanded" : "";
  const statusClass = isSuccess ? "success" : isPending ? "pending" : "error";
  const statusLabel = isSuccess
    ? "Success"
    : isPending
      ? "Pending"
      : result.error.kind;

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
          <span class="status-badge ${statusClass}">
            <span class="status-dot"></span>
            ${statusLabel}
          </span>
        </div>

        ${!isPending && result.telemetry ? renderTelemetryStrip(result.telemetry) : ""}
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
              style="margin: 0; background: var(--bg-inset); padding: 0.85rem 1rem;"
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
          !isPending && result.reasoning
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
