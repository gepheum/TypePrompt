import { CompilationResult, ValidCompilationResult } from "../../../core/dist/index.js";
import { PullSourcesResponse } from "../contract.js";
import type { EditorState } from "@codemirror/state";

export type MaybeModel =
  | { readonly initialized: false }
  | { readonly initialized: true; readonly model: Model; };

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

  readonly templateSelections: {
    readonly [templatePath: string]: TemplateSelection;
  };
};

export type PulledSources = {
  readonly response: PullSourcesResponse;
  /**
   * Result of compiling the `response` sources.
   * Guaranteed to not contain any errors.
   */
  readonly baseCompilationResult: ValidCompilationResult;
  readonly templateGroups: { readonly [templatePath: string]: TemplateGroup };
};

export type TemplateGroup = {
  /** Path to the files containing the <template>. */
  readonly templatePath: string;
  /** Path to the files containing the <tool> elements used by the template . */
  readonly toolPaths: readonly string[];
  /** Path to the file containing the <namespace> if any. */
  readonly namespacePath: string | null;
  /** Path to the file containing the <meta> if any. */
  readonly metaPath: string | null;
};

export type EditedSource = {
  readonly path: string;
  readonly editorState: EditorState;
  readonly edited: boolean;
};

export type TemplateSelection = {
  readonly templateGroup: TemplateGroup;
  readonly datasetSelection: DatasetSelection;
  readonly modelSelection: ModelSelection;
};

export type DatasetSelection = {
  readonly todo: null;
};
export type ModelSelection = {
  readonly todo: null;
};

