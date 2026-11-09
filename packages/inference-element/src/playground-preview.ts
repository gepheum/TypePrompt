import { DEFAULT_NAMESPACE, type Lsp } from "@typeprompt/core";
import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { createNanoEvents } from "nanoevents";
import YAML from "yaml";
import { renderRequestContext } from "./common/render-request-context.js";
import { commonStyles } from "./common/styles.js";
import { highlightYaml } from "./common/token-highlighting.js";

export interface PlaygroundPreviewEvents {
  createSecrets: () => void;
  runInferences: () => void;
  selectSample: (key: string, index: number) => void;
}

export const playgroundPreviewEvents =
  createNanoEvents<PlaygroundPreviewEvents>();

const playgroundPreviewStyles = css`
  .container {
    max-width: 900px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    position: relative;
  }

  .no-api-keys-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: rgba(234, 179, 8, 0.1);
    border: 1px solid var(--pending-border);
    border-radius: 8px;
    padding: 0.85rem 1.15rem;
  }

  .no-api-keys-icon {
    font-size: 1.25rem;
  }

  .no-api-keys-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    font-size: 0.86rem;
  }

  .no-api-keys-text {
    color: var(--text);
  }

  .create-secrets-link {
    color: var(--border-focus);
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }

  .create-secrets-link:hover {
    text-decoration: underline;
  }

  .run-inferences-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .run-inferences-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--button-bg);
    color: var(--button-fg);
    border: none;
    border-radius: 6px;
    padding: 0.55rem 1.15rem;
    font-size: 0.88rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: background 0.15s ease;
  }

  .run-inferences-button:hover {
    background: var(--button-hover);
  }

  .run-icon {
    font-size: 0.75rem;
  }

  .model-yaml-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.45rem 0.75rem;
  }

  .model-yaml-body {
    font-size: 0.76rem;
    line-height: 1.35;
    margin: 0;
    font-family: var(--font-mono);
  }

  .sticky-header {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg);
    padding: 1rem 1.25rem 0.85rem;
    margin: -1rem -1.25rem 0;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .sample-picker-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .sample-picker-label {
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .sample-segmented-control {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 3px;
    overflow-x: auto;
    width: fit-content;
    max-width: 100%;
  }

  .sample-segment-btn {
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.82rem;
    font-weight: 500;
    font-family: inherit;
    padding: 0.35rem 0.75rem;
    border-radius: 5px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .sample-segment-btn:hover {
    color: var(--text);
    background: var(--bg-hover);
  }

  .sample-segment-btn.active {
    background: var(--bg);
    color: var(--text);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .sample-select {
    width: auto;
    max-width: 100%;
    background: var(--dropdown-bg);
    color: var(--dropdown-fg);
    border: 1px solid var(--dropdown-border);
    border-radius: 6px;
    padding: 0.45rem 0.75rem;
    font-size: 0.84rem;
    font-family: inherit;
    outline: none;
    cursor: pointer;
  }

  .sample-select:focus {
    border-color: var(--border-focus);
  }

  .sample-discussion-view {
    background: var(--bg);
  }

  .empty-state {
    text-align: center;
    padding: 3rem 1.5rem;
    color: var(--text-muted);
    font-size: 0.9rem;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .empty-discussion {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--text-muted);
    font-size: 0.85rem;
    background: var(--bg-surface);
    border: 1px dashed var(--border);
    border-radius: 6px;
  }

  .compilation-error-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(11, 15, 25, 0.45);
    z-index: 99999;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 1.5rem;
    pointer-events: none;
  }

  .error-banner {
    pointer-events: auto;
    background: var(--error-bg);
    border: 1px solid var(--error-border);
    color: var(--error-text);
    border-radius: 8px;
    padding: 0.65rem 1.25rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.88rem;
    font-weight: 600;
  }
`;

@customElement("tp-playground-preview")
export class PlaygroundPreviewElement extends LitElement {
  static override styles = [commonStyles, playgroundPreviewStyles];

