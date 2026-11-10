import type { Inferences } from "@typeprompt/core";
import { html, LitElement, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { createNanoEvents } from "nanoevents";
import YAML from "yaml";
import { formatTimestamp } from "./common/formatters.js";
import { registerCustomElement } from "./common/register-custom-element.js";
import { commonStyles } from "./common/styles.js";
import { highlightTp, highlightYaml } from "./common/token-highlighting.js";
import "./inference-run/inference-sample.js";
import { inferenceRunStyles } from "./inference-run/styles.js";

export { InferenceSampleElement } from "./inference-run/inference-sample.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InferenceRunEvents {}

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
  private expandedCardIds = new Set<string>();

  @state()
  private copiedCardId?: string;

  @state()
  private statusFilter: "all" | "success" | "error" | "pending" = "all";

  @state()
  private progressBarStatus: "hidden" | "visible" | "collapsing" = "hidden";

  private collapseTimeoutId?: ReturnType<typeof setTimeout>;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.collapseTimeoutId) {
      clearTimeout(this.collapseTimeoutId);
      this.collapseTimeoutId = undefined;
    }
  }

  private handleInferenceRunChange(): void {
    if (!this._inferenceRun) {
      this.progressBarStatus = "hidden";
      return;
    }

    // Auto-expand if there is only 1 sample
    if (
      this._inferenceRun.inferences.length === 1 &&
      this.expandedCardIds.size === 0
    ) {
      this.expandedCardIds.add("sample-0");
    }

    const pendingCount = this._inferenceRun.inferences.filter(
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

  private toggleCard(cardId: string): void {
    const next = new Set(this.expandedCardIds);
    if (next.has(cardId)) {
      next.delete(cardId);
    } else {
      next.add(cardId);
    }
    this.expandedCardIds = next;
  }

  private toggleAll(
    expanded: boolean,
    currentInferences: readonly Inferences.SampleInference<Inferences.Pending>[],
  ): void {
    if (expanded) {
      const next = new Set(this.expandedCardIds);
      for (const inf of currentInferences) {
        next.add(`sample-${inf.sampleIndex}`);
      }
      this.expandedCardIds = next;
    } else {
      const next = new Set(this.expandedCardIds);
      for (const inf of currentInferences) {
        next.delete(`sample-${inf.sampleIndex}`);
      }
      this.expandedCardIds = next;
    }
  }

  private setStatusFilter(
    filter: "all" | "success" | "error" | "pending",
  ): void {
    this.statusFilter = filter;
    if (filter === "error" && this.inferenceRun) {
      // Auto-expand error samples when filtering to errors
      const errorIds = this.inferenceRun.inferences
        .filter((inf) => inf.result.kind === "error")
        .map((inf) => `sample-${inf.sampleIndex}`);
      this.expandedCardIds = new Set([...this.expandedCardIds, ...errorIds]);
    }
  }

  private async copyText(cardId: string, text: string): Promise<void> {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        this.copiedCardId = cardId;
        setTimeout(() => {
          if (this.copiedCardId === cardId) {
            this.copiedCardId = undefined;
          }
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
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

    const isMetaFile = (filePath: string): boolean =>
      filePath === "meta.tp" ||
      filePath.endsWith("/meta.tp") ||
      filePath.endsWith("\\meta.tp");

    const sourceFiles = Object.entries(data.templateFiles)
      .filter(([filePath]) => !isMetaFile(filePath))
      .sort(([a], [b]) => a.localeCompare(b));

    const totalCount = data.inferences.length;
    const successCount = data.inferences.filter(
      (i) => i.result.kind === "success",
    ).length;
    const errorCount = data.inferences.filter(
      (i) => i.result.kind === "error",
    ).length;
    const pendingCount = data.inferences.filter(
      (i) => i.result.kind === "pending",
    ).length;

    const completedCount = successCount + errorCount;
    const completionPct =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const successPct = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
    const errorPct = totalCount > 0 ? (errorCount / totalCount) * 100 : 0;
    const pendingPct = totalCount > 0 ? (pendingCount / totalCount) * 100 : 0;

    const filteredInferences = data.inferences.filter((inf) => {
      if (this.statusFilter === "all") return true;
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
              <div class="subtitle">Inference Run · ${sampleCountText}</div>
              <div class="run-metadata">
                ${formatTimestamp(data.isoTimestamp)} · ID: ${data.id}
              </div>
            </div>

            <!-- Model YAML block -->
            ${
              modelYaml
                ? html`
                    <div class="model-yaml-card">
                      <pre
                        class="model-yaml-body"
                      ><code>${unsafeHTML(highlightYaml(modelYaml))}</code></pre>
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
              ${data.inferences.length}
              sample${data.inferences.length !== 1 ? "s" : ""}
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
              @click=${(): void => this.toggleAll(true, filteredInferences)}
            >
              Expand all
            </button>
            <button
              type="button"
              class="btn-action"
              @click=${(): void => this.toggleAll(false, filteredInferences)}
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
              : filteredInferences.map((inf) => {
                  const cardId = `sample-${inf.sampleIndex}`;
                  const isExpanded = this.expandedCardIds.has(cardId);

                  return html`
                    <tp-inference-sample
                      .inference=${inf}
                      .totalSamples=${data.inferences.length}
                      .isExpanded=${isExpanded}
                      @toggle-expand=${(): void => this.toggleCard(cardId)}
                    ></tp-inference-sample>
                  `;
                })
          }
        </main>

        <!-- Source Files Section -->
        ${
          sourceFiles.length > 0
            ? html`
                <div class="source-files-section">
                  <details>
                    <summary>View source files (${sourceFiles.length})</summary>
                    <div
                      class="details-body"
                      style="display: flex; flex-direction: column; gap: 0.65rem;"
                    >
                      ${sourceFiles.map(
                        ([filePath, content]) => html`
                          <details class="source-file-item">
                            <summary class="source-file-header">
                              <span
                                style="font-family: var(--font-mono); font-size: 0.82rem; font-weight: 600;"
                                >${filePath}</span
                              >
                              <button
                                type="button"
                                class="btn-copy ${
                                  this.copiedCardId === `file:${filePath}`
                                    ? "copied"
                                    : ""
                                }"
                                @click=${(e: MouseEvent): void => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void this.copyText(
                                    `file:${filePath}`,
                                    content,
                                  );
                                }}
                                title="Copy file contents to clipboard"
                              >
                                ${
                                  this.copiedCardId === `file:${filePath}`
                                    ? "Copied!"
                                    : "Copy"
                                }
                              </button>
                            </summary>
                            <pre
                              class="code-view is-active"
                              style="padding: 0.85rem 1rem; background: var(--bg-inset); margin: 0;"
                            ><code>${unsafeHTML(highlightTp(content))}</code></pre>
                          </details>
                        `,
                      )}
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
