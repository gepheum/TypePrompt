import type { Lsp } from "@typeprompt/core";
import type { ProjectStore } from "@typeprompt/language-server";

export function isPlaygroundFile(
  document: DocumentLike,
  projectStore: ProjectStore,
): boolean {
  return getEntityKind(document, projectStore) === "playground";
}

export function isTemplateFile(
  document: DocumentLike,
  projectStore: ProjectStore,
): boolean {
  return getEntityKind(document, projectStore) === "template";
}

export function canOpenPreview(
  document: DocumentLike,
  projectStore: ProjectStore,
): boolean {
  return isPlaygroundFile(document, projectStore);
}

function getEntityKind(
  document: DocumentLike,
  projectStore: ProjectStore,
): Lsp.WireSourceFileEntity["kind"] | undefined {
  if (!document.fileName.endsWith(".tp")) {
    return undefined;
  }
  const match = projectStore.findByUri(document.uri.toString());
  if (!match) {
    return undefined;
  }
  const sourceFile =
    match.project.compilationResult.sourceFiles[match.relativePath];
  return sourceFile?.entity?.kind;
}

type DocumentLike = {
  readonly uri: { toString(): string };
  readonly fileName: string;
};
