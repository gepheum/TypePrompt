import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";
import type { DefinitionLink } from "@typeprompt/core";
import { typepromptConfigFacet, typepromptStateField } from "./state-field.js";

/**
 * Finds the DefinitionLink at the given character offset in the document.
 */
export function findDefinitionAtPosition(
  state: EditorState,
  pos: number,
): DefinitionLink | null {
  const tpState = state.field(typepromptStateField, false);
  if (!tpState) return null;

  const currentPath = tpState.path;
  const links =
    tpState.compilationResult.pathToDefinitionLinks[currentPath] ?? [];

  // Check references in the current file
  return (
    links.find(
      (link) =>
        link.reference.path === currentPath &&
        link.reference.start <= pos &&
        pos <= link.reference.end &&
        // If already at the definition, there is nowhere to jump
        !(
          link.definition.path === currentPath &&
          link.definition.start <= pos &&
          pos <= link.definition.end
        ),
    ) ?? null
  );
}

/**
 * Jumps to the definition for the symbol at the given position (or current selection head).
 * If definition is in the same file, moves selection and centers the definition in view.
 * If definition is in a different file, invokes the optional onJumpToDefinition callback in TypePromptConfig.
 */
export function jumpToDefinition(view: EditorView, pos?: number): boolean {
  const targetPos = pos ?? view.state.selection.main.head;
  const link = findDefinitionAtPosition(view.state, targetPos);
  if (!link) {
    return false;
  }

  const currentPath = view.state.field(typepromptStateField, false)?.path;
  const targetDef = link.definition;

  // If definition is in the same file, update selection in current view and center vertically
  if (currentPath && targetDef.path === currentPath) {
    view.dispatch({
      selection: { anchor: targetDef.start, head: targetDef.end },
      effects: EditorView.scrollIntoView(targetDef.start, { y: "center" }),
      userEvent: "select",
    });
    return true;
  }

  // Definition is in a different file: invoke optional config callback
  const config = view.state.facet(typepromptConfigFacet);
  if (config.onJumpToDefinition) {
    config.onJumpToDefinition({
      path: targetDef.path,
      start: targetDef.start,
      end: targetDef.end,
      text: targetDef.text,
    });
  }

  return true;
}

export const jumpToDefinitionKeymap: readonly KeyBinding[] = [
  {
    key: "F12",
    run: (view): boolean => jumpToDefinition(view),
  },
  {
    key: "Mod-b",
    run: (view): boolean => jumpToDefinition(view),
  },
];

export const jumpToDefinitionClickHandlers: Extension =
  EditorView.domEventHandlers({
    mousedown(event: MouseEvent, view: EditorView): boolean {
      if (event.metaKey || event.ctrlKey) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos !== null && findDefinitionAtPosition(view.state, pos)) {
          event.preventDefault();
          return true;
        }
      }
      return false;
    },
    click(event: MouseEvent, view: EditorView): boolean {
      if (event.metaKey || event.ctrlKey) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos !== null) {
          if (jumpToDefinition(view, pos)) {
            event.preventDefault();
            return true;
          }
        }
      }
      return false;
    },
    mousemove(event: MouseEvent, view: EditorView): boolean {
      if (event.metaKey || event.ctrlKey) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos !== null && findDefinitionAtPosition(view.state, pos)) {
          view.dom.style.cursor = "pointer";
          return false;
        }
      }
      if (view.dom.style.cursor === "pointer") {
        view.dom.style.cursor = "";
      }
      return false;
    },
    keyup(event: KeyboardEvent, view: EditorView): boolean {
      if (!event.metaKey && !event.ctrlKey) {
        view.dom.style.cursor = "";
      }
      return false;
    },
  });

/**
 * Extension enabling jump-to-definition via F12, Mod-b, and Cmd/Ctrl-click.
 */
export function typepromptJumpToDefinition(): Extension {
  return [
    Prec.high(keymap.of(jumpToDefinitionKeymap)),
    jumpToDefinitionClickHandlers,
  ];
}
