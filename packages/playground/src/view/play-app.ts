import { css, html, LitElement, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import {
  getFileRole,
  getRoleBadgeLabel,
  type Activity,
} from "../model/model.js";
import { PlaygroundStore } from "../model/playground-store.js";
import { trpc } from "../trpc.js";
import "./typeprompt-editor.js";

export class PlayApp extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      background: #090d16;
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

    /* Top Navigation Bar */
    header.topbar {
      height: 44px;
      background: #101625;
      border-bottom: 1px solid #1e2a42;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1rem;
      font-size: 0.85rem;
      user-select: none;
      flex-shrink: 0;
      z-index: 10;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-weight: 700;
      color: #e2e8f0;
      letter-spacing: -0.01em;
    }

    .brand-tag {
      font-size: 0.7rem;
      padding: 0.15rem 0.45rem;
      background: #1e293b;
      color: #38bdf8;
      border: 1px solid #2e3e5c;
      border-radius: 4px;
      font-weight: 600;
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .btn {
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.35rem 0.75rem;
      border-radius: 5px;
      border: 1px solid #1e2a42;
      background: #182236;
      color: #f8fafc;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.15s ease;
    }

    .btn:hover {
      background: #26334d;
      border-color: #3b4e72;
    }

    .btn-sync {
      background: rgba(56, 189, 248, 0.12);
      border-color: #38bdf8;
      color: #7dd3fc;
    }

    .btn-sync:hover {
      background: rgba(56, 189, 248, 0.25);
      color: #ffffff;
    }

    .btn-warning {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: #fca5a5;
    }

    .btn-warning:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: #ef4444;
      color: #ffffff;
    }

    /* Workbench Layout */
    .workbench {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    /* Activity Rail (Far Left 48px bar) */
    .activity-bar {
      width: 48px;
      background: #0a0e18;
      border-right: 1px solid #1e2a42;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0;
      user-select: none;
      flex-shrink: 0;
      z-index: 5;
    }

    .activity-top-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      width: 100%;
    }

    .activity-icon-btn {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: #64748b;
      cursor: pointer;
      position: relative;
      border-radius: 6px;
      transition: all 0.15s ease;
    }

    .activity-icon-btn:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.05);
    }

    .activity-icon-btn.active {
      color: #38bdf8;
    }

    .activity-icon-btn.active::before {
      content: "";
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 2.5px;
      background: #38bdf8;
      border-radius: 0 2px 2px 0;
    }

    .activity-badge-dot {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 6px #38bdf8;
    }

    /* Secondary Sidebar Panel */
    .sidebar-panel {
      width: 270px;
      min-width: 240px;
      background: #101625;
      border-right: 1px solid #1e2a42;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
    }

    .panel-header {
      padding: 0.65rem 0.85rem;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      background: #0d1320;
      border-bottom: 1px solid #141c2c;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    }

    .panel-count {
      font-size: 0.68rem;
      color: #64748b;
      font-weight: 600;
    }

    .tree-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0.35rem 0;
    }

    .tree-node {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.4rem 0.85rem;
      font-size: 0.82rem;
      cursor: pointer;
      user-select: none;
      color: #94a3b8;
      border-left: 2px solid transparent;
      transition: all 0.1s ease;
    }

    .tree-node:hover {
      background: rgba(255, 255, 255, 0.04);
      color: #f8fafc;
    }

    .tree-node.active {
      background: rgba(56, 189, 248, 0.12);
      color: #38bdf8;
      border-left-color: #38bdf8;
      font-weight: 600;
    }

    .tree-node-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-path {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family:
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;
      font-size: 0.78rem;
    }

    /* File Role Badges */
    .kind-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      text-transform: lowercase;
      font-family:
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;
      flex-shrink: 0;
    }

    .kind-template {
      background: #1e3a5f;
      color: #7dd3fc;
      border: 1px solid #0284c7;
    }

    .kind-playground {
      background: #3b1d54;
      color: #d8b4fe;
      border: 1px solid #7e22ce;
    }

    .kind-tool {
      background: #143828;
      color: #6ee7b7;
      border: 1px solid #059669;
    }

    .kind-shared {
      background: #3f2c14;
      color: #fcd34d;
      border: 1px solid #d97706;
    }

    .kind-meta {
      background: #292d39;
      color: #cbd5e1;
      border: 1px solid #475569;
    }

    .kind-other {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
    }

    .dirty-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 6px #38bdf8;
      flex-shrink: 0;
    }

    .dirty-pill {
      font-size: 0.65rem;
      padding: 0.1rem 0.4rem;
      background: #0369a1;
      color: #e0f2fe;
      border-radius: 10px;
      font-weight: 600;
    }

    /* Inferences Placeholder */
    .inferences-placeholder {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      text-align: center;
      color: #64748b;
      font-size: 0.8rem;
      gap: 0.5rem;
    }

    /* Main Editor Area */
    .main-editor-area {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #060911;
    }

    .editor-toolbar {
      height: 40px;
      background: #0e1526;
      border-bottom: 1px solid #1e2a42;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1rem;
      font-size: 0.8rem;
      flex-shrink: 0;
      user-select: none;
    }

    .editor-toolbar-left {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      overflow: hidden;
    }

    .active-file-label {
      font-family:
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;
      font-weight: 600;
      color: #f8fafc;
      font-size: 0.82rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .editor-toolbar-right {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-shrink: 0;
    }

    .pill-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 0.74rem;
      font-weight: 600;
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

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .pill-status.success .status-dot {
      background: #10b981;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
    }

    .pill-status.error .status-dot {
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

    /* Empty and Loading States */
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

    .empty-editor-message {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      font-size: 0.9rem;
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

  private handleActivityClick(activity: Activity): void {
    this.store.setActivity(activity);
  }

  private handleFileClick(filePath: string): void {
    this.store.selectFile(filePath);
  }

  private handleRevertClick(): void {
    const model = this.store.model;
    if (model) {
      this.store.revertFile(model.selectedFilePath);
    }
  }

  override render(): TemplateResult {
    const model = this.store.model;

    if (this.loading) {
      return html`
        <div class="loading-state">
          <div class="spinner"></div>
          <div>Connecting to backend and compiling workspace...</div>
        </div>
      `;
    }

    if (this.error || !model) {
      return html`
        <div class="error-state">
          <div class="error-card">
            <div class="error-title">Connection error</div>
            <p>${this.error ?? "Failed to initialize workspace model."}</p>
            <button
              class="btn-retry"
              @click=${(): void => {
                void this.fetchSources();
              }}
            >
              Retry connection
            </button>
          </div>
        </div>
      `;
    }

    const hasDiskChanges =
      model.latestPullSourcesResponse.timestampMillis !==
      model.pulledSources.response.timestampMillis;

    const filePaths = Object.keys(model.editedSources).sort((a, b) =>
      a.localeCompare(b),
    );

    const hasAnyLocalEdits = Object.values(model.editedSources).some(
      (es) => es.edited,
    );

    const activeEditedSource = model.editedSources[model.selectedFilePath];
    const isCurrentFileEdited = Boolean(activeEditedSource?.edited);
    const currentFileRole = getFileRole(
      model.selectedFilePath,
      model.compilationResult,
    );
    const hasAnyErrors = model.compilationResult.anyErrors;

    return html`
      <header class="topbar">
        <div class="brand">
          <span class="brand-tag">⚡ TypePrompt</span>
          <span>Playground</span>
        </div>

        <div class="topbar-actions">
          ${
            hasDiskChanges
              ? html`
                  <button
                    class="btn btn-sync"
                    @click=${(): void => this.store.syncWithDisk()}
                    title="Files modified on disk. Click to refresh baseline."
                  >
                    ↻ Sync with disk
                  </button>
                `
              : ""
          }
        </div>
      </header>

      <div class="workbench">
        <!-- Far-left Activity Rail (48px) -->
        <nav class="activity-bar" aria-label="Activity rail">
          <div class="activity-top-group">
            <button
              class="activity-icon-btn ${model.activeActivity === "files"
                ? "active"
                : ""}"
              title="Project files"
              aria-label="Project files"
              @click=${(): void => this.handleActivityClick("files")}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"
                ></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
              ${
                hasAnyLocalEdits
                  ? html`<span
                      class="activity-badge-dot"
                      title="Files modified locally"
                    ></span>`
                  : ""
              }
            </button>

            <button
              class="activity-icon-btn ${model.activeActivity === "inferences"
                ? "active"
                : ""}"
              title="Inferences"
              aria-label="Inferences"
              @click=${(): void => this.handleActivityClick("inferences")}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
            </button>
          </div>
        </nav>

        <!-- Secondary Sidebar Panel (File Tree or Inferences) -->
        <aside class="sidebar-panel" aria-label="Sidebar">
          ${
            model.activeActivity === "files"
              ? html`
                  <div class="panel-header">
                    <span>Project files</span>
                    <span class="panel-count">${filePaths.length} files</span>
                  </div>
                  <div class="tree-scroll" role="tree">
                    ${filePaths.map((filePath) => {
                      const role = getFileRole(
                        filePath,
                        model.compilationResult,
                      );
                      const isEdited = Boolean(
                        model.editedSources[filePath]?.edited,
                      );
                      const isSelected = filePath === model.selectedFilePath;
                      return html`
                        <div
                          class="tree-node ${isSelected ? "active" : ""}"
                          role="treeitem"
                          aria-selected=${isSelected}
                          @click=${(): void => this.handleFileClick(filePath)}
                          title=${filePath}
                        >
                          <div class="tree-node-left">
                            <span class="kind-badge kind-${role}">
                              ${getRoleBadgeLabel(role)}
                            </span>
                            <span class="file-path">${filePath}</span>
                          </div>
                          ${isEdited
                            ? html`<span
                                class="dirty-dot"
                                title="Modified locally"
                              ></span>`
                            : ""}
                        </div>
                      `;
                    })}
                  </div>
                `
              : html`
                  <div class="panel-header">
                    <span>Inferences</span>
                  </div>
                  <div class="inferences-placeholder">
                    <span>Inference runs will appear here</span>
                  </div>
                `
          }
        </aside>

        <!-- Main Editor Stage -->
        <main class="main-editor-area">
          ${
            activeEditedSource
              ? html`
                  <div class="editor-toolbar">
                    <div class="editor-toolbar-left">
                      <span class="kind-badge kind-${currentFileRole}">
                        ${getRoleBadgeLabel(currentFileRole)}
                      </span>
                      <span class="active-file-label"
                        >${model.selectedFilePath}</span
                      >
                      ${isCurrentFileEdited
                        ? html`<span class="dirty-pill">Modified</span>`
                        : ""}
                    </div>

                    <div class="editor-toolbar-right">
                      ${isCurrentFileEdited
                        ? html`
                            <button
                              class="btn btn-warning"
                              @click=${this.handleRevertClick}
                              title="Revert modifications to original disk content"
                            >
                              ↺ Revert
                            </button>
                          `
                        : ""}

                      <div
                        class="pill-status ${hasAnyErrors
                          ? "error"
                          : "success"}"
                      >
                        <span class="status-dot"></span>
                        <span>${hasAnyErrors ? "Errors detected" : "Valid"}</span>
                      </div>
                    </div>
                  </div>

                  <div class="editor-wrapper">
                    <typeprompt-editor
                      .editorState=${activeEditedSource.editorState}
                    ></typeprompt-editor>
                  </div>
                `
              : html`
                  <div class="empty-editor-message">
                    <span>Select a file from the sidebar to edit</span>
                  </div>
                `
          }
        </main>
      </div>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("play-app")) {
  customElements.define("play-app", PlayApp);
}
