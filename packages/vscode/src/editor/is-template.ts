import { DEFAULT_NAMESPACE } from "@typeprompt/core";
import type { ProjectStore } from "@typeprompt/language-server";

export function isPlaygroundFile(
  document: {
    readonly uri: { toString(): string };
    readonly fileName: string;
  },
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
  return sourceFile?.entity?.kind === "playground";
}

export function isTemplateFile(
  document: {
    readonly uri: { toString(): string };
    readonly fileName: string;
  },
  projectStore: ProjectStore,
): false | "with-playground" | "no-playground" {
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
    return "with-playground";
  } else {
    return "no-playground";
  }
}

export function canOpenPreview(
  document: {
    readonly uri: { toString(): string };
    readonly fileName: string;
  },
  projectStore: ProjectStore,
): boolean {
  return (
    isPlaygroundFile(document, projectStore) ||
    isTemplateFile(document, projectStore) === "with-playground"
  );
}
