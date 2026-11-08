import type { Inferences } from "@typeprompt/core";
import {
  html,
  LitElement,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { createNanoEvents } from "nanoevents";
import YAML from "yaml";
import { formatTimestamp } from "./common/formatters.js";
import { commonStyles } from "./common/styles.js";
import { highlightTp, highlightYaml } from "./common/token-highlighting.js";
import { renderInferenceCard } from "./inference-set/inference-card.js";
import { inferenceSetStyles } from "./inference-set/styles.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InferenceSetEvents {}

export const inferenceSetEvents = createNanoEvents<InferenceSetEvents>();

@customElement("inference-set")
export class InferenceSetElement extends LitElement {
  static override styles = [commonStyles, inferenceSetStyles];

  @property({
    type: Object,
    attribute: "data",
    converter: {
      fromAttribute(value: string | null) {
        if (!value) return undefined;
        try {
          return JSON.parse(value);
        } catch {
          return undefined;
        }
      },
      toAttribute(value: unknown) {
        return value ? JSON.stringify(value) : null;
      },
    },
  })
  inferenceSet?: Inferences.InferenceSet<Inferences.Pending>;

  @property({ type: String, attribute: "inference-set" })
  set rawInferenceSetAttribute(val: string | null) {
    if (!val) {
      this.inferenceSet = undefined;
      return;
    }
    try {
      this.inferenceSet = JSON.parse(val);
    } catch {
      // ignore
    }
  }

  get data(): Inferences.InferenceSet<Inferences.Pending> | undefined {
    return this.inferenceSet;
  }
  set data(val: Inferences.InferenceSet<Inferences.Pending> | undefined) {
    this.inferenceSet = val;
  }

  @state()
  private expandedCardIds = new Set<string>();

  @state()
  private activeTabs = new Map<string, "yaml" | "json" | "text">();

  @state()
  private copiedCardId?: string;

  override willUpdate(changedProps: PropertyValues): void {
    if (changedProps.has("inferenceSet") && this.inferenceSet) {
      // Auto-expand if there is only 1 sample
      if (
        this.inferenceSet.inferences.length === 1 &&
        this.expandedCardIds.size === 0
      ) {
        this.expandedCardIds.add("sample-0");
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

  private toggleAll(expanded: boolean): void {
    if (!this.inferenceSet) return;
    if (expanded) {
      this.expandedCardIds = new Set(
        this.inferenceSet.inferences.map((inf) => `sample-${inf.sampleIndex}`),
      );
    } else {
      this.expandedCardIds = new Set();
    }
  }

  private switchTab(cardId: string, tab: "yaml" | "json" | "text"): void {
    const next = new Map(this.activeTabs);
    next.set(cardId, tab);
    this.activeTabs = next;
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
    const data = this.inferenceSet;
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

    return html`
      <div class="container">
        <!-- Header -->
        <header>
          <div class="header-top">
            <div class="title-group">
              <h1>
                <span>${displayTemplateId}</span>
                <span class="badge-tag">playground</span>
              </h1>
              <div class="timestamp">
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

        <!-- Samples Toolbar -->
        <div class="samples-toolbar">
          <div class="samples-count">
            ${data.inferences.length}
            sample${data.inferences.length !== 1 ? "s" : ""}
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
          ${data.inferences.map((inf) => {
            const cardId = `sample-${inf.sampleIndex}`;
            const isExpanded = this.expandedCardIds.has(cardId);
            const activeTab = this.activeTabs.get(cardId) ?? "yaml";
            const isCopied = this.copiedCardId === cardId;

            return renderInferenceCard(
              inf,
              data.inferences.length,
              isExpanded,
              () => this.toggleCard(cardId),
              activeTab,
              (tab) => this.switchTab(cardId, tab),
              (text) => void this.copyText(cardId, text),
              isCopied,
            );
          })}
        </main>

        <!-- Source Files Section -->
        ${
          Object.keys(data.templateFiles).length > 0
            ? html`
                <div class="source-files-section">
                  <details>
                    <summary>
                      View source files
                      (${Object.keys(data.templateFiles).length})
                    </summary>
                    <div
                      class="details-body"
                      style="display: flex; flex-direction: column; gap: 0.65rem;"
                    >
                      ${Object.entries(data.templateFiles)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(
                          ([filePath, content]) => html`
                            <details class="source-file-item">
                              <summary class="source-file-header">
                                <span
                                  style="font-family: var(--font-mono); font-size: 0.82rem; font-weight: 600;"
                                  >${filePath}</span
                                >
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

        <footer>
          Generated with
          <a href="https://typeprompt.dev" target="_blank" rel="noopener"
            >TypePrompt</a
          >
        </footer>
      </div>
    `;
  }
}
