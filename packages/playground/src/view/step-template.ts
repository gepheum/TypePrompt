import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
  getFilePathLabel,
  getTemplateGroupPaths,
  type Model,
} from "../model/model.js";
import type { PlaygroundStore } from "../model/playground-store.js";
import "./typeprompt-editor.js";

@customElement("step-template")
export class StepTemplate extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      overflow: hidden;
      background: #090c14;
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 20px;
      background: #0f1422;
      border-bottom: 1px solid #232c45;
      flex-shrink: 0;
    }

    .combos-area {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .combo-block {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .combo-label {
      font-size: 12px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .select-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    select {
      appearance: none;
      background: #151c2e;
      border: 1px solid #283554;
      border-radius: 6px;
      color: #f8fafc;
      font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      padding: 6px 32px 6px 12px;
      cursor: pointer;
      outline: none;
      transition: all 0.15s ease;
      min-width: 180px;
    }

    select:hover {
      border-color: #435480;
      background: #192237;
    }

    select:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
    }

    .select-chevron {
      position: absolute;
      right: 10px;
      pointer-events: none;
      color: #64748b;
      font-size: 11px;
    }

    .combo-arrow {
      color: #475569;
      font-size: 14px;
      user-select: none;
    }

    .status-area {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .btn-revert {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
    }

    .btn-revert:hover {
      background: rgba(239, 68, 68, 0.2);
      border-color: #ef4444;
      color: #ffffff;
    }

    .pill-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
    }

    .pill-status.success {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }

    .pill-status.error {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }

    .pill-status.success .dot {
      background: #10b981;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
    }

    .pill-status.error .dot {
      background: #ef4444;
      box-shadow: 0 0 6px rgba(239, 68, 68, 0.8);
    }

    .editor-wrapper {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }
  `;

  @property({ attribute: false })
  model!: Model;

  @property({ attribute: false })
  store!: PlaygroundStore;

  private handleTemplateSelect(e: Event): void {
    const select = e.target as HTMLSelectElement;
    this.store.selectTemplate(select.value);
  }

  private handleFileSelect(e: Event): void {
    const select = e.target as HTMLSelectElement;
    this.store.selectFile(select.value);
  }

  private handleRevertClick(): void {
    this.store.revertFile(this.model.selectedFilePath);
  }

  override render(): TemplateResult {
    const { model } = this;
    const templateGroups = model.pulledSources.templateGroups;

    // Sort templates alphabetically by templatePath
    const sortedTemplatePaths = Object.keys(templateGroups).sort((a, b) =>
      a.localeCompare(b),
    );

    const currentGroup =
      templateGroups[model.selectedTemplatePath] ??
      (sortedTemplatePaths[0]
        ? templateGroups[sortedTemplatePaths[0]]
        : undefined);

    const groupPaths = currentGroup ? getTemplateGroupPaths(currentGroup) : [];

    const activeEditedSource = model.editedSources[model.selectedFilePath];
    const isEdited = Boolean(activeEditedSource?.edited);

    const hasAnyErrors = model.compilationResult.anyErrors;

    return html`
      <div class="toolbar">
        <div class="combos-area">
          <div class="combo-block">
            <span class="combo-label">Template:</span>
            <div class="select-wrap">
              <select
                aria-label="Select Template"
                @change=${this.handleTemplateSelect}
              >
                ${sortedTemplatePaths.map(
                  (path) => html`
                    <option
                      value=${path}
                      ?selected=${path === model.selectedTemplatePath}
                    >
                      ${path}
                    </option>
                  `,
                )}
              </select>
              <span class="select-chevron">▼</span>
            </div>
          </div>

          <span class="combo-arrow">→</span>

          <div class="combo-block">
            <span class="combo-label">File:</span>
            <div class="select-wrap">
              <select
                aria-label="Select File in Template Group"
                @change=${this.handleFileSelect}
              >
                ${groupPaths.map((path) => {
                  const label = currentGroup
                    ? getFilePathLabel(path, currentGroup)
                    : path;
                  const fileEdited = Boolean(model.editedSources[path]?.edited);
                  return html`
                    <option
                      value=${path}
                      ?selected=${path === model.selectedFilePath}
                    >
                      ${fileEdited ? `● ${label} (modified)` : label}
                    </option>
                  `;
                })}
              </select>
              <span class="select-chevron">▼</span>
            </div>
          </div>
        </div>

        <div class="status-area">
          ${
            isEdited
              ? html`
                  <button
                    class="btn-revert"
                    @click=${this.handleRevertClick}
                    title="Revert modifications to original disk content"
                  >
                    ↺ Revert
                  </button>
                `
              : ""
          }

          <div class="pill-status ${hasAnyErrors ? "error" : "success"}">
            <span class="dot"></span>
            <span>${hasAnyErrors ? "Errors detected" : "Valid"}</span>
          </div>
        </div>
      </div>

      <div class="editor-wrapper">
        <typeprompt-editor
          .editorState=${activeEditedSource?.editorState}
        ></typeprompt-editor>
      </div>
    `;
  }
}
