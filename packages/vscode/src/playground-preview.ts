import type { Lsp } from "@typeprompt/core";
import type { ProjectStore } from "@typeprompt/language-server";
import * as path from "node:path";
import type { ExtensionContext, TextDocument, WebviewPanel } from "vscode";
import { Uri, ViewColumn, commands, window, workspace } from "vscode";
import {
  escapeHtml,
  renderRequestContext,
} from "./render-inference-set-html.js";

export interface PlaygroundPreviewController {
  openPlayground(docOrUri?: TextDocument | Uri): Promise<void>;
  notifyCompilationUpdate(): void;
  dispose(): void;
}

interface PlaygroundDocumentState {
  lastSuccessfulHtml?: string;
  selectedSampleKey?: string;
}

const documentStates = new Map<string, PlaygroundDocumentState>();

function getOrCreateState(uri: string): PlaygroundDocumentState {
  let state = documentStates.get(uri);
  if (!state) {
    state = {};
    documentStates.set(uri, state);
  }
  return state;
}

/**
 * Checks whether the document is a TypePrompt playground file according to the
 * project store or filename convention.
 */
export function isPlaygroundDocument(
  document: TextDocument,
  projectStore: ProjectStore,
): boolean {
  if (
    document.languageId !== "typeprompt" &&
    !document.fileName.endsWith(".tp")
  ) {
    return false;
  }

  if (document.fileName.endsWith(".play.tp")) {
    return true;
  }

  const match = projectStore.findByUri(document.uri.toString());
  if (match) {
    const sourceFile =
      match.project.compilationResult.sourceFiles[match.relativePath];
    if (sourceFile?.entity) {
      return sourceFile.entity.kind === "playground";
    }
  }

  return false;
}

/**
 * Activates on-demand playground preview for VS Code.
 */
export function activatePlaygroundPreview(
  context: ExtensionContext,
  projectStore: ProjectStore,
): PlaygroundPreviewController {
  let currentPanel: WebviewPanel | undefined;
  let currentDoc: TextDocument | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const openPlaygroundForDocument = async (
    doc: TextDocument,
    preserveFocus = true,
  ): Promise<void> => {
    if (!isPlaygroundDocument(doc, projectStore)) {
      void window.showInformationMessage(
        "Selected file is not a TypePrompt playground.",
      );
      return;
    }

    const sameDoc = currentDoc?.uri.toString() === doc.uri.toString();
    currentDoc = doc;
    const fileName = path.basename(doc.fileName);
    const title = `Playground: ${fileName}`;

    if (!currentPanel) {
      currentPanel = window.createWebviewPanel(
        "typeprompt.playgroundPreview",
        title,
        { viewColumn: ViewColumn.Active, preserveFocus },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      );

      const iconUri = Uri.file(context.asAbsolutePath("icon.svg"));
      currentPanel.iconPath = iconUri;

      currentPanel.webview.onDidReceiveMessage(
        (message: { type: string; key?: string; index?: number }) => {
          if (message.type === "selectSample" && message.key && currentDoc) {
            const state = getOrCreateState(currentDoc.uri.toString());
            state.selectedSampleKey = message.key;
            if (state.lastSuccessfulHtml && typeof message.index === "number") {
              state.lastSuccessfulHtml = updateSelectedSampleInHtml(
                state.lastSuccessfulHtml,
                message.index,
              );
            }
          }
        },
      );

      currentPanel.onDidDispose(() => {
        currentPanel = undefined;
        currentDoc = undefined;
      });
    } else {
      currentPanel.title = title;
      currentPanel.reveal(undefined, preserveFocus);
    }

    if (!sameDoc || !currentPanel.webview.html) {
      currentPanel.webview.html = renderPlaygroundPreviewHtml(
        doc,
        projectStore,
      );
    }
  };

  const handleOpenPlayground = async (
    docOrUri?: TextDocument | Uri,
  ): Promise<void> => {
    let doc: TextDocument | undefined;

    if (docOrUri instanceof Uri) {
      doc = await workspace.openTextDocument(docOrUri);
      await window.showTextDocument(doc, {
        viewColumn: ViewColumn.Active,
        preserveFocus: false,
      });
    } else if (docOrUri && "uri" in docOrUri) {
      doc = docOrUri;
    } else {
      doc = window.activeTextEditor?.document;
    }

    if (!doc) {
      return;
    }

    await openPlaygroundForDocument(doc, false);
  };

  const notifyCompilationUpdate = (): void => {
    if (currentPanel && currentDoc) {
      currentPanel.webview.html = renderPlaygroundPreviewHtml(
        currentDoc,
        projectStore,
      );
    }
  };

  // Register command to trigger playground preview (from explorer context menu, editor title, or command palette)
  context.subscriptions.push(
    commands.registerCommand("typeprompt.openPlayground", handleOpenPlayground),
  );
  context.subscriptions.push(
    commands.registerCommand(
      "typeprompt.showPlaygroundPreview",
      handleOpenPlayground,
    ),
  );

  // If the preview panel is open and the active text editor switches to another playground, update the preview
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor((editor) => {
      if (!currentPanel || !editor) {
        return;
      }
      const doc = editor.document;
      if (
        isPlaygroundDocument(doc, projectStore) &&
        doc.uri.toString() !== currentDoc?.uri.toString()
      ) {
        void openPlaygroundForDocument(doc, true);
      }
    }),
  );

  // Debounced update on text changes in the actively previewed playground document
  context.subscriptions.push(
    workspace.onDidChangeTextDocument((event) => {
      if (!currentPanel || !currentDoc) {
        return;
      }
      if (event.document.uri.toString() !== currentDoc.uri.toString()) {
        return;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        if (currentPanel && currentDoc) {
          currentPanel.webview.html = renderPlaygroundPreviewHtml(
            currentDoc,
            projectStore,
          );
        }
      }, 150);
    }),
  );

  return {
    openPlayground: handleOpenPlayground,
    notifyCompilationUpdate,
    dispose(): void {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (currentPanel) {
        currentPanel.dispose();
        currentPanel = undefined;
        currentDoc = undefined;
      }
    },
  };
}

