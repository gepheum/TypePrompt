import type { TemplateResult } from "lit";
import { html, LitElement } from "lit";
import { trpc } from "./trpc.js";

export class PlayApp extends LitElement {
  override render(): TemplateResult {
    return html`<h1>Hello World</h1>`;
  }
}

customElements.define("play-app", PlayApp);
export { trpc };
