import { DEFAULT_NAMESPACE } from "@typeprompt/core";
import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("prompt-viewer-app")
export class App extends LitElement {
  static override styles = css`
    :host {
      display: block;
      font-family:
        system-ui,
        -apple-system,
        sans-serif;
      padding: 24px;
      color: #333;
    }
    h1 {
      margin: 0 0 8px;
    }
    p {
      color: #666;
    }
  `;

  @property({ type: String })
  message = "Hello World";

  override render(): TemplateResult {
    // Reference DEFAULT_NAMESPACE to verify dependency on @typeprompt/core
    void DEFAULT_NAMESPACE;

    return html`
      <div>
        <h1>${this.message}</h1>
        <p>TypePrompt Viewer</p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "prompt-viewer-app": App;
  }
}
