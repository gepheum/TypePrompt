import { DEFAULT_NAMESPACE } from "@typeprompt/core";
import type { ProjectStore } from "@typeprompt/language-server";

export interface DocumentInfo {
  readonly uri: { toString(): string };
  readonly fileName: string;
}

export function isTemplateWithoutPlayground(
  document: DocumentInfo,
  projectStore: ProjectStore,
): boolean {
  if (!document.fileName.endsWith(".tp")) {
    return false;
  }
  const match = projectStore.findByUri(document.uri.toString());
  if (!match) {
    return false;
  }

  const sourceFile =
    match.project.compilationResult.sourceFiles[match.relativePath];

  if (sourceFile?.entity?.kind !== "template") {
    return false;
  }

  const templateName = sourceFile.entity.name;
  const templateNamespace = sourceFile.entity.namespace ?? DEFAULT_NAMESPACE;
  const id = `${templateNamespace}:${templateName}`;

  if (match.project.compilationResult.playgrounds[id]) {
    return false;
  }

  const expectedPlayPath = match.relativePath.replace(/\.tp$/, ".play.tp");
  if (match.project.compilationResult.sourceFiles[expectedPlayPath]) {
    return false;
  }

  return true;
}
