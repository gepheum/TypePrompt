import {
  getAutoCloseCommentAction,
  getAutoCloseTagAction,
} from "@typeprompt/core";
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
  if (!change) {
    return;
  }

  if (change.text === ">") {
    // The position immediately after the inserted '>'
    const insertPosition = change.range.start.translate(0, 1);
    const offset = document.offsetAt(insertPosition);

    const closingTag = getAutoCloseTagAction(document.getText(), offset);
    if (!closingTag) {
      return;
    }

    const snippet = new SnippetString(`$0${closingTag}`);
    editor.insertSnippet(snippet, insertPosition, {
      undoStopBefore: false,
      undoStopAfter: false,
    });
    return;
  }

  if (change.text === "*") {
    const insertPosition = change.range.start.translate(0, 1);
    const offset = document.offsetAt(insertPosition);
    const text = document.getText();
    if (offset >= 2 && text.slice(offset - 2, offset) === "/*") {
      const fullTextBeforeStar = text.slice(0, offset - 1) + text.slice(offset);
      const action = getAutoCloseCommentAction(
        fullTextBeforeStar,
        offset - 1,
        "*",
      );
      if (action) {
        const snippet = new SnippetString(" $0*/");
        editor.insertSnippet(snippet, insertPosition, {
          undoStopBefore: false,
          undoStopAfter: false,
        });
      }
    }
  }
}
