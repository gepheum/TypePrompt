import { Prec, type EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  ViewPlugin,
  type KeyBinding,
} from "@codemirror/view";
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
 * Finds the DefinitionLink at the given screen coordinates in the view.
 * Ensures that the coordinates actually lie within the bounding box of the reference,
 * avoiding false matches in the empty whitespace to the right or left of a line.
 */
export function findDefinitionAtCoords(
  view: EditorView,
  coords: { x: number; y: number },
): DefinitionLink | null {
  const pos = view.posAtCoords(coords);
  if (pos === null) return null;

  const link = findDefinitionAtPosition(view.state, pos);
  if (!link) return null;

  // Verify that the mouse coordinates are physically within the reference's bounding box
  if (typeof view.coordsAtPos === "function") {
    const startRect = view.coordsAtPos(link.reference.start, 1);
    const endRect = view.coordsAtPos(link.reference.end, -1);
    if (startRect && endRect) {
      const padding = 2;
      const left = Math.min(startRect.left, endRect.left) - padding;
      const right = Math.max(startRect.right, endRect.right) + padding;
      const top = Math.min(startRect.top, endRect.top) - padding;
      const bottom = Math.max(startRect.bottom, endRect.bottom) + padding;

      if (
        coords.x < left ||
        coords.x > right ||
        coords.y < top ||
        coords.y > bottom
      ) {
        return null;
      }
    }
  }

  return link;
}

/**
 * Jumps to the definition for the symbol at the given position (or current selection head),
 * or for the provided DefinitionLink.
 * If definition is in the same file, moves selection and centers the definition in view.
 * If definition is in a different file, invokes the optional onJumpToDefinition callback in TypePromptConfig.
 */
export function jumpToDefinition(
  view: EditorView,
  target?: number | DefinitionLink,
): boolean {
  let link: DefinitionLink | null = null;
  if (typeof target === "object" && target !== null) {
    link = target;
  } else {
    const targetPos = target ?? view.state.selection.main.head;
    link = findDefinitionAtPosition(view.state, targetPos);
  }
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

export class JumpToDefinitionHoverPlugin {
  lastCoords: { x: number; y: number } | null = null;

  readonly onKeyDown = (e: KeyboardEvent): void => {
    if (
      (e.key === "Meta" || e.key === "Control" || e.metaKey || e.ctrlKey) &&
      this.lastCoords
    ) {
      const link = findDefinitionAtCoords(this.view, this.lastCoords);
      if (link) {
        this.view.dom.style.cursor = "pointer";
      }
    }
  };

  readonly onKeyUp = (e: KeyboardEvent): void => {
    if (
      (!e.metaKey && !e.ctrlKey) ||
      (!e.metaKey && e.key === "Meta") ||
      (!e.ctrlKey && e.key === "Control")
    ) {
      if (this.view.dom.style.cursor === "pointer") {
        this.view.dom.style.cursor = "";
      }
    }
  };

  readonly onBlur = (): void => {
    this.lastCoords = null;
    if (this.view.dom.style.cursor === "pointer") {
      this.view.dom.style.cursor = "";
    }
  };

  constructor(readonly view: EditorView) {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.onKeyDown);
      window.addEventListener("keyup", this.onKeyUp);
      window.addEventListener("blur", this.onBlur);
    }
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("keyup", this.onKeyUp);
      window.removeEventListener("blur", this.onBlur);
    }
    this.lastCoords = null;
    if (this.view.dom.style.cursor === "pointer") {
      this.view.dom.style.cursor = "";
    }
  }
}

export const jumpToDefinitionClickHandlers: Extension = ViewPlugin.fromClass(
  JumpToDefinitionHoverPlugin,
  {
    eventHandlers: {
      mousedown(event: MouseEvent, view: EditorView): boolean {
        if (event.metaKey || event.ctrlKey) {
          const link = findDefinitionAtCoords(view, {
            x: event.clientX,
            y: event.clientY,
          });
          if (link) {
            event.preventDefault();
            return true;
          }
        }
        return false;
      },
      click(event: MouseEvent, view: EditorView): boolean {
        if (event.metaKey || event.ctrlKey) {
          const link = findDefinitionAtCoords(view, {
            x: event.clientX,
            y: event.clientY,
          });
          if (link) {
            if (jumpToDefinition(view, link)) {
              event.preventDefault();
              return true;
            }
          }
        }
        return false;
      },
      mousemove(event: MouseEvent, view: EditorView): boolean {
        this.lastCoords = { x: event.clientX, y: event.clientY };
        if (event.metaKey || event.ctrlKey) {
          const link = findDefinitionAtCoords(view, this.lastCoords);
          if (link) {
            view.dom.style.cursor = "pointer";
            return false;
          }
        }
        if (view.dom.style.cursor === "pointer") {
          view.dom.style.cursor = "";
        }
        return false;
      },
      mouseleave(_event: MouseEvent, view: EditorView): boolean {
        this.lastCoords = null;
        if (view.dom.style.cursor === "pointer") {
          view.dom.style.cursor = "";
        }
        return false;
      },
    },
  },
);

/**
 * Extension enabling jump-to-definition via F12, Mod-b, and Cmd/Ctrl-click.
 */
export function typepromptJumpToDefinition(): Extension {
  return [
    Prec.high(keymap.of(jumpToDefinitionKeymap)),
    jumpToDefinitionClickHandlers,
  ];
}
