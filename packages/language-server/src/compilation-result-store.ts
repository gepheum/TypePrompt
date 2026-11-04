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
  /** Map from project folder URI/path to its latest compilation result. */
  public get projects(): ReadonlyMap<string, WireCompilationResult> {
    return this.mutableProjects;
  }

  /**
   * Updates the store from an incoming LSP notification:
   * - Prunes projects that are no longer present in `results.projects`.
   * - Updates non-null compilation results for changed projects.
   */
  public handleNotification(results: WireCompilationResults): void {
    for (const projectPath of this.mutableProjects.keys()) {
      if (!(projectPath in results.projects)) {
        this.mutableProjects.delete(projectPath);
      }
    }

    for (const [projectPath, result] of Object.entries(results.projects)) {
      if (result) {
        this.mutableProjects.set(projectPath, result);
      }
    }
  }

  /**
   * Finds the compilation result for a given file URI or filesystem path
   * by matching the longest matching project folder prefix.
   */
  public getForFile(uriOrPath: string): WireCompilationResult | undefined {
    let bestMatch: WireCompilationResult | undefined;
    let longestPrefix = -1;

    for (const [projectPath, result] of this.projects) {
      if (
        uriOrPath.startsWith(projectPath) &&
        projectPath.length > longestPrefix
      ) {
        bestMatch = result;
        longestPrefix = projectPath.length;
      }
    }

    return bestMatch;
  }

  private readonly mutableProjects = new Map<string, WireCompilationResult>();
}
