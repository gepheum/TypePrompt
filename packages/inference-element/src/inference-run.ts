import type { Inferences } from "@typeprompt/core";
import { html, LitElement, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { createNanoEvents } from "nanoevents";
import YAML from "yaml";
import "./common/code.js";
import "./common/copy-button.js";
import {
  formatTimestamp,
  stringifyAsJson,
  stringifyAsYaml,
} from "./common/formatters.js";
import { registerCustomElement } from "./common/register-custom-element.js";
import { commonStyles } from "./common/styles.js";
import "./inference-run/sample-inference-card.js";
import { SampleInferenceCard } from "./inference-run/sample-inference-card.js";
import { inferenceRunStyles } from "./inference-run/styles.js";

export interface InferenceRunEvents {
  saveRun: (payload: {
    data: Inferences.InferenceRun;
    format: "json" | "yaml";
  }) => void;
}

export const inferenceRunEvents = createNanoEvents<InferenceRunEvents>();

@registerCustomElement("tp-inference-run")
export class InferenceRunElement extends LitElement {
  static override styles = [commonStyles, inferenceRunStyles];

  private _inferenceRun?: Inferences.InferenceRun<Inferences.Pending>;

  @property({ attribute: false })
  get inferenceRun(): Inferences.InferenceRun<Inferences.Pending> | undefined {
    return this._inferenceRun;
  }

  set inferenceRun(
    val: Inferences.InferenceRun<Inferences.Pending> | undefined,
  ) {
    const oldVal = this._inferenceRun;
    this._inferenceRun = val;
    this.handleInferenceRunChange();
    this.requestUpdate("inferenceRun", oldVal);
  }

  @state()
  private statusFilter: "all" | "success" | "error" | "pending" = "all";

  @state()
  private progressBarStatus: "hidden" | "visible" | "collapsing" = "hidden";

  @state()
  private dataTab: "yaml" | "json" = "yaml";

  private collapseTimeoutId?: ReturnType<typeof setTimeout>;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.collapseTimeoutId) {
      clearTimeout(this.collapseTimeoutId);
      this.collapseTimeoutId = undefined;
    }
  }

  private handleInferenceRunChange(): void {
    if (!this.inferenceRun) {
      this.progressBarStatus = "hidden";
      return;
    }

    const pendingCount = this.inferenceRun.samples.filter(
      (i) => i.result.kind === "pending",
    ).length;

    if (pendingCount > 0) {
      if (this.collapseTimeoutId) {
        clearTimeout(this.collapseTimeoutId);
        this.collapseTimeoutId = undefined;
      }
      this.progressBarStatus = "visible";
    } else if (this.progressBarStatus === "visible") {
      if (!this.collapseTimeoutId) {
        this.collapseTimeoutId = setTimeout(() => {
          this.progressBarStatus = "collapsing";
          this.collapseTimeoutId = setTimeout(() => {
            this.progressBarStatus = "hidden";
            this.collapseTimeoutId = undefined;
          }, 350);
        }, 400);
      }
    }
  }

  private toggleAll(expanded: boolean): void {
    const cards = this.renderRoot.querySelectorAll("tp-sample-inference-card");
    for (const card of cards) {
      if (card instanceof SampleInferenceCard) {
        card.expanded = expanded;
      }
    }
  }

  private setStatusFilter(
    filter: "all" | "success" | "error" | "pending",
  ): void {
    this.statusFilter = filter;
  }

  private handleSaveRunClick(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    if (this._inferenceRun) {
      inferenceRunEvents.emit("saveRun", {
        data: this._inferenceRun as Inferences.InferenceRun,
        format: this.dataTab,
      });
    }
  }

  override render(): TemplateResult {
    const data = this.inferenceRun;
    if (!data) {
      return html`
        <div class="container">
          <div class="empty-state">
            <p>No inferences to display.</p>
          </div>
        </div>
      `;
    }

    const modelYaml = data.model ? YAML.stringify(data.model).trimEnd() : "";
    const displayTemplateId = data.templateId.startsWith("Main:")
      ? data.templateId.slice("Main:".length)
      : data.templateId;

    const sourceFiles = Object.entries(data.sourceFiles ?? {})
      .filter(([, file]) => {
        const { kind } = file;
        return kind === "template" || kind === "tool" || kind === "playground";
      })
      .sort(([a], [b]) => a.localeCompare(b));

    const totalCount = data.samples.length;
    const successCount = data.samples.filter(
      (i) => i.result.kind === "output" || i.result.kind === "tool-calls",
    ).length;
    const errorCount = data.samples.filter(
      (i) => i.result.kind === "error",
    ).length;
    const pendingCount = data.samples.filter(
      (i) => i.result.kind === "pending",
    ).length;

    const completedCount = successCount + errorCount;
    const completionPct =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const successPct = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
    const errorPct = totalCount > 0 ? (errorCount / totalCount) * 100 : 0;
    const pendingPct = totalCount > 0 ? (pendingCount / totalCount) * 100 : 0;

    const allCompleted = pendingCount === 0;
    const runYaml = allCompleted ? stringifyAsYaml(data) : "";
    const runJson = allCompleted ? stringifyAsJson(data) : "";
    const activeDataContent = this.dataTab === "yaml" ? runYaml : runJson;

    const filteredInferences = data.samples.filter((inf) => {
      if (this.statusFilter === "all") return true;
      if (this.statusFilter === "success") {
        return inf.result.kind === "output" || inf.result.kind === "tool-calls";
      }
      return inf.result.kind === this.statusFilter;
    });

    const sampleCountText = `${totalCount} sample${totalCount !== 1 ? "s" : ""}`;

    return html`
      <div class="container">
        <!-- Header -->
        <header>
          <div class="header-top">
            <div class="title-group">
              <h1>
                <span>${displayTemplateId}</span>
              </h1>
              <div class="subtitle">Inference run · ${sampleCountText}</div>
              <div class="run-metadata">
                ${formatTimestamp(data.isoTimestamp)} · ID: ${data.id}
              </div>
            </div>

            <!-- Model YAML block -->
            ${
              modelYaml
                ? html`
                    <div class="model-yaml-card">
                      <tp-code
                        class="model-yaml-body"
                        .code=${modelYaml}
                        language="yaml"
                      ></tp-code>
                    </div>
                  `
                : ""
            }
          </div>
        </header>

        <!-- Progress Bar (shown while pending, then smoothly collapses on completion) -->
        ${
          this.progressBarStatus !== "hidden"
            ? html`
                <div
                  class="progress-section-wrapper ${this.progressBarStatus === "collapsing" ? "is-collapsing" : ""}"
                >
                  <div class="progress-section-wrapper-inner">
                    <div class="progress-section">
                      <div class="progress-header">
                        <div class="progress-status-counts">
                          <span class="progress-count-item">
                            <span class="status-dot success"></span>
                            ${successCount} passed
                          </span>
                          ${
                            errorCount > 0
                              ? html`
                                  <span class="progress-count-item">
                                    <span class="status-dot error"></span>
                                    ${errorCount} failed
                                  </span>
                                `
                              : ""
                          }
                          ${
                            pendingCount > 0
                              ? html`
                                  <span class="progress-count-item">
                                    <span class="status-dot pending"></span>
                                    ${pendingCount} pending
                                  </span>
                                `
                              : ""
                          }
                        </div>
                        <span>${completionPct}% complete</span>
                      </div>
                      <div class="progress-bar-track">
                        <div
                          class="progress-bar-fill success"
                          style="width: ${successPct}%"
                        ></div>
                        <div
                          class="progress-bar-fill error"
                          style="width: ${errorPct}%"
                        ></div>
                        <div
                          class="progress-bar-fill pending"
                          style="width: ${pendingPct}%"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              `
            : ""
        }

        <!-- Samples Toolbar -->
        <div class="samples-toolbar">
          <div class="toolbar-left">
            <div class="samples-count">
              ${data.samples.length}
              sample${data.samples.length !== 1 ? "s" : ""}
            </div>
            <div class="filter-group" role="tablist">
              <button
                type="button"
                class="btn-filter ${this.statusFilter === "all" ? "active" : ""}"
                @click=${(): void => this.setStatusFilter("all")}
              >
                All (${totalCount})
              </button>
              <button
                type="button"
                class="btn-filter success ${this.statusFilter === "success" ? "active" : ""}"
                @click=${(): void => this.setStatusFilter("success")}
              >
                Passed (${successCount})
              </button>
              ${
                errorCount > 0
                  ? html`
                      <button
                        type="button"
                        class="btn-filter error ${this.statusFilter === "error" ? "active" : ""}"
                        @click=${(): void => this.setStatusFilter("error")}
                      >
                        Failed (${errorCount})
                      </button>
                    `
                  : ""
              }
              ${
                pendingCount > 0
                  ? html`
                      <button
                        type="button"
                        class="btn-filter pending ${this.statusFilter === "pending" ? "active" : ""}"
                        @click=${(): void => this.setStatusFilter("pending")}
                      >
                        Pending (${pendingCount})
                      </button>
                    `
                  : ""
              }
            </div>
          </div>
          <div class="toolbar-actions">
            <button
              type="button"
              class="btn-action"
              @click=${(): void => this.toggleAll(true)}
            >
              Expand all
            </button>
            <button
              type="button"
              class="btn-action"
              @click=${(): void => this.toggleAll(false)}
            >
              Collapse all
            </button>
          </div>
        </div>

        <!-- Inferences List -->
        <main class="inferences-section">
          ${
            filteredInferences.length === 0
              ? html`
                  <div class="empty-filter-state">
                    No samples matching filter "${this.statusFilter}".
                  </div>
                `
              : filteredInferences.map(
                  (inf) => html`
                    <tp-sample-inference-card
                      .inference=${inf}
                      .totalSamples=${data.samples.length}
                      .expanded=${
                        data.samples.length === 1 ||
                        (this.statusFilter === "error" &&
                          inf.result.kind === "error")
                      }
                    ></tp-sample-inference-card>
                  `,
                )
          }
        </main>

        <!-- Source Files Section -->
        ${
          sourceFiles.length > 0
            ? html`
                <div class="source-files-section">
                  <details>
                    <summary>Source files (${sourceFiles.length})</summary>
                    <div class="details-body source-files-list">
                      ${sourceFiles.map(
                        ([filePath, file]) => html`
                          <details class="source-file-item">
                            <summary class="source-file-header">
                              <span class="source-file-path">${filePath}</span>
                              <tp-copy-button
                                .text=${file.content}
                              ></tp-copy-button>
                            </summary>
                            <tp-code
                              .code=${file.content}
                              language="tp"
                            ></tp-code>
                          </details>
                        `,
                      )}
                    </div>
                  </details>
                </div>
              `
            : ""
        }

        <!-- Inference Data Section (rendered once all inferences have completed) -->
        ${
          allCompleted
            ? html`
                <div class="run-data-section">
                  <details>
                    <summary>Raw inference data</summary>
                    <div class="details-body run-data-body">
                      <div class="output-card">
                        <div class="output-card-header">
                          <div class="output-tabs">
                            <button
                              type="button"
                              class="output-tab-btn ${
                                this.dataTab === "yaml" ? "is-active" : ""
                              }"
                              @click=${(): void => {
                                this.dataTab = "yaml";
                              }}
                            >
                              YAML
                            </button>
                            <button
                              type="button"
                              class="output-tab-btn ${
                                this.dataTab === "json" ? "is-active" : ""
                              }"
                              @click=${(): void => {
                                this.dataTab = "json";
                              }}
                            >
                              JSON
                            </button>
                          </div>
                          <div class="output-card-actions">
                            <button
                              type="button"
                              class="btn-save-data"
                              title="Save to disk"
                              @click=${this.handleSaveRunClick}
                            >
                              Save to disk
                            </button>
                            <tp-copy-button
                              .text=${activeDataContent}
                            ></tp-copy-button>
                          </div>
                        </div>
                        <tp-code
                          class="output-code-view"
                          .code=${activeDataContent}
                          .language=${this.dataTab}
                        ></tp-code>
                      </div>
                    </div>
                  </details>
                </div>
              `
            : ""
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tp-inference-run": InferenceRunElement;
  }
}
