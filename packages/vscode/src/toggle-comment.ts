import { Lsp } from "@typeprompt/core";
import * as path from "node:path";
import type { ExtensionContext, TextDocument } from "vscode";
import { commands, Range, Selection, window } from "vscode";

export function activateToggleComment(context: ExtensionContext): void {
  context.subscriptions.push(
    commands.registerCommand("typeprompt.toggleComment", onToggleComment),
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

async function onToggleComment(): Promise<void> {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  if (!isHandledDocument(document)) {
    await commands.executeCommand("editor.action.commentLine");
    return;
  }

  const content = document.getText();
  const selections = editor.selections;
  if (selections.length === 0) {
    return;
  }

  const isYaml =
    document.fileName.endsWith(".yaml") || document.fileName.endsWith(".yml");

  const results = selections.map((sel) => {
    const from = document.offsetAt(sel.start);
    const to = document.offsetAt(sel.end);
    const action = Lsp.computeToggleComment(
      content,
      { from, to },
      { format: isYaml ? "yaml" : "template" },
    );
    return {
      action,
      isReversed: sel.isReversed,
    };
  });

  const allChanges = results.flatMap((r) => r.action.changes);
  if (allChanges.length === 0) {
    return;
  }

  // Sort descending by offset so that edits don't invalidate previous offsets
  allChanges.sort((a, b) => b.from - a.from);

  await editor.edit(
    (editBuilder) => {
      for (const change of allChanges) {
        const start = document.positionAt(change.from);
        const end = document.positionAt(change.to);
        editBuilder.replace(new Range(start, end), change.insert);
      }
    },
    { undoStopBefore: true, undoStopAfter: true },
  );

  const updatedDoc = editor.document;
  const newSelections = results.map((r) => {
    const startPos = updatedDoc.positionAt(r.action.targetSelection.from);
    const endPos = updatedDoc.positionAt(r.action.targetSelection.to);
    return r.isReversed
      ? new Selection(endPos, startPos)
      : new Selection(startPos, endPos);
  });
  editor.selections = newSelections;
}
