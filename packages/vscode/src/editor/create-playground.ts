import type { ProjectStore } from "@typeprompt/language-server";
import type { ExtensionContext, TextEditor } from "vscode";
import { commands, Uri, window, workspace } from "vscode";
import { generateFileTemplate } from "./file-template.js";
import { isPlaygroundFile, isTemplateFile } from "./is-template.js";

export interface CreatePlaygroundController {
  updateContext(editor?: TextEditor): void;
  notifyCompilationUpdate(): void;
}

export function activateCreatePlayground(
  context: ExtensionContext,
  projectStore: ProjectStore,
): CreatePlaygroundController {
  const updateContext = (editor = window.activeTextEditor): void => {
    if (!editor?.document) {
      void commands.executeCommand(
        "setContext",
        IS_TEMPLATE_WITHOUT_PLAYGROUND_CONTEXT,
        false,
      );
      void commands.executeCommand(
        "setContext",
        CAN_OPEN_PREVIEW_CONTEXT,
        false,
      );
      return;
    }

    const templateStatus = isTemplateFile(editor.document, projectStore);
    const isWithoutPlayground = templateStatus === "no-playground";
    const canPreview =
      isPlaygroundFile(editor.document, projectStore) ||
      templateStatus === "with-playground";

    void commands.executeCommand(
      "setContext",
      IS_TEMPLATE_WITHOUT_PLAYGROUND_CONTEXT,
      isWithoutPlayground,
    );
    void commands.executeCommand(
      "setContext",
      CAN_OPEN_PREVIEW_CONTEXT,
      canPreview,
    );
  };

  context.subscriptions.push(
    commands.registerCommand("typeprompt.createPlayground", (uri?: Uri) =>
      handleCreatePlayground(uri, projectStore),
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
  projectStore: ProjectStore,
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

  const content = generateFileTemplate(playUri.fsPath, { projectStore }) ?? "";

  await workspace.fs.writeFile(playUri, Buffer.from(content, "utf8"));
  const openedDoc = await workspace.openTextDocument(playUri);
  await window.showTextDocument(openedDoc);
}

const IS_TEMPLATE_WITHOUT_PLAYGROUND_CONTEXT =
  "typeprompt.isTemplateWithoutPlayground";
const CAN_OPEN_PREVIEW_CONTEXT = "typeprompt.canOpenPreview";