  @property({ type: Object })
  wireProject?: Lsp.WireProject;

  @property({ type: String })
  relativePath?: string;

  @property({ type: String })
  filePath?: string;

  @property({ type: String })
  templateId?: string;

  @state()
  private selectedIndex = 0;

  @state()
  private selectedKey?: string;

  private getResolvedPlayground(): {
    playground?: Lsp.WirePlayground;
    hasErrors: boolean;
  } {
    if (!this.wireProject) {
      return { hasErrors: false };
    }

    const { compilationResult } = this.wireProject;
    let targetTemplateId = this.templateId;

    if (!targetTemplateId) {
      const relPath = this.relativePath || this.filePath;
      if (relPath) {
        const sourceFile =
          compilationResult.sourceFiles[relPath] ??
          Object.values(compilationResult.sourceFiles).find(
            (sf) =>
              sf.path === relPath ||
              relPath.endsWith(`/${sf.path}`) ||
              (sf.path && relPath.endsWith(sf.path)),
          );

        if (sourceFile?.entity?.kind === "playground") {
          const ns = sourceFile.entity.namespace ?? DEFAULT_NAMESPACE;
          targetTemplateId = `${ns}:${sourceFile.entity.forTemplate}`;
        } else if (sourceFile?.entity?.kind === "template") {
          const ns = sourceFile.entity.namespace ?? DEFAULT_NAMESPACE;
          targetTemplateId = `${ns}:${sourceFile.entity.name}`;
        }
      }
    }

    let playground: Lsp.WirePlayground | undefined;
    if (targetTemplateId) {
      playground = compilationResult.playgrounds[targetTemplateId];
    }

    if (!playground) {
      playground = Object.values(compilationResult.playgrounds)[0];
    }

    const isPlaygroundValid = playground?.isValid === true;
    const hasErrors =
      Boolean(compilationResult.anyErrors) || !isPlaygroundValid;

    return { playground, hasErrors };
  }

  private handleCreateSecretsClick(e: Event): void {
    e.preventDefault();
    playgroundPreviewEvents.emit("createSecrets");
  }

  private handleRunInferencesClick(): void {
    playgroundPreviewEvents.emit("runInferences");
  }

  private selectSample(
    idx: number,
    samples: readonly Lsp.WirePlaygroundSample[],
  ): void {
    this.selectedIndex = idx;
    const s = samples[idx];
    const key = s?.name ? `name:${s.name}` : `index:${idx}`;
    this.selectedKey = key;
    playgroundPreviewEvents.emit("selectSample", key, idx);
  }

  private handleSampleChange(
    e: Event,
    samples: readonly Lsp.WirePlaygroundSample[],
  ): void {
    const select = e.target as HTMLSelectElement;
    const idx = Number(select.value);
    this.selectSample(idx, samples);
  }

