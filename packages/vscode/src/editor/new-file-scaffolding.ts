import { Lsp } from "@typeprompt/core";
import * as path from "node:path";
import type { ExtensionContext, FileCreateEvent, Uri } from "vscode";
import { Position, workspace, WorkspaceEdit } from "vscode";
import type { LanguageClient } from "vscode-languageclient/node.js";

/**
 * Automatically populates newly created empty .tp and configuration files with initial
 * skeleton templates.
 */
export function activateNewFileScaffolding(
  context: ExtensionContext,
  getClient: () => LanguageClient | undefined,
): void {
  context.subscriptions.push(
    workspace.onDidCreateFiles((event) => onDidCreateFiles(event, getClient)),
  );
}

async function onDidCreateFiles(
  event: FileCreateEvent,
  getClient: () => LanguageClient | undefined,
): Promise<void> {
  for (const file of event.files) {
    await scaffoldNewFile(file, getClient);
  }
}

function isScaffoldableFile(file: Uri): boolean {
  const base = path.basename(file.fsPath);
  return (
    base.endsWith(".tp") ||
    base === "typeprompt.yaml" ||
    base === "typeprompt.yml" ||
    base === ".typeprompt.secrets.yaml" ||
    base === ".typeprompt.secrets.yml"
  );
}

async function scaffoldNewFile(
  file: Uri,
  getClient: () => LanguageClient | undefined,
): Promise<void> {
  if (!isScaffoldableFile(file)) return;

  try {
    // Skip if the file already has content on disk (e.g. copied or created externally)
    if ((await workspace.fs.stat(file)).size > 0) return;

    const template = await getTemplateForFile(file, getClient);
    if (template === null) return;

    const doc = workspace.textDocuments.find(
      (d) => d.uri.toString() === file.toString(),
    );

    if (doc) {
      // Abort if the user typed anything in the open editor while awaiting the template
      if (doc.getText().length > 0 || doc.isDirty) return;

      const edit = new WorkspaceEdit();
      edit.insert(file, new Position(0, 0), template);
      await workspace.applyEdit(edit);
      await doc.save();
    } else {
      // If not open in an editor tab, ensure disk is still empty before writing
      if ((await workspace.fs.stat(file)).size > 0) return;

      await workspace.fs.writeFile(file, Buffer.from(template, "utf8"));
    }
  } catch {
    // Ignore filesystem errors during scaffolding
  }
}

async function getTemplateForFile(
  file: Uri,
  getClient: () => LanguageClient | undefined,
): Promise<string | null> {
  const client = getClient();
  if (client) {
    try {
      // Prefer language server to take workspace compilation context into account
      const template = await client.sendRequest<string | null>(
        "typeprompt/getFileTemplate",
        { uri: file.toString() },
      );
      if (template !== null) return template;
    } catch {
      // Fall back to local template generation if LSP is not ready
    }
  }

  return Lsp.generateFileTemplate(file.fsPath, null);
}
