import type { EditorState } from "@codemirror/state";
import { compile, type ValidCompilationResult } from "@typeprompt/core";
import { createNanoEvents, type Emitter } from "nanoevents";
import type { PullSourcesResponse } from "../contract.js";
import { createPlaygroundEditorState } from "./editor-state-factory.js";
import type {
  Activity,
  EditedSource,
  MaybeModel,
  Model,
  PulledSources,
} from "./model.js";

export type PlaygroundEvents = {
  change: (model: Model) => void;
};

export class PlaygroundStore {
  private readonly emitter: Emitter<PlaygroundEvents> =
    createNanoEvents<PlaygroundEvents>();
  private maybeModel: MaybeModel = { initialized: false };

  get state(): MaybeModel {
    return this.maybeModel;
  }

  get model(): Model | null {
    return this.maybeModel.initialized ? this.maybeModel.model : null;
  }

  on<K extends keyof PlaygroundEvents>(
    event: K,
    cb: PlaygroundEvents[K],
  ): () => void {
    return this.emitter.on(event, cb);
  }

  /**
   * Initializes or updates the active model from a backend PullSourcesResponse.
   */
  init(response: PullSourcesResponse): void {
    const baseCompilationResult = compile(response.sourceFiles, {
      cache: null,
      patchBase: null,
    }) as ValidCompilationResult;

    const filePaths = Object.keys(response.sourceFiles).sort((a, b) =>
      a.localeCompare(b),
    );

    const prevModel = this.model;
    const selectedFilePath =
      prevModel && filePaths.includes(prevModel.selectedFilePath)
        ? prevModel.selectedFilePath
        : (filePaths[0] ?? "");

    const pulledSources: PulledSources = {
      response,
      baseCompilationResult,
    };

    const editedSources: Record<string, EditedSource> = {};
    for (const [filePath, content] of Object.entries(response.sourceFiles)) {
      const editorState = createPlaygroundEditorState({
        path: filePath,
        content,
        workspaceFiles: response.sourceFiles,
        patchBase: baseCompilationResult,
        onDocChange: (newDoc, state): void =>
          this.updateFileContent(filePath, newDoc, state),
        onJumpToDefinition: (target): void => {
          if (target.path !== filePath) {
            this.jumpToFile(target.path, {
              start: target.start,
              end: target.end,
            });
          }
        },
      });

      editedSources[filePath] = {
        path: filePath,
        editorState,
        edited: false,
      };
    }

    const newModel: Model = {
      pulledSources,
      latestPullSourcesResponse: response,
      editedSources,
      compilationResult: baseCompilationResult,
      selectedFilePath,
      activeActivity: prevModel ? prevModel.activeActivity : "files",
    };

    this.maybeModel = {
      initialized: true,
      model: newModel,
    };

    this.emitter.emit("change", newModel);
  }

  /**
   * Selects a file to edit.
   */
  selectFile(filePath: string): void {
    const current = this.model;
    if (!current) return;
    if (current.selectedFilePath === filePath) return;
    if (!current.editedSources[filePath]) return;

    const updatedModel: Model = {
      ...current,
      selectedFilePath: filePath,
    };

    this.maybeModel = { initialized: true, model: updatedModel };
    this.emitter.emit("change", updatedModel);
  }

  /**
   * Sets the active activity in the left activity rail ("files" | "inferences").
   */
  setActivity(activity: Activity): void {
    const current = this.model;
    if (!current || current.activeActivity === activity) return;

    const updatedModel: Model = {
      ...current,
      activeActivity: activity,
    };

    this.maybeModel = { initialized: true, model: updatedModel };
    this.emitter.emit("change", updatedModel);
  }

  /**
   * Jumps to a target file (e.g. from jump-to-definition) and optionally sets selection range.
   */
  jumpToFile(
    targetPath: string,
    selection?: { readonly start: number; readonly end: number },
  ): void {
    const current = this.model;
    if (!current) return;

    let updatedEditedSources = current.editedSources;
    const targetSource = current.editedSources[targetPath];
    if (targetSource && selection) {
      const docLength = targetSource.editorState.doc.length;
      const anchor = Math.max(0, Math.min(docLength, selection.start));
      const head = Math.max(0, Math.min(docLength, selection.end));
      const newEditorState = targetSource.editorState.update({
        selection: { anchor, head },
      }).state;

      updatedEditedSources = {
        ...current.editedSources,
        [targetPath]: {
          ...targetSource,
          editorState: newEditorState,
        },
      };
    }

    const updatedModel: Model = {
      ...current,
      selectedFilePath: targetPath,
      activeActivity: "files",
      editedSources: updatedEditedSources,
    };

    this.maybeModel = { initialized: true, model: updatedModel };
    this.emitter.emit("change", updatedModel);
  }

