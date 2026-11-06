import { Lsp } from "@typeprompt/core";
import type { ProjectStore } from "@typeprompt/language-server";
import type { ExtensionContext, TextEditor } from "vscode";
import { commands, Uri, window, workspace } from "vscode";
import type { LanguageClient } from "vscode-languageclient/node.js";
import { isTemplateWithoutPlayground } from "./is-template-without-playground.js";

export interface CreatePlaygroundController {
  updateContext(editor?: TextEditor): void;
  notifyCompilationUpdate(): void;
}

export function activateCreatePlayground(
  context: ExtensionContext,
  projectStore: ProjectStore,
  getClient: () => LanguageClient | undefined,
): CreatePlaygroundController {
  const updateContext = (editor = window.activeTextEditor): void => {
    if (!editor?.document) {
      void commands.executeCommand(
        "setContext",
        IS_TEMPLATE_WITHOUT_PLAYGROUND_CONTEXT,
        false,
      );
      return;
    }

    const isEligible = isTemplateWithoutPlayground(
      editor.document,
      projectStore,
    );

    void commands.executeCommand(
      "setContext",
      IS_TEMPLATE_WITHOUT_PLAYGROUND_CONTEXT,
      isEligible,
    );
  };

  context.subscriptions.push(
    commands.registerCommand("typeprompt.createPlayground", (uri?: Uri) =>
      handleCreatePlayground(uri, getClient, projectStore),
    ),
  );

  context.subscriptions.push(
    window.onDidChangeActiveTextEditor((editor) => {
      updateContext(editor);
    }),
  );

  updateContext();

  return {
    updateContext,
    notifyCompilationUpdate: (): void => {
      updateContext();
    },
  };
}

async function handleCreatePlayground(
  uri: Uri | undefined,
  getClient: () => LanguageClient | undefined,
  _projectStore: ProjectStore,
): Promise<void> {
  let doc: { uri: Uri; fileName: string } | undefined;
  if (uri) {
    const opened = await workspace.openTextDocument(uri);
    doc = { uri: opened.uri, fileName: opened.fileName };
  } else if (window.activeTextEditor?.document) {
    doc = {
      uri: window.activeTextEditor.document.uri,
      fileName: window.activeTextEditor.document.fileName,
    };
  }

  if (!doc) {
    return;
  }

  const playPath = doc.fileName.replace(/\.tp$/, ".play.tp");
  const playUri = Uri.file(playPath);

  try {
    const stat = await workspace.fs.stat(playUri);
    if (stat) {
      const opened = await workspace.openTextDocument(playUri);
      await window.showTextDocument(opened);
      return;
    }
  } catch {
    // File does not exist yet, proceed with creation
  }

  let content: string | null = null;
  const client = getClient();
  if (client) {
    try {
      content = await client.sendRequest<string | null>(
        "typeprompt/getFileTemplate",
        { uri: playUri.toString() },
      );
    } catch {
      // Ignore LSP error and fall back
    }
  }

  content = content ?? Lsp.generateFileTemplate(playUri.fsPath, null) ?? "";

  await workspace.fs.writeFile(playUri, Buffer.from(content, "utf8"));
  const openedDoc = await workspace.openTextDocument(playUri);
  await window.showTextDocument(openedDoc);
}

const IS_TEMPLATE_WITHOUT_PLAYGROUND_CONTEXT =
  "typeprompt.isTemplateWithoutPlayground";