  override render(): TemplateResult {
    if (!this.wireProject) {
      return html`
        <div class="container">
          <div class="sticky-header">
            <div class="sample-picker-bar">
              <label class="sample-picker-label">Sample</label>
              <select class="sample-select" disabled>
                <option>Loading samples...</option>
              </select>
            </div>
          </div>
          <div class="empty-state">
            <p>Loading playground preview...</p>
          </div>
        </div>
      `;
    }

    const { playground, hasErrors } = this.getResolvedPlayground();

    const rawSecrets = this.wireProject.secrets;
    const apiKeys =
      rawSecrets && rawSecrets.kind === "success" && rawSecrets.secrets.apiKeys
        ? rawSecrets.secrets.apiKeys
        : {};
    const hasApiKeys = Object.keys(apiKeys).length > 0;

    const modelYaml = playground?.model
      ? YAML.stringify(playground.model).trimEnd()
      : "";

    const rawSamples = playground?.samples ?? [];
    const samples = rawSamples as readonly Lsp.WirePlaygroundSample[];

    // Ensure selectedIndex is clamped
    const activeIndex =
      this.selectedIndex >= 0 && this.selectedIndex < samples.length
        ? this.selectedIndex
        : 0;
    const activeSample = samples[activeIndex];

    return html`
      <div class="container">
        <div class="sticky-header">
          <!-- Top Section: API Keys banner or Run Inferences button -->
          ${
            !hasApiKeys
              ? html`
                  <div class="no-api-keys-banner">
                    <span class="no-api-keys-icon">🔑</span>
                    <div class="no-api-keys-content">
                      <span class="no-api-keys-text"
                        >Inference cannot be run because no API key is
                        available.</span
                      >
                      <a
                        href="#"
                        class="create-secrets-link"
                        @click=${this.handleCreateSecretsClick}
                      >
                        Create .typeprompt.secrets.yaml
                      </a>
                    </div>
                  </div>
                `
              : html`
                  <div class="run-inferences-bar">
                    <button
                      type="button"
                      class="run-inferences-button"
                      title="Running Inferences"
                      @click=${this.handleRunInferencesClick}
                    >
                      <span class="run-icon">▶</span> Run Inferences
                    </button>
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
                `
          }

          <!-- Sample Picker -->
          ${
            samples.length === 0
              ? html`
                  <div class="sample-picker-bar">
                    <label class="sample-picker-label">Sample</label>
                    <select class="sample-select" disabled>
                      <option>No samples available</option>
                    </select>
                  </div>
                `
              : samples.length <= 4
                ? html`
                    <div class="sample-picker-bar">
                      <label class="sample-picker-label">Sample</label>
                      <div class="sample-segmented-control" role="tablist">
                        ${samples.map((s, idx) => {
                          const label = s.name ? s.name : `Sample ${idx + 1}`;
                          return html`
                            <button
                              type="button"
                              class="sample-segment-btn ${idx === activeIndex ? "active" : ""}"
                              role="tab"
                              aria-selected=${idx === activeIndex ? "true" : "false"}
                              @click=${(): void => this.selectSample(idx, samples)}
                            >
                              ${label}
                            </button>
                          `;
                        })}
                      </div>
                    </div>
                  `
                : html`
                    <div class="sample-picker-bar">
                      <label class="sample-picker-label">Sample</label>
                      <select
                        class="sample-select"
                        @change=${(e: Event): void => this.handleSampleChange(e, samples)}
                      >
                        ${samples.map((s, idx) => {
                          const label = s.name
                            ? s.name
                            : `Anonymous ${idx + 1}/${samples.length}`;
                          return html`
                            <option value="${idx}" ?selected=${idx === activeIndex}>
                              ${label}
                            </option>
                          `;
                        })}
                      </select>
                    </div>
                  `
          }
        </div>

        ${
          samples.length === 0
            ? html`
                <div class="empty-state">
                  <p>No samples found in this playground.</p>
                  <p
                    style="font-size: 0.8rem; margin-top: 0.35rem; opacity: 0.7;"
                  >
                    Add samples under &lt;samples&gt; to preview conversations.
                  </p>
                </div>
              `
            : html`
                <!-- Active Sample Discussion View -->
                <div class="sample-discussion-view">
                  ${
                    activeSample?.note
                      ? html`
                          <div class="sample-note-card">
                            <div class="sample-note-header">Note</div>
                            <div class="sample-note-body">
                              ${activeSample.note}
                            </div>
                          </div>
                        `
                      : ""
                  }
                  ${
                    activeSample?.request
                      ? renderRequestContext(activeSample.request)
                      : html`<div class="empty-discussion">
                          No conversation preview available for this sample.
                        </div>`
                  }
                </div>
              `
        }

        <!-- Error Overlay when there are compilation errors -->
        ${
          hasErrors
            ? html`
                <div class="compilation-error-overlay">
                  <div class="error-banner">
                    <span class="error-banner-icon">⚠️</span>
                    <span class="error-banner-text"
                      >Address the TypePrompt errors</span
                    >
                  </div>
                </div>
              `
            : ""
        }
      </div>
    `;
  }
}