  /**
   * Updates an edited file content and re-compiles incrementally against the base.
   */
  updateFileContent(
    filePath: string,
    newDoc: string,
    newEditorState: EditorState,
  ): void {
    const current = this.model;
    if (!current) return;

    const initialContent =
      current.pulledSources.response.sourceFiles[filePath] ?? "";
    const isEdited = newDoc !== initialContent;

    const updatedEditedSources: Record<string, EditedSource> = {
      ...current.editedSources,
      [filePath]: {
        path: filePath,
        editorState: newEditorState,
        edited: isEdited,
      },
    };

    const allCurrentFiles: Record<string, string> = {};
    for (const [p, es] of Object.entries(updatedEditedSources)) {
      allCurrentFiles[p] =
        p === filePath ? newDoc : es.editorState.doc.toString();
    }

    const compilationResult = compile(allCurrentFiles, {
      cache: current.compilationResult,
      patchBase: current.pulledSources.baseCompilationResult,
    });

    const updatedModel: Model = {
      ...current,
      editedSources: updatedEditedSources,
      compilationResult,
    };

    this.maybeModel = { initialized: true, model: updatedModel };
    this.emitter.emit("change", updatedModel);
  }

  /**
   * Reverts a modified file back to its disk content.
   */
  revertFile(filePath: string): void {
    const current = this.model;
    if (!current) return;

    const originalContent =
      current.pulledSources.response.sourceFiles[filePath] ?? "";

    const allWorkspaceFiles: Record<string, string> = {};
    for (const [p, es] of Object.entries(current.editedSources)) {
      allWorkspaceFiles[p] =
        p === filePath ? originalContent : es.editorState.doc.toString();
    }

    const newEditorState = createPlaygroundEditorState({
      path: filePath,
      content: originalContent,
      workspaceFiles: allWorkspaceFiles,
      patchBase: current.pulledSources.baseCompilationResult,
      onDocChange: (newDoc, state): void =>
        this.updateFileContent(filePath, newDoc, state),
      onJumpToDefinition: (target): void => {
        if (target.path !== filePath) {
          this.jumpToFile(target.path, {
            start: target.start,
            end: target.end,
          });
        }
      },
    });

    const updatedEditedSources: Record<string, EditedSource> = {
      ...current.editedSources,
      [filePath]: {
        path: filePath,
        editorState: newEditorState,
        edited: false,
      },
    };

    const compilationResult = compile(allWorkspaceFiles, {
      cache: current.compilationResult,
      patchBase: current.pulledSources.baseCompilationResult,
    });

    const updatedModel: Model = {
      ...current,
      editedSources: updatedEditedSources,
      compilationResult,
    };

    this.maybeModel = { initialized: true, model: updatedModel };
    this.emitter.emit("change", updatedModel);
  }

  /**
   * Notifies the store of a new backend response without replacing active edits.
   */
  updateLatestResponse(response: PullSourcesResponse): void {
    const current = this.model;
    if (!current) {
      this.init(response);
      return;
    }

    const hasAnyEdits = Object.values(current.editedSources).some(
      (es) => es.edited,
    );

    // If the user hasn't edited anything, we can seamlessly auto-sync with disk
    if (!hasAnyEdits) {
      this.init(response);
      return;
    }

    const updatedModel: Model = {
      ...current,
      latestPullSourcesResponse: response,
    };

    this.maybeModel = { initialized: true, model: updatedModel };
    this.emitter.emit("change", updatedModel);
  }

  /**
   * Explicitly re-syncs active sources with the latest response from disk.
   */
  syncWithDisk(): void {
    const current = this.model;
    if (!current) return;
    this.init(current.latestPullSourcesResponse);
  }
}
