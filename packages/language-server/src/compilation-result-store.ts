import type {
  WireCompilationResult,
  WireCompilationResults,
} from "./wire-compilation-result.js";

/**
 * Client-side store that maintains the latest `WireCompilationResult` for each project.
 *
 * Updated reactively whenever `typeprompt/compilationResult` notifications are received
 * from the language server.
 */
export class CompilationResultStore {
  /** Map from project folder URI to its latest compilation result. */
  public readonly projects = new Map<string, WireCompilationResult>();

  /**
   * Updates the store from an incoming LSP notification:
   * - Prunes projects that are no longer present in `results.projects`.
   * - Updates non-null compilation results for changed projects.
   */
  public handleNotification(results: WireCompilationResults): void {
    for (const folderUri of this.projects.keys()) {
      if (!(folderUri in results.projects)) {
        this.projects.delete(folderUri);
      }
    }

    for (const [folderUri, result] of Object.entries(results.projects)) {
      if (result) {
        this.projects.set(folderUri, result);
      }
    }
  }

  /**
   * Finds the compilation result for a given file URI
   * by matching the longest matching project folder prefix.
   */
  public getForFile(fileUri: string): WireCompilationResult | undefined {
    let bestMatch: WireCompilationResult | undefined;
    let longestPrefix = -1;

    for (const [folderUri, result] of this.projects) {
      if (fileUri.startsWith(folderUri) && folderUri.length > longestPrefix) {
        bestMatch = result;
        longestPrefix = folderUri.length;
      }
    }

    return bestMatch;
  }
}
