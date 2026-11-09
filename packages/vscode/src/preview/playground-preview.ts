import {
  compile,
  DEFAULT_NAMESPACE,
  DEFAULT_SECRETS_YAML,
  parseCompilationResult,
  parseSecretsYaml,
  type ApiKeys,
  type ValidCompilationResult,
} from "@typeprompt/core";
import { runPlaygroundInferences } from "@typeprompt/inference-runner";
import type { ProjectStore } from "@typeprompt/language-server";
import * as path from "node:path";
import type { ExtensionContext, TextDocument, WebviewPanel } from "vscode";
import { commands, Uri, ViewColumn, window, workspace } from "vscode";
import { canOpenPreview } from "../editor/is-template.js";
import {
  getInferencePageHtml,
  getPlaygroundPreviewHtml,
} from "./preview-html.js";

export interface PlaygroundPreviewController {
  openPlayground(docOrUri?: TextDocument | Uri): Promise<void>;
  notifyCompilationUpdate(): void;
  dispose(): void;
}

/**
 * Checks whether the document is a TypePrompt playground file or a template
 * with an associated playground according to the project store.
 */
export function isPlaygroundDocument(
  document: TextDocument,
  projectStore: ProjectStore,
): boolean {
  return canOpenPreview(document, projectStore);
}

/**
 * Activates on-demand playground preview for VS Code using Lit components.
 */
