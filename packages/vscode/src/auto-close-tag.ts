import { parseXmlDocument } from "@typeprompt/core";
import type { ExtensionContext, TextDocumentChangeEvent } from "vscode";
import { SnippetString, window, workspace } from "vscode";

export function activateAutoCloseTag(context: ExtensionContext): void {
  context.subscriptions.push(
    workspace.onDidChangeTextDocument(onDocumentChange),
  );
}

function onDocumentChange(event: TextDocumentChangeEvent): void {
  const { document, contentChanges } = event;
  if (document.languageId !== "xml" && !document.fileName.endsWith(".xml")) {
    return;
  }

  const editor = window.activeTextEditor;
  if (!editor || editor.document !== document) {
    return;
  }

  if (contentChanges.length !== 1) {
    return;
  }

  const change = contentChanges[0];
  if (!change || change.text !== ">") {
    return;
  }

  // The position immediately after the inserted '>'
  const insertPosition = change.range.start.translate(0, 1);
  const offset = document.offsetAt(insertPosition);

  const parsed = parseXmlDocument(document.getText(), document.uri.fsPath);
  if (parsed.kind !== "error") {
    return;
  }

  const suggestion = parsed.closingTagSuggestions.find(
    (s) => s.position === offset,
  );
  if (!suggestion) {
    return;
  }

  const snippet = new SnippetString(`$0</${suggestion.tagName}>`);
  editor.insertSnippet(snippet, insertPosition, {
    undoStopBefore: false,
    undoStopAfter: false,
  });
}
