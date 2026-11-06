import type { ProjectStore } from "@typeprompt/language-server";
import * as path from "node:path";
import type { ExtensionContext, FileCreateEvent, Uri } from "vscode";
import { Position, workspace, WorkspaceEdit } from "vscode";
import { generateFileTemplate } from "./file-template.js";

/**
 * Automatically populates newly created empty .tp and configuration files with initial
 * skeleton templates.
 */
export function activateNewFileScaffolding(
  context: ExtensionContext,
  projectStore: ProjectStore,
): void {
  context.subscriptions.push(
    workspace.onDidCreateFiles((event) =>
      onDidCreateFiles(event, projectStore),
    ),
  );
}

async function onDidCreateFiles(
  event: FileCreateEvent,
  projectStore: ProjectStore,
): Promise<void> {
  for (const file of event.files) {
    await scaffoldNewFile(file, projectStore);
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
  projectStore: ProjectStore,
): Promise<void> {
  if (!isScaffoldableFile(file)) return;

  try {
    // Skip if the file already has content on disk (e.g. copied or created externally)
    if ((await workspace.fs.stat(file)).size > 0) return;

    const template = generateFileTemplate(file.fsPath, { projectStore });
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
