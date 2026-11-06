import { Lsp } from "@typeprompt/core";
import * as path from "node:path";
import type { ExtensionContext, TextDocument } from "vscode";
import { commands, Range, Selection, window } from "vscode";

export function activateEnterHandler(context: ExtensionContext): void {
  context.subscriptions.push(
    commands.registerCommand("typeprompt.onEnterKey", onEnterKey),
  );
}

function isHandledDocument(document: TextDocument): boolean {
  if (
    document.languageId === "typeprompt" ||
    document.fileName.endsWith(".tp")
  ) {
    return true;
  }
  const base = path.basename(document.fileName);
  return (
    base === "typeprompt.yaml" ||
    base === "typeprompt.yml" ||
    base === ".typeprompt.secrets.yaml" ||
    base === ".typeprompt.secrets.yml"
  );
}

async function onEnterKey(): Promise<void> {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  if (!isHandledDocument(document)) {
    await commands.executeCommand("type", { text: "\n" });
    return;
  }

  // If there are multiple cursors or an active selection range, fall back to default type
  if (editor.selections.length > 1 || !editor.selection.isEmpty) {
    await commands.executeCommand("type", { text: "\n" });
    return;
  }

  const selection = editor.selection;
  const offset = document.offsetAt(selection.active);
  const tabSize =
    typeof editor.options.tabSize === "number" ? editor.options.tabSize : 2;
  const insertSpaces = editor.options.insertSpaces !== false;

  const isYaml =
    document.fileName.endsWith(".yaml") || document.fileName.endsWith(".yml");

  const action = Lsp.computeEnterAction(document.getText(), offset, {
    tabSize,
    insertSpaces,
    format: isYaml ? "yaml" : "template",
  });

  if (action.handled) {
    await editor.edit(
      (editBuilder) => {
        for (const change of action.changes) {
          const start = document.positionAt(change.from);
          const end = document.positionAt(change.to);
          editBuilder.replace(new Range(start, end), change.insert);
        }
      },
      { undoStopBefore: true, undoStopAfter: true },
    );
    const targetPos = document.positionAt(action.targetCursorOffset);
    editor.selection = new Selection(targetPos, targetPos);
  } else {
    await commands.executeCommand("type", { text: "\n" });
  }
}
