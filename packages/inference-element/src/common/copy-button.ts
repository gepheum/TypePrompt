import { css, html, LitElement, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { registerCustomElement } from "./register-custom-element.js";
import { commonStyles } from "./styles.js";

const copyButtonStyles = css`
  :host {
    display: inline-block;
    background: transparent;
  }

  .btn-copy {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.72rem;
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    line-height: 1.2;
    box-sizing: border-box;
    font-family: inherit;
  }

  .btn-copy:hover {
    background: var(--bg-surface);
    color: var(--text);
  }

  .btn-copy.copied {
    background: var(--success-bg);
    border-color: var(--success-border);
    color: var(--success-text);
  }
`;

@registerCustomElement("tp-copy-button")
export class CopyButtonElement extends LitElement {
  static override styles = [commonStyles, copyButtonStyles];

  @property({ type: String })
  text = "";

  @state()
  private copied = false;

  private timeoutId?: ReturnType<typeof setTimeout>;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  private async copy(e: MouseEvent): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(this.text);
        this.copied = true;
        if (this.timeoutId) clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(() => {
          this.copied = false;
          this.timeoutId = undefined;
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  override render(): TemplateResult {
    return html`
      <button
        type="button"
        class="btn-copy ${this.copied ? "copied" : ""}"
        @click=${this.copy}
        title="Copy to clipboard"
      >
        ${this.copied ? "Copied!" : "Copy"}
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tp-copy-button": CopyButtonElement;
  }
}
