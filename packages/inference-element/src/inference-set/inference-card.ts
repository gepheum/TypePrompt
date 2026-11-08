import type { Inferences } from "@typeprompt/core";
import { html, type TemplateResult } from "lit";
import { renderRequestContext } from "../common/render-request-context.js";
import { renderResultOutput } from "./result-output.js";
import { renderTelemetryStrip } from "./telemetry.js";

export function renderInferenceCard(
  inference: Inferences.Inference<Inferences.Pending>,
  totalSamples: number,
  isExpanded: boolean,
  onToggleExpand: () => void,
  activeTab: "yaml" | "json" | "text",
  onTabChange: (tab: "yaml" | "json" | "text") => void,
  onCopy: (text: string) => void,
  isCopied: boolean,
): TemplateResult {
  const { sampleIndex, name, note, request, result } = inference;
  const isSuccess = result.kind === "success";
  const isPending = result.kind === "pending";
  const cardId = `sample-${sampleIndex}`;
  const statusClass = isSuccess ? "success" : isPending ? "pending" : "error";
  const statusLabel = isSuccess
    ? "Success"
    : isPending
      ? "Pending"
      : result.error.kind;
  const displayName = name ?? `Anonymous ${sampleIndex + 1}/${totalSamples}`;

  return html`
    <article class="inference-card ${isExpanded ? "is-expanded" : ""}">
      <button
        type="button"
        class="card-header-bar"
        @click=${onToggleExpand}
        aria-label="Toggle sample details"
      >
        <div class="card-title-group">
          <span class="toggle-arrow">▶</span>
          <span class="sample-index">${sampleIndex + 1}</span>
          <span class="sample-name">${displayName}</span>
          <span class="status-badge ${statusClass}">
            <span class="status-dot"></span>
            ${statusLabel}
          </span>
        </div>

        ${
          !isPending && result.telemetry
            ? renderTelemetryStrip(result.telemetry)
            : ""
        }
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
          <div class="details-body">
            ${
              note
                ? html`
                    <div class="sample-note-card">
                      <div class="sample-note-header">
                        <span class="sample-note-title">Note</span>
                      </div>
                      <div class="sample-note-body">${note}</div>
                    </div>
                  `
                : ""
            }
            ${renderRequestContext(request)}
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
          ${renderResultOutput(
            cardId,
            result,
            request.outputFormat.format,
            activeTab,
            onTabChange,
            onCopy,
            isCopied,
          )}
        </div>
      </div>
    </article>
  `;
}