/**
 * Updates the HTML string to mark the specified sample index as selected
 * in both the <select> element and the discussion views.
 */
function updateSelectedSampleInHtml(
  html: string,
  selectedIndex: number,
): string {
  let updated = html.replace(/(<option[^>]*?)\sselected([^>]*?>)/gi, "$1$2");
  updated = updated.replace(
    new RegExp(`(<option[^>]*?value="${selectedIndex}"[^>]*?)>`),
    "$1 selected>",
  );
  updated = updated.replace(
    /(<div[^>]*?class="[^"]*sample-discussion-view[^"]*"[^>]*?style=")[^"]*(")/gi,
    "$1display: none;$2",
  );
  updated = updated.replace(
    new RegExp(
      `(<div[^>]*?id="sample-discussion-${selectedIndex}"[^>]*?style=")[^"]*(")`,
    ),
    "$1display: block;$2",
  );
  return updated;
}

/**
 * Injects or activates the thin compilation error overlay on top of the given HTML.
 */
function injectErrorOverlay(html: string): string {
  if (html.includes('id="compilation-error-overlay"')) {
    return html.replace(
      /id="compilation-error-overlay"[^>]*style="[^"]*"/,
      'id="compilation-error-overlay" class="compilation-error-overlay" style="display: flex;"',
    );
  }
  return html.replace(
    "</body>",
    `<div id="compilation-error-overlay" class="compilation-error-overlay" style="display: flex;">
      <div class="error-banner">
        <span class="error-banner-icon">⚠️</span>
        <span class="error-banner-text">Address the TypePrompt errors</span>
      </div>
    </div></body>`,
  );
}

/**
 * Builds a placeholder HTML shell when no successful compilation exists yet.
 */
function buildInitialErrorHtml(fileName: string): string {
  return buildPageShell({
    fileName,
    bodyContent: `
      <div class="sample-picker-bar">
        <label for="sample-select" class="sample-picker-label">Sample</label>
        <select id="sample-select" class="sample-select" disabled>
          <option>No samples available</option>
        </select>
      </div>
      <div class="empty-state">
        <p>No preview available yet.</p>
        <p style="font-size: 0.8rem; margin-top: 0.35rem; opacity: 0.7;">
          Fix the TypePrompt errors in the editor to view the live playground.
        </p>
      </div>
    `,
    hasErrors: true,
  });
}

