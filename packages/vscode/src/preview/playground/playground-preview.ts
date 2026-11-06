import type { ProjectStore } from "@typeprompt/language-server";
import * as path from "node:path";
import type { ExtensionContext, TextDocument, WebviewPanel } from "vscode";
import { Uri, ViewColumn, commands, window, workspace } from "vscode";
import {
  getOrCreateState,
  renderPlaygroundPreviewHtml,
  updateSelectedSampleInHtml,
} from "./render-playground-page.js";

export interface PlaygroundPreviewController {
  openPlayground(docOrUri?: TextDocument | Uri): Promise<void>;
  notifyCompilationUpdate(): void;
  dispose(): void;
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

