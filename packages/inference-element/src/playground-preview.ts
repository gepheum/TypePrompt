import type { Lsp } from "@typeprompt/core";
import { html, LitElement, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { createNanoEvents } from "nanoevents";
import YAML from "yaml";
import "./common/code.js";
import { registerCustomElement } from "./common/register-custom-element.js";
import { renderRequestContext } from "./common/render-request-context.js";
import { commonStyles } from "./common/styles.js";
import { playgroundPreviewStyles } from "./playground-preview/styles.js";

export interface PlaygroundPreviewEvents {
  createSecrets: () => void;
  runInference: () => void;
  selectSample: (key: string, index: number) => void;
}

export const playgroundPreviewEvents =
  createNanoEvents<PlaygroundPreviewEvents>();

@registerCustomElement("tp-playground-preview")
export class PlaygroundPreviewElement extends LitElement {
  static override styles = [commonStyles, playgroundPreviewStyles];

  @state()
  private projectData?: {
    readonly wireProject: Lsp.WireProject;
    readonly templateId: string;
  };

  @state()
  private anyErrors = false;

  @state()
  private selectedIndex = 0;

  setProjectData(wireProject: Lsp.WireProject, templateId: string): void {
    if (this.projectData && this.projectData.templateId !== templateId) {
      this.projectData = undefined;
    }
    const { compilationResult } = wireProject;
    const playground = compilationResult.playgrounds[templateId];
    const isPlaygroundValid = playground?.isValid === true;
    const hasErrors =
      Boolean(compilationResult.anyErrors) || !isPlaygroundValid;

    this.anyErrors = hasErrors;
    if (!hasErrors) {
      this.projectData = { wireProject, templateId };
    }
  }

  private handleCreateSecretsClick(e: Event): void {
    e.preventDefault();
    playgroundPreviewEvents.emit("createSecrets");
  }

  private handleRunInferenceClick(): void {
    playgroundPreviewEvents.emit("runInference");
  }

  private selectSample(
    idx: number,
    samples: readonly Lsp.WirePlaygroundSample[],
  ): void {
    this.selectedIndex = idx;
    const s = samples[idx];
    const key = s?.name ? `name:${s.name}` : `index:${idx}`;
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
    if (!this.projectData) {
      return html`
        <div class="container">
          <div class="sticky-header">
            <header class="preview-header">
              <div class="header-top">
                <div class="title-group">
                  <h1><span>Playground</span></h1>
                  <div class="subtitle">Playground Preview</div>
                </div>
              </div>
            </header>
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
          ${
            this.anyErrors
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

    const { wireProject, templateId } = this.projectData;
    const playground = wireProject.compilationResult.playgrounds[templateId];

    const rawSecrets = wireProject.secrets;
    const apiKeys =
      rawSecrets && rawSecrets.kind === "success" && rawSecrets.secrets.apiKeys
        ? rawSecrets.secrets.apiKeys
        : {};
    const hasApiKeys = Object.keys(apiKeys).length > 0;

    const modelYaml = playground?.model
      ? YAML.stringify(playground.model).trimEnd()
      : "";

    const rawId = playground?.forTemplate ?? playground?.id ?? templateId;
    const displayTemplateId = rawId
      ? rawId.startsWith("Main:")
        ? rawId.slice("Main:".length)
        : rawId
      : "Playground";

    const rawSamples = playground?.samples ?? [];
    const samples = rawSamples as readonly Lsp.WirePlaygroundSample[];

    // Ensure selectedIndex is clamped
    const activeIndex =
      this.selectedIndex >= 0 && this.selectedIndex < samples.length
        ? this.selectedIndex
        : 0;
    const activeSample = samples[activeIndex];

    const subtitleText = `Playground Preview · ${samples.length} sample${samples.length !== 1 ? "s" : ""}`;

    return html`
      <div class="container">
        <div class="sticky-header">
          <!-- Top Section: Title, Subtitle, Action button, and Model YAML -->
          <header class="preview-header">
            <div class="header-top">
              <div class="title-group">
                <h1><span>${displayTemplateId}</span></h1>
                <div class="subtitle">${subtitleText}</div>
                ${
                  hasApiKeys
                    ? html`
                        <div class="header-actions">
                          <button
                            type="button"
                            class="run-inference-button"
                            title="Run inference across all samples"
                            @click=${this.handleRunInferenceClick}
                          >
                            <span class="run-icon">▶</span> Run Inference
                          </button>
                        </div>
                      `
                    : ""
                }
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
                    : ""
                }
              </div>

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
                            <option
                              value="${idx}"
                              ?selected=${idx === activeIndex}
                            >
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
                  <p class="empty-state-subtext">
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
          this.anyErrors
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
