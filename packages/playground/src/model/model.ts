import type { EditorState } from "@codemirror/state";
import type {
  CompilationResult,
  ValidCompilationResult,
} from "@typeprompt/core";
import type { PullSourcesResponse } from "../contract.js";

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

  readonly templateSelections: {
    readonly [templatePath: string]: TemplateSelection;
  };

  /** Currently selected template path. */
  readonly selectedTemplatePath: string;

  /** Currently selected file path for editing. */
  readonly selectedFilePath: string;

  /** Current active step in the 4-stage pipeline flow (1 = Template, etc.). */
  readonly activeStep: number;
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
  readonly selectedFilePath: string;
  readonly datasetSelection: DatasetSelection;
  readonly modelSelection: ModelSelection;
};

export type DatasetSelection = {
  readonly todo: null;
};

export type ModelSelection = {
  readonly todo: null;
};

/**
 * Returns all distinct file paths associated with a TemplateGroup.
 * The templatePath is always the first item in the returned array.
 */
export function getTemplateGroupPaths(group: TemplateGroup): readonly string[] {
  const paths: string[] = [group.templatePath];
  for (const toolPath of group.toolPaths) {
    if (!paths.includes(toolPath)) {
      paths.push(toolPath);
    }
  }
  if (group.namespacePath && !paths.includes(group.namespacePath)) {
    paths.push(group.namespacePath);
  }
  if (group.metaPath && !paths.includes(group.metaPath)) {
    paths.push(group.metaPath);
  }
  return paths;
}

/**
 * Returns a human-friendly role label for a file path in a TemplateGroup.
 */
export function getFilePathLabel(path: string, group: TemplateGroup): string {
  if (path === group.templatePath) {
    return `${path} (Template)`;
  }
  if (group.toolPaths.includes(path)) {
    return `${path} (Tool)`;
  }
  if (path === group.namespacePath) {
    return `${path} (Namespace)`;
  }
  if (path === group.metaPath) {
    return `${path} (Meta)`;
  }
  return path;
}

/**
 * Builds the record of TemplateGroups from a ValidCompilationResult.
 */
export function buildTemplateGroups(
  compilationResult: ValidCompilationResult,
): { readonly [templatePath: string]: TemplateGroup } {
  const groups: Record<string, TemplateGroup> = {};

  const toolFiles: { name: string; namespace: string; path: string }[] = [];
  const namespaceFiles: { name: string; path: string }[] = [];
  let metaPath: string | null = null;

  for (const [filePath, sourceFile] of Object.entries(
    compilationResult.sourceFiles,
  )) {
    const entity = sourceFile.entity;
    if (!entity) continue;

    if (entity.kind === "tool") {
      const toolNamespace = entity.namespace?.text ?? "Main";
      toolFiles.push({
        name: entity.name.text,
        namespace: toolNamespace,
        path: filePath,
      });
    } else if (entity.kind === "namespace") {
      namespaceFiles.push({
        name: entity.name.text,
        path: filePath,
      });
    } else if (entity.kind === "meta") {
      metaPath = filePath;
    }
  }

  for (const validTemplate of Object.values(compilationResult.templates)) {
    const template = validTemplate.template;
    const templatePath = template.sourcePath;
    const templateNamespace = template.namespace?.text ?? "Main";

    const toolPaths: string[] = [];
    for (const toolName of Object.keys(validTemplate.tools)) {
      const matchingTool = toolFiles.find(
        (tf) =>
          tf.name === toolName &&
          (tf.namespace === templateNamespace || tf.namespace === "Main"),
      );
      if (matchingTool && !toolPaths.includes(matchingTool.path)) {
        toolPaths.push(matchingTool.path);
      }
    }
    toolPaths.sort();

    const matchingNs = namespaceFiles.find(
      (nf) => nf.name === templateNamespace,
    );
    const namespacePath = matchingNs ? matchingNs.path : null;

    groups[templatePath] = {
      templatePath,
      toolPaths,
      namespacePath,
      metaPath,
    };
  }

  // Also include any top-level template source files that might not be in templates map
  for (const [filePath, sourceFile] of Object.entries(
    compilationResult.sourceFiles,
  )) {
    if (sourceFile.entity?.kind === "template" && !groups[filePath]) {
      groups[filePath] = {
        templatePath: filePath,
        toolPaths: [],
        namespacePath: null,
        metaPath,
      };
    }
  }

  return groups;
}