/**
 * Generates the preview HTML for the playground file.
 */
export function renderPlaygroundPreviewHtml(
  document: TextDocument,
  projectStore: ProjectStore,
): string {
  const uri = document.uri.toString();
  const state = getOrCreateState(uri);
  const fileName = path.basename(document.fileName);

  const match = projectStore.findByUri(uri);
  const sourceFile =
    match?.project.compilationResult.sourceFiles[match.relativePath];

  const anyErrors = match ? match.project.compilationResult.anyErrors : true;
  const fileErrors =
    match?.project.compilationResult.finalErrors[match.relativePath] ?? [];

  let wirePlayground: Lsp.WirePlayground | undefined;
  if (match && sourceFile?.entity && sourceFile.entity.kind === "playground") {
    const forTemplate = sourceFile.entity.forTemplate;
    const ns = sourceFile.entity.namespace;
    const expectedId = ns ? `${ns}:${forTemplate}` : forTemplate;
    wirePlayground =
      match.project.compilationResult.playgrounds[expectedId] ??
      match.project.compilationResult.playgrounds[forTemplate] ??
      Object.values(match.project.compilationResult.playgrounds).find(
        (p) => p.forTemplate === forTemplate,
      );
  }

  const hasErrors =
    anyErrors || fileErrors.length > 0 || !wirePlayground?.isValid;

  if (!hasErrors && wirePlayground) {
    const rawSamples = Array.isArray(wirePlayground.samples)
      ? wirePlayground.samples
      : [];
    const samples = rawSamples as readonly Lsp.WirePlaygroundSample[];

    // Determine selected index:
    // If the currently selected sample is no longer in the actual list of <samples>, default back to first sample.
    let selectedIndex = 0;
    if (state.selectedSampleKey && samples.length > 0) {
      const idx = samples.findIndex((s, i) => {
        const key = s.name ? `name:${s.name}` : `index:${i}`;
        return key === state.selectedSampleKey;
      });
      if (idx >= 0) {
        selectedIndex = idx;
      } else if (state.selectedSampleKey.startsWith("index:")) {
        const parsedIdx = parseInt(
          state.selectedSampleKey.slice("index:".length),
          10,
        );
        if (!isNaN(parsedIdx) && parsedIdx >= 0 && parsedIdx < samples.length) {
          selectedIndex = parsedIdx;
        }
      }
    }

    if (samples.length > 0) {
      const sel = samples[selectedIndex];
      state.selectedSampleKey = sel?.name
        ? `name:${sel.name}`
        : `index:${selectedIndex}`;
    }

    const bodyContent = buildSuccessfulPlaygroundBody({
      samples,
      selectedIndex,
    });

    const htmlContent = buildPageShell({
      fileName,
      bodyContent,
      hasErrors: false,
    });

    state.lastSuccessfulHtml = htmlContent;
    return htmlContent;
  }

  // When compilation has errors:
  // Add a thin overlay (with low opacity) on top of the HTML saying to address the TypePrompt errors;
  // the user will still be able to see the HTML (generated for the last time compilation was successful) underneath.
  if (state.lastSuccessfulHtml) {
    return injectErrorOverlay(state.lastSuccessfulHtml);
  }

  return buildInitialErrorHtml(fileName);
}

