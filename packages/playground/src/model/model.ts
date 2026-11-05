import type { EditorState } from "@codemirror/state";
import type {
  CompilationResult,
  ValidCompilationResult,
} from "@typeprompt/core";
import type { PullSourcesResponse } from "../contract.js";

export type Activity = "files" | "inferences";

export type FileRole =
  "template" | "playground" | "tool" | "shared" | "meta" | "other";

export type MaybeModel =
  | { readonly initialized: false }
  | { readonly initialized: true; readonly model: Model };

export type Model = {
  /** Active set of sources pulled from the backend. */
  readonly pulledSources: PulledSources;
  /**
   * Latest set of sources pulled from the backend.
   * They are not actually 'active' until the user explicitly chooses to refresh the
   * sources.
   */
  readonly latestPullSourcesResponse: PullSourcesResponse;

  readonly editedSources: {
    readonly [path: string]: EditedSource;
  };
  /**
   * Result of compiling all the possibly-edited sources, with
   * `pulledSources.baseCompilationResult` set as the patch base.
   * Might contain errors.
   */
  readonly compilationResult: CompilationResult;

  /** Currently selected file path for editing. */
  readonly selectedFilePath: string;

  /** Active rail activity. */
  readonly activeActivity: Activity;
};

export type PulledSources = {
  readonly response: PullSourcesResponse;
  /**
   * Result of compiling the `response` sources.
   * Guaranteed to not contain any errors.
   */
  readonly baseCompilationResult: ValidCompilationResult;
};

export type EditedSource = {
  readonly path: string;
  readonly editorState: EditorState;
  readonly edited: boolean;
};

/**
 * Determines the role of a file in the project based on compilation result or file conventions.
 */
export function getFileRole(
  path: string,
  compilationResult?: CompilationResult,
): FileRole {
  const entity = compilationResult?.sourceFiles[path]?.entity;
  if (entity) {
    if (entity.kind === "template") return "template";
    if (entity.kind === "playground") return "playground";
    if (entity.kind === "tool") return "tool";
    if (entity.kind === "namespace") return "shared";
    if (entity.kind === "meta") return "meta";
  }
  if (path.endsWith(".play.tp")) return "playground";
  if (
    path.endsWith(".meta.tp") ||
    path.endsWith("/meta.tp") ||
    path === "meta.tp"
  ) {
    return "meta";
  }
  return "other";
}

/**
 * Human-readable badge label for each file role.
 */
export function getRoleBadgeLabel(role: FileRole): string {
  switch (role) {
    case "template":
      return "template";
    case "playground":
      return "play";
    case "tool":
      return "tool";
    case "shared":
      return "shared";
    case "meta":
      return "meta";
    case "other":
      return "file";
  }
}