export function activatePlaygroundPreview(
  context: ExtensionContext,
  projectStore: ProjectStore,
): PlaygroundPreviewController {
  let currentPanel: WebviewPanel | undefined;
  let currentDoc: TextDocument | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const renderPreviewHtml = (panel: WebviewPanel, doc: TextDocument): void => {
    const fileName = path.basename(doc.fileName);
    const displayName = fileName
      .replace(/\.play\.tp$/, "")
      .replace(/\.tp$/, "");
    const match = projectStore.findByUri(doc.uri.toString());
    const scriptUri = panel.webview
      .asWebviewUri(Uri.joinPath(context.extensionUri, "dist", "webview.js"))
      .toString();
    panel.webview.html = getPlaygroundPreviewHtml(
      scriptUri,
      match,
      displayName,
    );
  };

  const openPlaygroundForDocument = async (
    doc: TextDocument,
    preserveFocus = true,
  ): Promise<void> => {
    if (!isPlaygroundDocument(doc, projectStore)) {
      void window.showInformationMessage(
        "No playground preview available for this file.",
      );
      return;
    }

    const sameDoc = currentDoc?.uri.toString() === doc.uri.toString();
    currentDoc = doc;
    const fileName = path.basename(doc.fileName);
    const displayName = fileName
      .replace(/\.play\.tp$/, "")
      .replace(/\.tp$/, "");
    const title = `Preview: ${displayName}`;

    if (!currentPanel) {
      currentPanel = window.createWebviewPanel(
        "typeprompt.playgroundPreview",
        title,
        { viewColumn: ViewColumn.Active, preserveFocus },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [context.extensionUri],
        },
      );

      const iconUri = Uri.file(context.asAbsolutePath("icon.svg"));
      currentPanel.iconPath = iconUri;

      currentPanel.webview.onDidReceiveMessage(
        async (message: { type: string; key?: string; index?: number }) => {
          if (message.type === "selectSample") {
            // Handled
          } else if (
            (message.type === "createSecretsFile" ||
              message.type === "createSecrets") &&
            currentDoc
          ) {
            await handleCreateSecretsFile(currentDoc, projectStore);
          } else if (message.type === "runInference" && currentDoc) {
            await handleRunInference(context, currentDoc, projectStore);
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
      renderPreviewHtml(currentPanel, doc);
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
      renderPreviewHtml(currentPanel, currentDoc);
    }
  };

  context.subscriptions.push(
    commands.registerCommand("typeprompt.openPlayground", handleOpenPlayground),
  );
  context.subscriptions.push(
    commands.registerCommand("typeprompt.openPreview", handleOpenPlayground),
  );
  context.subscriptions.push(
    commands.registerCommand(
      "typeprompt.showPlaygroundPreview",
      handleOpenPlayground,
    ),
  );

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
          renderPreviewHtml(currentPanel, currentDoc);
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

export async function handleCreateSecretsFile(
  doc: TextDocument,
  projectStore: ProjectStore,
): Promise<void> {
  const match = projectStore.findByUri(doc.uri.toString());
  let projectFolderUri: Uri;
  if (match?.project.folderUri) {
    projectFolderUri = Uri.parse(match.project.folderUri);
  } else {
    const workspaceFolder = workspace.getWorkspaceFolder(doc.uri);
    if (workspaceFolder) {
      projectFolderUri = workspaceFolder.uri;
    } else {
      projectFolderUri = Uri.file(path.dirname(doc.fileName));
    }
  }

  const secretsUri = Uri.joinPath(projectFolderUri, ".typeprompt.secrets.yaml");
  try {
    await workspace.fs.stat(secretsUri);
  } catch {
    await workspace.fs.writeFile(
      secretsUri,
      Buffer.from(DEFAULT_SECRETS_YAML, "utf-8"),
    );
  }

  const secretsDoc = await workspace.openTextDocument(secretsUri);
  await window.showTextDocument(secretsDoc, {
    viewColumn: ViewColumn.One,
    preserveFocus: false,
  });
}

export async function handleRunInference(
  context: ExtensionContext,
  doc: TextDocument,
  projectStore: ProjectStore,
): Promise<void> {
  const match = projectStore.findByUri(doc.uri.toString());
  if (!match) {
    void window.showErrorMessage("TypePrompt project not found.");
    return;
  }

  const fileName = path.basename(doc.fileName);
  const sourceFile =
    match.project.compilationResult.sourceFiles[match.relativePath];
  let templateId: string;
  if (sourceFile?.entity && sourceFile.entity.kind === "playground") {
    const ns = sourceFile.entity.namespace ?? DEFAULT_NAMESPACE;
    templateId = `${ns}:${sourceFile.entity.forTemplate}`;
  } else if (sourceFile?.entity && sourceFile.entity.kind === "template") {
    const ns = sourceFile.entity.namespace ?? DEFAULT_NAMESPACE;
    templateId = `${ns}:${sourceFile.entity.name}`;
  } else {
    const baseName = fileName.replace(/\.play\.tp$/, "").replace(/\.tp$/, "");
    templateId = `${DEFAULT_NAMESPACE}:${baseName}`;
  }

  const projectFolderUri = Uri.parse(match.project.folderUri);
  const pathToContent: { [path: string]: string } = {};
  for (const relPath of Object.keys(
    match.project.compilationResult.sourceFiles,
  )) {
    const fileUri = Uri.joinPath(projectFolderUri, relPath);
    const openDoc = workspace.textDocuments.find(
      (d) => d.uri.toString() === fileUri.toString(),
    );
    if (openDoc) {
      pathToContent[relPath] = openDoc.getText();
    } else {
      try {
        const bytes = await workspace.fs.readFile(fileUri);
        pathToContent[relPath] = Buffer.from(bytes).toString("utf-8");
      } catch {
        // Ignore deleted or missing files
      }
    }
  }

  let patchBase: ValidCompilationResult | null = null;
  try {
    const patchBaseUri = Uri.joinPath(projectFolderUri, "patch-base.json");
    const bytes = await workspace.fs.readFile(patchBaseUri);
    const content = Buffer.from(bytes).toString("utf-8");
    const parsed = parseCompilationResult(content, patchBaseUri.fsPath);
    if (!parsed.anyErrors) {
      patchBase = parsed;
    }
  } catch {
    // No patch-base.json
  }

  const compilation = compile(pathToContent, { cache: null, patchBase });
  if (compilation.anyErrors) {
    void window.showErrorMessage(
      "Cannot run inference: playground has compilation errors.",
    );
    return;
  }
  const validCompilation = compilation as ValidCompilationResult;

  if (!validCompilation.playgrounds[templateId]) {
    const entry = Object.entries(validCompilation.playgrounds).find(
      ([id, p]) => id === templateId || p.templateId === templateId,
    );
    if (entry) {
      templateId = entry[0];
    } else {
      void window.showErrorMessage(`No playground found for '${templateId}'.`);
      return;
    }
  }

  const apiKeys: ApiKeys = {};
  if (
    match.project.secrets.kind === "success" &&
    match.project.secrets.secrets.apiKeys
  ) {
    Object.assign(apiKeys, match.project.secrets.secrets.apiKeys);
  }
  const secretsYamlUri = Uri.joinPath(
    projectFolderUri,
    ".typeprompt.secrets.yaml",
  );
  const secretsYmlUri = Uri.joinPath(
    projectFolderUri,
    ".typeprompt.secrets.yml",
  );
  const openSecretsDoc = workspace.textDocuments.find(
    (d) =>
      d.uri.toString() === secretsYamlUri.toString() ||
      d.uri.toString() === secretsYmlUri.toString(),
  );
  if (openSecretsDoc) {
    const parsed = parseSecretsYaml(
      openSecretsDoc.getText(),
      openSecretsDoc.fileName,
    );
    if (parsed.kind === "success" && parsed.secrets.apiKeys) {
      Object.assign(apiKeys, parsed.secrets.apiKeys);
    }
  }

  const shortName = templateId.startsWith(`${DEFAULT_NAMESPACE}:`)
    ? templateId.slice(`${DEFAULT_NAMESPACE}:`.length)
    : templateId;

  const inferencePanel = window.createWebviewPanel(
    "typeprompt.inferenceRun",
    `Inference: ${shortName}`,
    ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    },
  );
  inferencePanel.iconPath = Uri.file(context.asAbsolutePath("icon.svg"));

  let hasSetInitialHtml = false;

  void runPlaygroundInferences(validCompilation, templateId, {
    apiKeys,
    callback: (pendingInferenceRun) => {
      if (!hasSetInitialHtml) {
        hasSetInitialHtml = true;
        const scriptUri = inferencePanel.webview
          .asWebviewUri(
            Uri.joinPath(context.extensionUri, "dist", "webview.js"),
          )
          .toString();
        inferencePanel.webview.html = getInferencePageHtml(
          scriptUri,
          pendingInferenceRun,
          shortName,
        );
      } else {
        void inferencePanel.webview.postMessage({
          type: "updateInferenceRun",
          inferenceRun: pendingInferenceRun,
        });
      }
    },
  }).catch((err: unknown) => {
    void window.showErrorMessage(
      `Inference run failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}
