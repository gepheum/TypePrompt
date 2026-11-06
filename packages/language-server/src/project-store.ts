import type { Lsp } from "@typeprompt/core";

/**
 * Client-side store that maintains the latest `Lsp.WireProject` for each project.
 *
 * Updated reactively whenever `typeprompt/compilationResult` notifications are received
 * from the language server.
 */
export class ProjectStore {
  /** Map from project folder URI to its latest project data. */
  public readonly projects = new Map<string, Lsp.WireProject>();

  /**
   * Updates the store from an incoming LSP notification:
   * - Prunes projects that are no longer present in `results.projects`.
   * - Updates non-null projects for changed projects.
   */
  public handleNotification(results: Lsp.WireProjects): void {
    for (const folderUri of this.projects.keys()) {
      if (!(folderUri in results.projects)) {
        this.projects.delete(folderUri);
      }
    }

    for (const [folderUri, project] of Object.entries(results.projects)) {
      if (project) {
        this.projects.set(folderUri, project);
      }
    }
  }

  /**
   * Finds the project data and relative path for a given file URI
   * by matching the longest matching project folder prefix.
   */
  public findByUri(fileUri: string): {
    project: Lsp.WireProject;
    relativePath: string;
  } | null {
    let bestMatch: {
      project: Lsp.WireProject;
      relativePath: string;
    } | null = null;
    let longestPrefix = -1;

    for (const [folderUri, project] of this.projects) {
      const normalizedFolderUri = folderUri.endsWith("/")
        ? folderUri
        : `${folderUri}/`;

      if (
        fileUri.startsWith(normalizedFolderUri) &&
        normalizedFolderUri.length > longestPrefix
      ) {
        const relativePath = fileUri.slice(normalizedFolderUri.length);
        bestMatch = {
          project,
          relativePath,
        };
        longestPrefix = normalizedFolderUri.length;
      }
    }

    return bestMatch;
  }
}
