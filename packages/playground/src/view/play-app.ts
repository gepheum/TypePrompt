import { css, html, LitElement, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import type { PullSourcesResponse } from "../contract.js";
import { trpc } from "../trpc.js";

export class PlayApp extends LitElement {
  static override styles = css`
    :host {
      display: block;
      font-family:
        ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
        "Liberation Mono", monospace;
      padding: 16px;
      color: #c9d1d9;
      background: #0d1117;
      min-height: 100vh;
      box-sizing: border-box;
    }

    code {
      display: block;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
    }
  `;

  @state()
  private sources: PullSourcesResponse | null = null;

  @state()
  private error: string | null = null;

  override firstUpdated(): void {
    void this.pullSources();
  }

  async pullSources(): Promise<void> {
    try {
      this.sources = await trpc.pullSources.query({
        lastTimestampMillis: null,
      });
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  override render(): TemplateResult {
    if (this.error) {
      return html`<code>Error: ${this.error}</code>`;
    }
    if (!this.sources) {
      return html`<code>Loading...</code>`;
    }
    return html`<code>${JSON.stringify(this.sources, null, 2)}</code>`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("play-app")) {
  customElements.define("play-app", PlayApp);
}
