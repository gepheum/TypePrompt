import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  css,
  html,
  LitElement,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("typeprompt-editor")
export class TypePromptEditor extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
      position: relative;
      background: #090c14;
    }

    #editor-container {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .cm-editor {
      height: 100%;
    }
  `;

  @property({ attribute: false })
  editorState?: EditorState;

  private view?: EditorView;

  override render(): TemplateResult {
    return html`<div id="editor-container"></div>`;
  }

  override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);

    if (changedProperties.has("editorState")) {
      const container = this.renderRoot.querySelector("#editor-container");
      if (!container) return;

      if (!this.view && this.editorState) {
        this.view = new EditorView({
          state: this.editorState,
          parent: container,
          root: this.renderRoot as ShadowRoot,
        });
      } else if (this.view && this.editorState) {
        if (this.view.state !== this.editorState) {
          if (this.view.state.doc.eq(this.editorState.doc)) {
            const currentSel = this.view.state.selection.main;
            const newSel = this.editorState.selection.main;
            if (
              currentSel.anchor !== newSel.anchor ||
              currentSel.head !== newSel.head
            ) {
              this.view.dispatch({
                selection: newSel,
                effects: EditorView.scrollIntoView(newSel.anchor, {
                  y: "center",
                }),
                userEvent: "select",
              });
            }
          } else {
            this.view.setState(this.editorState);
            this.view.dispatch({
              effects: EditorView.scrollIntoView(
                this.editorState.selection.main.anchor,
                { y: "center" },
              ),
            });
          }
        }
      }
    }
  }

  /**
   * Jumps the editor selection to the specified character offset and scrolls into view.
   */
  jumpToPosition(pos: number, head?: number): void {
    if (!this.view) return;
    const docLength = this.view.state.doc.length;
    const clampedAnchor = Math.max(0, Math.min(docLength, pos));
    const clampedHead =
      head !== undefined
        ? Math.max(0, Math.min(docLength, head))
        : clampedAnchor;

    this.view.dispatch({
      selection: { anchor: clampedAnchor, head: clampedHead },
      effects: EditorView.scrollIntoView(clampedAnchor, { y: "center" }),
      userEvent: "select",
    });
    this.view.focus();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.view) {
      this.view.destroy();
      this.view = undefined;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "typeprompt-editor": TypePromptEditor;
  }
}