function buildSuccessfulPlaygroundBody(params: {
  readonly samples: readonly Lsp.WirePlaygroundSample[];
  readonly selectedIndex: number;
}): string {
  const { samples, selectedIndex } = params;

  if (samples.length === 0) {
    return `
      <div class="sample-picker-bar">
        <label for="sample-select" class="sample-picker-label">Sample</label>
        <select id="sample-select" class="sample-select" disabled>
          <option>No samples available</option>
        </select>
      </div>
      <div class="empty-state">
        <p>No samples found in this playground.</p>
        <p style="font-size: 0.8rem; margin-top: 0.35rem; opacity: 0.7;">
          Add samples under &lt;samples&gt; to preview conversations.
        </p>
      </div>
    `;
  }

  const selectOptions = samples
    .map((s, idx) => {
      const isSelected = idx === selectedIndex;
      const label = s.name ? s.name : String(idx + 1);
      return `<option value="${idx}" data-name="${escapeHtml(s.name ?? "")}" ${isSelected ? "selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");

  const discussions = samples
    .map((s, idx) => {
      const isSelected = idx === selectedIndex;
      const noteHtml = s.note
        ? `
        <div class="sample-note-card">
          <div class="sample-note-header">
            <span class="sample-note-title">Note</span>
          </div>
          <div class="sample-note-body">${escapeHtml(s.note)}</div>
        </div>
      `
        : "";

      const discussionHtml = s.request
        ? renderRequestContext(s.request).toString()
        : '<div class="empty-discussion">No conversation preview available for this sample.</div>';

      return `
        <div id="sample-discussion-${idx}" class="sample-discussion-view" style="display: ${isSelected ? "block" : "none"};">
          ${noteHtml}
          ${discussionHtml}
        </div>
      `;
    })
    .join("");

  return `
    <div class="sample-picker-bar">
      <label for="sample-select" class="sample-picker-label">Sample</label>
      <select id="sample-select" class="sample-select">
        ${selectOptions}
      </select>
    </div>
    <div class="sample-discussions-container">
      ${discussions}
    </div>
  `;
}

function buildPageShell(params: {
  readonly fileName: string;
  readonly bodyContent: string;
  readonly hasErrors: boolean;
}): string {
  const { fileName, bodyContent, hasErrors } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)} · Playground Preview</title>
  <style>
    :root {
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: "SF Mono", Monaco, "Cascadia Code", "Liberation Mono", Menlo, Courier, monospace;

      --bg: #0b0f19;
      --bg-surface: #111827;
      --bg-surface-elevated: #1a2234;
      --bg-inset: #070a12;

      --border: #1f293d;
      --border-subtle: #162032;
      --border-focus: #38bdf8;

      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-soft: #64748b;

      --section-request: #121828;
      --section-request-bg: #0a0e19;
      --section-request-header: #121828;
      --section-request-border: #1e263c;
      --section-request-label: #94a3b8;

      --user-bg: #1e293b;
      --user-border: #334155;
      --user-label: #94a3b8;

      --assistant-bg: #0f2c42;
      --assistant-border: #164e63;
      --assistant-label: #38bdf8;

      --tool-bg: #281a3d;
      --tool-border: #4c1d95;
      --tool-label: #c084fc;

      --hl-key: #7dd3fc;
      --hl-string: #a7f3d0;
      --hl-number: #fde047;
      --hl-boolean: #f472b6;
      --hl-comment: #64748b;
      --hl-xml-tag: #38bdf8;
      --hl-xml-attribute: #c084fc;
      --hl-schema-keyword: #f472b6;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--font-sans);
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 1.25rem 1.5rem 3rem;
      position: relative;
      min-height: 100vh;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    /* Sample Picker */
    .sample-picker-bar {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    }

    .sample-picker-label {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .sample-select {
      flex: 1;
      background: var(--bg-inset);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.5rem 0.85rem;
      font-size: 0.88rem;
      font-weight: 500;
      outline: none;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }

    .sample-select:focus {
      border-color: var(--border-focus);
    }

    /* Sample Note */
    .sample-note-card {
      background: rgba(56, 189, 248, 0.07);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1.25rem;
    }

    .sample-note-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.35rem;
    }

    .sample-note-title {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #38bdf8;
    }

    .sample-note-body {
      font-size: 0.85rem;
      color: #e2e8f0;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    /* Chat Messages & Stream */
    .chat-stream {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      padding: 0.5rem 0;
    }

    .chat-bubble-wrap {
      display: flex;
      width: 100%;
    }

    .system-message-wrap {
      padding-right: 12%;
    }

    .chat-bubble-wrap.role-user {
      justify-content: flex-start;
      padding-right: 12%;
    }

    .chat-bubble-wrap.role-assistant {
      justify-content: flex-end;
      padding-left: 12%;
    }

    .chat-bubble-wrap.role-tool {
      justify-content: center;
      padding: 0 6%;
    }

    .chat-bubble {
      width: 100%;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    }

    .chat-bubble-wrap.role-user .chat-bubble {
      background: var(--user-bg);
      border-color: var(--user-border);
    }

    .chat-bubble-wrap.role-assistant .chat-bubble {
      background: var(--assistant-bg);
      border-color: var(--assistant-border);
    }

    .chat-bubble-wrap.role-tool .chat-bubble {
      background: var(--tool-bg);
      border-color: var(--tool-border);
    }

    .chat-bubble-header {
      padding: 0.4rem 0.85rem;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .chat-bubble-wrap.role-user .chat-bubble-header {
      color: var(--user-label);
      background: rgba(0, 0, 0, 0.2);
    }

    .chat-bubble-wrap.role-assistant .chat-bubble-header {
      color: var(--assistant-label);
      background: rgba(0, 0, 0, 0.25);
    }

    .chat-bubble-wrap.role-tool .chat-bubble-header {
      color: var(--tool-label);
      background: rgba(0, 0, 0, 0.25);
    }

    .chat-bubble-body {
      padding: 0.75rem 0.9rem;
      font-size: 0.85rem;
      line-height: 1.5;
    }

    .chat-bubble-body pre {
      font-family: var(--font-mono);
      font-size: 0.84rem;
      white-space: pre-wrap;
      word-break: break-word;
      color: #e2e8f0;
    }

    /* Tool Badges */
    .tool-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-family: var(--font-mono);
      font-size: 0.78rem;
      background: #311d4d;
      color: #d8b4fe;
      border: 1px solid #581c87;
      padding: 0.22rem 0.55rem;
      border-radius: 5px;
      margin-bottom: 0.35rem;
    }

    .code-view {
      font-family: var(--font-mono);
      font-size: 0.84rem;
      line-height: 1.5;
      padding: 0.85rem 1rem;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      color: #e2e8f0;
    }

    .section-title {
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .section-title.request {
      color: var(--section-request-label);
    }

    /* Syntax Highlighting */
    .hl-key { color: var(--hl-key); }
    .hl-string { color: var(--hl-string); }
    .hl-number { color: var(--hl-number); }
    .hl-boolean { color: var(--hl-boolean); }
    .hl-comment { color: var(--hl-comment); font-style: italic; }

    /* Overlay */
    .compilation-error-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(11, 15, 25, 0.45);
      backdrop-filter: blur(1.5px);
      z-index: 99999;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding-top: 1.5rem;
      pointer-events: none;
    }

    .error-banner {
      pointer-events: auto;
      background: rgba(24, 16, 22, 0.95);
      border: 1px solid rgba(248, 113, 113, 0.6);
      color: #fca5a5;
      border-radius: 8px;
      padding: 0.65rem 1.25rem;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.88rem;
      font-weight: 600;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 1.5rem;
      color: var(--text-muted);
      font-size: 0.9rem;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
    }

    .empty-discussion {
      text-align: center;
      padding: 2rem 1rem;
      color: var(--text-muted);
      font-size: 0.85rem;
      background: var(--bg-surface);
      border: 1px dashed var(--border);
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="container">
    ${bodyContent}
  </div>

  <div id="compilation-error-overlay" class="compilation-error-overlay" style="display: ${hasErrors ? "flex" : "none"};">
    <div class="error-banner">
      <span class="error-banner-icon">⚠️</span>
      <span class="error-banner-text">Address the TypePrompt errors</span>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const select = document.getElementById('sample-select');

    function showSample(idx) {
      const views = document.querySelectorAll('.sample-discussion-view');
      views.forEach((view, i) => {
        view.style.display = (i === idx) ? 'block' : 'none';
      });
    }

    if (select) {
      select.addEventListener('change', () => {
        const idx = Number(select.value);
        showSample(idx);
        const selectedOption = select.options[select.selectedIndex];
        const name = selectedOption ? selectedOption.getAttribute('data-name') : '';
        const key = name ? 'name:' + name : 'index:' + idx;
        vscode.setState({ selectedSampleKey: key });
        vscode.postMessage({ type: 'selectSample', key: key, index: idx });
      });
    }
  </script>
</body>
</html>`;
}
