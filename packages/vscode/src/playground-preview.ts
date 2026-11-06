import type { ProjectStore } from "@typeprompt/language-server";
import * as path from "node:path";
import type { ExtensionContext, TextDocument, WebviewPanel } from "vscode";
import { Uri, ViewColumn, commands, window, workspace } from "vscode";

export interface PlaygroundPreviewController {
  openPlayground(docOrUri?: TextDocument | Uri): Promise<void>;
  notifyCompilationUpdate(): void;
  dispose(): void;
}

/**
 * Checks whether the document is a TypePrompt playground file according to the
 * project store.
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
 * Escapes HTML entities for safe inclusion in the webview.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generates the preview HTML for the playground file.
 */
function renderPlaygroundPreviewHtml(
  document: TextDocument,
  projectStore: ProjectStore,
): string {
  const fileName = path.basename(document.fileName);

  let targetTemplate: string | null = null;
  let targetNamespace: string | null = null;
  let modelName = "gpt-4o";
  let sampleList: readonly PreviewSample[] = [];
  let diagnosticErrors: readonly string[] = [];

  const match = projectStore.findByUri(document.uri.toString());
  const sourceFile =
    match?.project.compilationResult.sourceFiles[match.relativePath];

  if (sourceFile?.entity && sourceFile.entity.kind === "playground") {
    targetTemplate = sourceFile.entity.forTemplate;
    targetNamespace = sourceFile.entity.namespace;
    modelName = extractModelName(sourceFile.entity.model);
    sampleList = extractSamples(sourceFile.entity.samples);
  }

  const sampleCount = sampleList.length;

  if (match) {
    const errors =
      match.project.compilationResult.finalErrors[match.relativePath];
    if (errors && errors.length > 0) {
      diagnosticErrors = errors.map((e) => e.message);
    }
  }

  const hasErrors = diagnosticErrors.length > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TypePrompt Playground Preview</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #090d16);
      --fg: var(--vscode-editor-foreground, #f8fafc);
      --surface: var(--vscode-sideBar-background, #101625);
      --border: var(--vscode-panel-border, #1e2a42);
      --badge-bg: var(--vscode-badge-background, #38bdf8);
      --badge-fg: var(--vscode-badge-foreground, #090d16);
      --accent: #38bdf8;
      --success: #34d399;
      --error: #f87171;
      --font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      --font-mono: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font-family);
      font-size: 13px;
      line-height: 1.5;
      padding: 16px;
      overflow-y: auto;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
      gap: 12px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-tag {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.35);
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }

    .brand-title {
      font-weight: 700;
      font-size: 14px;
      letter-spacing: -0.2px;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(52, 211, 153, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.3);
      color: var(--success);
    }

    .status-pill-error {
      background: rgba(248, 113, 113, 0.12);
      border: 1px solid rgba(248, 113, 113, 0.3);
      color: var(--error);
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 6px var(--success);
    }

    .status-dot-error {
      background: var(--error);
      box-shadow: 0 0 6px var(--error);
    }

    .diagnostic-alert {
      background: rgba(248, 113, 113, 0.1);
      border: 1px solid rgba(248, 113, 113, 0.3);
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 16px;
      color: var(--error);
      font-size: 12px;
    }

    .diagnostic-alert ul {
      margin-left: 18px;
      margin-top: 4px;
    }

    .meta-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }

    .meta-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .meta-label {
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.65;
    }

    .meta-val {
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-mono);
      color: var(--accent);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .preview-section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 16px;
    }

    .section-header {
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid var(--border);
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .section-body {
      padding: 14px;
    }

    .sample-card {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
    }

    .sample-card:last-child {
      margin-bottom: 0;
    }

    .sample-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .sample-block {
      background: rgba(0, 0, 0, 0.35);
      border-radius: 4px;
      padding: 8px 10px;
      font-family: var(--font-mono);
      font-size: 11.5px;
      line-height: 1.5;
      overflow-x: auto;
      margin-top: 6px;
    }

    .empty-state {
      text-align: center;
      padding: 24px 16px;
      color: rgba(255, 255, 255, 0.5);
    }

    .footer-note {
      font-size: 11px;
      opacity: 0.5;
      text-align: center;
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span class="brand-tag">⚡ TypePrompt</span>
      <span class="brand-title">Playground Preview</span>
    </div>
    <div class="status-pill ${hasErrors ? "status-pill-error" : ""}">
      <span class="status-dot ${hasErrors ? "status-dot-error" : ""}"></span>
      <span>${hasErrors ? `${diagnosticErrors.length} Issue${diagnosticErrors.length > 1 ? "s" : ""}` : "Live Sync"}</span>
    </div>
  </header>

  ${
    hasErrors
      ? `<div class="diagnostic-alert">
    <strong>Validation Issues:</strong>
    <ul>
      ${diagnosticErrors.map((err) => `<li>${escapeHtml(err)}</li>`).join("")}
    </ul>
  </div>`
      : ""
  }

  <div class="meta-cards">
    <div class="meta-card">
      <span class="meta-label">File</span>
      <span class="meta-val" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span>
    </div>
    <div class="meta-card">
      <span class="meta-label">Template</span>
      <span class="meta-val" title="${escapeHtml(targetTemplate ?? "Not set")}">${escapeHtml(targetTemplate ?? "None")}</span>
    </div>
    ${
      targetNamespace
        ? `<div class="meta-card">
      <span class="meta-label">Namespace</span>
      <span class="meta-val" title="${escapeHtml(targetNamespace)}">${escapeHtml(targetNamespace)}</span>
    </div>`
        : ""
    }
    <div class="meta-card">
      <span class="meta-label">Model</span>
      <span class="meta-val" title="${escapeHtml(modelName)}">${escapeHtml(modelName)}</span>
    </div>
    <div class="meta-card">
      <span class="meta-label">Samples</span>
      <span class="meta-val">${sampleCount}</span>
    </div>
  </div>

  <div class="preview-section">
    <div class="section-header">
      <span>Live Inferences & Output</span>
      <span style="font-size: 10px; opacity: 0.6;">Live preview</span>
    </div>
    <div class="section-body">
      ${
        sampleCount > 0
          ? sampleList
              .map(
                (sample, i) => `
      <div class="sample-card">
        <div class="sample-title">
          <span>${escapeHtml(sample.name ? `Sample ${i + 1}: ${sample.name}` : `Sample ${i + 1}`)}</span>
          <span style="font-size: 10px; opacity: 0.6; font-weight: normal;">• Ready</span>
        </div>
        <div style="font-size: 11.5px; opacity: 0.75; margin-bottom: 4px;">Target Template: <strong>${escapeHtml(targetTemplate ?? "—")}</strong></div>
        <div class="sample-block">
// Live rendered prompt and simulated LLM inferences will appear here.
// Edit the &lt;playground&gt; file to watch parameters update live.
        </div>
      </div>`,
              )
              .join("")
          : `<div class="empty-state">
        <p>No samples found in this playground.</p>
        <p style="font-size: 11px; margin-top: 4px; opacity: 0.7;">Add samples under &lt;samples&gt; to configure live test inputs.</p>
      </div>`
      }
    </div>
  </div>

  <div class="footer-note">
    Connected to the editor on the left. Changes update this preview automatically.
  </div>
</body>
</html>`;
}

interface PreviewSample {
  readonly name?: string;
  readonly input?: unknown;
}

function extractSamples(samples: unknown): readonly PreviewSample[] {
  if (Array.isArray(samples)) {
    return samples.map((s, idx) => {
      if (s && typeof s === "object") {
        const name =
          "name" in s && typeof (s as { name: unknown }).name === "string"
            ? (s as { name: string }).name
            : undefined;
        return { name, input: (s as { input?: unknown }).input };
      }
      return { name: `Sample ${idx + 1}` };
    });
  }
  if (
    samples &&
    typeof samples === "object" &&
    "elements" in samples &&
    Array.isArray((samples as { elements: unknown[] }).elements)
  ) {
    const elements = (samples as { elements: unknown[] }).elements;
    return elements.map((elem, idx) => {
      if (elem && typeof elem === "object" && "entries" in elem) {
        const entries = (
          elem as {
            entries: Record<string, { value?: { value?: unknown } }>;
          }
        ).entries;
        const nameVal = entries.name?.value?.value;
        return {
          name: typeof nameVal === "string" ? nameVal : undefined,
        };
      }
      return { name: `Sample ${idx + 1}` };
    });
  }
  return [];
}

function extractModelName(model: unknown): string {
  if (typeof model === "string") {
    return model;
  }
  if (model && typeof model === "object") {
    if (
      "model" in model &&
      typeof (model as { model: unknown }).model === "string"
    ) {
      return (model as { model: string }).model;
    }
    if (
      "entries" in model &&
      typeof (model as { entries: unknown }).entries === "object"
    ) {
      const entries = (
        model as {
          entries: Record<string, { value?: { value?: unknown } }>;
        }
      ).entries;
      const modelVal = entries.model?.value?.value;
      if (typeof modelVal === "string") {
        return modelVal;
      }
    }
  }
  return "gpt-4o";
}
