import type { Inferences } from "@typeprompt/core";
import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { renderRequestContext } from "../common/render-request-context.js";
import { commonStyles } from "../common/styles.js";
import { renderResultOutput } from "./result-output.js";
import { inferenceSetStyles } from "./styles.js";
import { renderTelemetryStrip } from "./telemetry.js";

@customElement("tp-inference-sample")
export class InferenceSampleElement extends LitElement {
  static override styles = [commonStyles, inferenceSetStyles];

  @property({ type: Object })
  inference?: Inferences.Inference<Inferences.Pending>;

  @property({ type: Number })
  totalSamples: number = 1;

  @property({ type: Boolean })
  isExpanded: boolean = false;

  @property({ type: String })
  activeTab: "yaml" | "json" | "text" = "yaml";

  @state()
  private isCopied: boolean = false;

  private onToggleExpand(): void {
    this.dispatchEvent(
      new CustomEvent("toggle-expand", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onTabChange(tab: "yaml" | "json" | "text"): void {
    this.activeTab = tab;
  }

  private async onCopy(text: string): Promise<void> {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        this.isCopied = true;
        setTimeout(() => {
          this.isCopied = false;
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  override render(): TemplateResult {
    if (!this.inference) {
      return html``;
    }

    const { sampleIndex, name, note, request, result } = this.inference;
    const isSuccess = result.kind === "success";
    const isPending = result.kind === "pending";
    const cardId = `sample-${sampleIndex}`;
    const statusClass = isSuccess ? "success" : isPending ? "pending" : "error";
    const statusLabel = isSuccess
      ? "Success"
      : isPending
        ? "Pending"
        : result.error.kind;
    const displayName =
      name ?? `Anonymous ${sampleIndex + 1}/${this.totalSamples}`;

    return html`
      <article class="inference-card ${this.isExpanded ? "is-expanded" : ""}">
        <button
          type="button"
          class="card-header-bar"
          @click=${this.onToggleExpand}
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
              this.activeTab,
              (tab) => this.onTabChange(tab),
              (text) => void this.onCopy(text),
              this.isCopied,
            )}
          </div>
        </div>
      </article>
    `;
  }
}
