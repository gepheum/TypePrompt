import { css, html, LitElement, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { PlaygroundStore } from "../model/playground-store.js";
import { trpc } from "../trpc.js";
import "./step-template.js";
import "./stepper-nav.js";

export class PlayApp extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      background: #090c14;
      color: #f8fafc;
      overflow: hidden;
      font-family:
        "Inter",
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        sans-serif;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 12px 24px;
      background: #0f1422;
      border-bottom: 1px solid #232c45;
      flex-shrink: 0;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.35);
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      color: #818cf8;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .brand-title {
      font-size: 14px;
      font-weight: 700;
      color: #f8fafc;
      letter-spacing: -0.2px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .btn-sync {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 6px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid #6366f1;
      color: #c7d2fe;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-sync:hover {
      background: rgba(99, 102, 241, 0.28);
      color: #ffffff;
    }

    .main-workspace {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    .loading-state,
    .error-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: #94a3b8;
      padding: 32px;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(99, 102, 241, 0.2);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .error-card {
      background: #150f14;
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 24px;
      max-width: 480px;
      text-align: center;
    }

    .error-title {
      font-weight: 700;
      color: #ef4444;
      margin-bottom: 8px;
    }

    .btn-retry {
      margin-top: 12px;
      background: #6366f1;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-step {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }

    .btn-step.secondary {
      background: #151c2e;
      border-color: #232c45;
      color: #94a3b8;
    }

    .btn-step.secondary:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .btn-step.primary {
      background: #6366f1;
      color: white;
    }

    .btn-step.primary:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      background: #312e81;
    }
  `;

  private store = new PlaygroundStore();
  private unsubscribe?: () => void;

  @state()
  private error: string | null = null;

  @state()
  private loading = true;

  override connectedCallback(): void {
    super.connectedCallback();
    this.unsubscribe = this.store.on("change", () => {
      this.requestUpdate();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  override firstUpdated(): void {
    void this.fetchSources();
  }

  async fetchSources(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const response = await trpc.pullSources.query({
        lastTimestampMillis: null,
      });
      this.store.init(response);
      this.loading = false;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.loading = false;
    }
  }

  private handleStepSelect(e: CustomEvent<{ stepId: number }>): void {
    this.store.setStep(e.detail.stepId);
  }

  override render(): TemplateResult {
    const model = this.store.model;

    if (this.loading) {
      return html`
        <div class="loading-state">
          <div class="spinner"></div>
          <div>Connecting to backend & compiling workspace...</div>
        </div>
      `;
    }

    if (this.error || !model) {
      return html`
        <div class="error-state">
          <div class="error-card">
            <div class="error-title">Connection Error</div>
            <p>${this.error ?? "Failed to initialize workspace model."}</p>
            <button
              class="btn-retry"
              @click=${(): void => {
                void this.fetchSources();
              }}
            >
              Retry Connection
            </button>
          </div>
        </div>
      `;
    }

    const hasDiskChanges =
      model.latestPullSourcesResponse.timestampMillis !==
      model.pulledSources.response.timestampMillis;

    return html`
      <header>
        <div class="brand-group">
          <div class="brand-badge">⚡ TypePrompt</div>
          <div class="brand-title">Playground</div>
        </div>

        <stepper-nav
          .activeStep=${model.activeStep}
          @step-select=${this.handleStepSelect}
        ></stepper-nav>

        <div class="header-actions">
          ${
            hasDiskChanges
              ? html`
                  <button
                    class="btn-sync"
                    @click=${(): void => this.store.syncWithDisk()}
                    title="Files modified on disk. Click to refresh baseline."
                  >
                    ↻ Sync with Disk
                  </button>
                `
              : ""
          }
        </div>
      </header>

      <main class="main-workspace">
        ${
          model.activeStep === 1
            ? html`<step-template
                .model=${model}
                .store=${this.store}
              ></step-template>`
            : html`
                <div class="loading-state">
                  <div>Step ${model.activeStep} is not yet enabled.</div>
                  <button
                    class="btn-step secondary"
                    style="margin-top: 12px;"
                    @click=${(): void => this.store.setStep(1)}
                  >
                    ← Back to Step 1: Template
                  </button>
                </div>
              `
        }
      </main>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("play-app")) {
  customElements.define("play-app", PlayApp);
}
