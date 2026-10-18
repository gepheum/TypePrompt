import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { bracketMatching, foldGutter } from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { githubDark, githubLight } from "@uiw/codemirror-themes-all";
import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
  getCompilationResult,
  typeprompt,
  type TypePromptConfig,
} from "./codemirror/index.js";

@customElement("code-mirror-editor")
export class Editor extends LitElement {
  static override styles = css`
    :host {
      display: block;
      height: 100%;
      position: relative;
    }

    #container {
      height: 100%;
      width: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .cm-editor {
      height: 100%;
      font-family:
        "JetBrains Mono", "Fira Code", Menlo, Monaco, "Courier New", monospace;
      font-size: 13.5px;
      line-height: 1.6;
    }

    .cm-scroller {
      overflow: auto;
      height: 100%;
    }
  `;

  @property({ type: String })
  content = "";

  @property({ type: String })
  path = "template.xml";

  @property({ type: Boolean })
  darkMode = true;

  private themeCompartment = new Compartment();
  private editorView?: EditorView;

  override render(): TemplateResult {
    return html`<div id="container"></div>`;
  }

  override firstUpdated(): void {
    const container = this.renderRoot.querySelector("#container");
    if (!container) return;

    const baseExtensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      bracketMatching(),
      foldGutter(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      this.themeCompartment.of(this.darkMode ? githubDark : githubLight),
      typeprompt({
        path: this.path,
        lint: true,
        autocomplete: true,
        highlight: true,
        autoCloseTags: true,
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newDoc = update.state.doc.toString();
          this.content = newDoc;
          const compilationResult = getCompilationResult(update.state);
          this.dispatchEvent(
            new CustomEvent("typeprompt-change", {
              detail: { doc: newDoc, compilationResult },
              bubbles: true,
              composed: true,
            }),
          );
        }
      }),
    ];

    const state = EditorState.create({
      doc: this.content,
      extensions: baseExtensions,
    });

    this.editorView = new EditorView({
      state,
      parent: container,
    });

    // Emit initial compilation result
    const initialCompilation = getCompilationResult(state);
    this.dispatchEvent(
      new CustomEvent("typeprompt-init", {
        detail: { doc: this.content, compilationResult: initialCompilation },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override updated(changedProperties: Map<string, unknown>): void {
    if (!this.editorView) return;

    if (changedProperties.has("darkMode")) {
      this.editorView.dispatch({
        effects: this.themeCompartment.reconfigure(
          this.darkMode ? githubDark : githubLight,
        ),
      });
    }

    if (changedProperties.has("content")) {
      const currentDoc = this.editorView.state.doc.toString();
      if (this.content !== currentDoc) {
        this.editorView.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: this.content },
        });
      }
    }
  }

  /**
   * Set editor text content directly and reset history.
   */
  setContent(newContent: string, newPath?: string): void {
    this.content = newContent;
    if (newPath) {
      this.path = newPath;
    }
    if (this.editorView) {
      const config: TypePromptConfig = {
        path: this.path,
        lint: true,
        autocomplete: true,
        highlight: true,
        autoCloseTags: true,
      };

      const newState = EditorState.create({
        doc: newContent,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          bracketMatching(),
          foldGutter(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          this.themeCompartment.of(this.darkMode ? githubDark : githubLight),
          typeprompt(config),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const doc = update.state.doc.toString();
              this.content = doc;
              const compilationResult = getCompilationResult(update.state);
              this.dispatchEvent(
                new CustomEvent("typeprompt-change", {
                  detail: { doc, compilationResult },
                  bubbles: true,
                  composed: true,
                }),
              );
            }
          }),
        ],
      });

      this.editorView.setState(newState);

      const compilationResult = getCompilationResult(newState);
      this.dispatchEvent(
        new CustomEvent("typeprompt-change", {
          detail: { doc: newContent, compilationResult },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  /**
   * Jump editor selection to a specific character offset.
   */
  jumpToPosition(pos: number): void {
    if (!this.editorView) return;
    const clampedPos = Math.max(
      0,
      Math.min(this.editorView.state.doc.length, pos),
    );
    this.editorView.dispatch({
      selection: { anchor: clampedPos },
      scrollIntoView: true,
    });
    this.editorView.focus();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.editorView?.destroy();
    this.editorView = undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "code-mirror-editor": Editor;
  }
}
