import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { foldGutter } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import {
  typeprompt,
  yaml,
  type JumpToDefinitionTarget,
} from "@typeprompt/codemirror";
import { CONFIG, type ValidCompilationResult } from "@typeprompt/core";
import {
  typepromptDarkHighlight,
  typepromptEditorTheme,
} from "../view/editor-theme.js";

export function createPlaygroundEditorState(options: {
  readonly path: string;
  readonly content: string;
  readonly workspaceFiles: { readonly [path: string]: string };
  readonly patchBase: ValidCompilationResult | null;
  readonly onDocChange?: (newDoc: string, state: EditorState) => void;
  readonly onJumpToDefinition?: (target: JumpToDefinitionTarget) => void;
}): EditorState {
  const isYaml =
    options.path.endsWith(".yaml") || options.path.endsWith(".yml");

  const langExtension: Extension = isYaml
    ? yaml(CONFIG, { path: options.path })
    : typeprompt({
        path: options.path,
        workspaceFiles: options.workspaceFiles,
        patchBase: options.patchBase,
        onJumpToDefinition: options.onJumpToDefinition,
      });

  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    foldGutter(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    typepromptEditorTheme,
    typepromptDarkHighlight,
    langExtension,
  ];

  if (options.onDocChange) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          options.onDocChange!(update.state.doc.toString(), update.state);
        }
      }),
    );
  }

  return EditorState.create({
    doc: options.content,
    extensions,
  });
}
