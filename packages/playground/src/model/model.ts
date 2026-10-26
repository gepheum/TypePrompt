import { ValidCompilationResult } from "../../../core/dist/index.js";
import { PullSourcesResponse } from "../contract.js";
import type { EditorState } from "@codemirror/state";

export type MaybeModel =
  | { readonly initialized: false }
  | { readonly initialized: true; readonly model: Model; };

export type Model = {
  readonly pullSourceResponse: {
    readonly active: PullSourcesResponse;
    readonly latest: PullSourcesResponse;
  };

  /** Result of compiling the 'active' sources. */
  readonly baseCompilationResult: ValidCompilationResult;

  readonly sources: {
    readonly [path: string]: SourceBundle;
  };

  readonly flow: Flow;
};

export type SourceBundle = {
  readonly path: string;
  readonly editorState: EditorState;
  readonly edited: boolean;
};

export type Flow =
  | { readonly templateSelection: null };

