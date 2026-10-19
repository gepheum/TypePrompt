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
    const insertOffset =
      document.offsetAt(change.range.start) + change.text.length;
    const insertPosition = document.positionAt(insertOffset);

    const closingTag = getAutoCloseTagAction(document.getText(), insertOffset);
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

  if (
    change.text === "*" ||
    change.text === "/*" ||
    change.text === "-" ||
    change.text === "<!--"
  ) {
    const insertOffset =
      document.offsetAt(change.range.start) + change.text.length;
    const insertPosition = document.positionAt(insertOffset);
    const text = document.getText();
    const offsetBeforeChange = insertOffset - change.text.length;
    const fullTextBeforeChange =
      text.slice(0, offsetBeforeChange) + text.slice(insertOffset);
    const action = getAutoCloseCommentAction(
      fullTextBeforeChange,
      offsetBeforeChange,
      change.text,
    );
    if (action) {
      const suffix = action.insert.slice(change.text.length);
      const snippet = new SnippetString(`$0${suffix}`);
      editor.insertSnippet(snippet, insertPosition, {
        undoStopBefore: false,
        undoStopAfter: false,
      });
    }
  }
}
