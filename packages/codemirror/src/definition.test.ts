import {
  EditorState,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, it } from "mocha";
import assert from "node:assert";
import {
  findDefinitionAtCoords,
  jumpToDefinitionHoverField,
  JumpToDefinitionHoverPlugin,
  setHoverLinkEffect,
} from "./definition.js";
import {
  findDefinitionAtPosition,
  jumpToDefinition,
  typeprompt,
} from "./index.js";
import type { JumpToDefinitionTarget } from "./types.js";

const RESEARCH_QUESTION_TP = `<template name="ResearchQuestion">
  <schema>
    interface Input {
      question: string;
    }
    type Output = string;
  </schema>

  <tools>
    <tool name="webSearch" />
  </tools>

  <system>
    You are a researcher. Use the <c>webSearch</c> tool.
  </system>

  <user>
    <insert val="input.question" />
  </user>
</template>
`;

const WEB_SEARCH_TP = `<tool name="webSearch">
  <description>Searches the web</description>
  <schema>
    type Input = { query: string; };
    type Output = { results: string[]; };
  </schema>
</tool>
`;

describe("CodeMirror jump-to-definition", () => {
  it("finds definition link for cross-file tool reference", () => {
    const state = EditorState.create({
      doc: RESEARCH_QUESTION_TP,
      extensions: [
        typeprompt({
          path: "prompts/ResearchQuestion.tp",
          workspaceFiles: {
            "prompts/webSearch.tp": WEB_SEARCH_TP,
          },
          patchBase: null,
        }),
      ],
    });

    const toolRefOffset = RESEARCH_QUESTION_TP.indexOf("webSearch");
    assert.ok(toolRefOffset > 0);

    const link = findDefinitionAtPosition(state, toolRefOffset + 2);
    assert.ok(link !== null);
    assert.strictEqual(link.definition.path, "prompts/webSearch.tp");
    assert.strictEqual(link.definition.text, "webSearch");
  });

  it("finds definition link for same-file schema field reference", () => {
    const state = EditorState.create({
      doc: RESEARCH_QUESTION_TP,
      extensions: [
        typeprompt({
          path: "prompts/ResearchQuestion.tp",
          workspaceFiles: {
            "prompts/webSearch.tp": WEB_SEARCH_TP,
          },
          patchBase: null,
        }),
      ],
    });

    const insertQuestionOffset =
      RESEARCH_QUESTION_TP.indexOf("input.question") + "input.".length;
    const link = findDefinitionAtPosition(state, insertQuestionOffset);
    assert.ok(link !== null);
    assert.strictEqual(link.definition.path, "prompts/ResearchQuestion.tp");
    assert.strictEqual(link.definition.text, "question");
  });

  it("returns null when position has no definition", () => {
    const state = EditorState.create({
      doc: RESEARCH_QUESTION_TP,
      extensions: [
        typeprompt({
          path: "prompts/ResearchQuestion.tp",
          workspaceFiles: {},
          patchBase: null,
        }),
      ],
    });

    const link = findDefinitionAtPosition(state, 5);
    assert.strictEqual(link, null);
  });

  it("returns null when position is on a definition declaration itself", () => {
    const state = EditorState.create({
      doc: RESEARCH_QUESTION_TP,
      extensions: [
        typeprompt({
          path: "prompts/ResearchQuestion.tp",
          workspaceFiles: {},
          patchBase: null,
        }),
      ],
    });

    const defOffset = RESEARCH_QUESTION_TP.indexOf("question: string;");
    const link = findDefinitionAtPosition(state, defOffset + 2);
    assert.strictEqual(link, null);
  });

  it("invokes onJumpToDefinition callback when definition is in a different file", () => {
    let callbackTarget: JumpToDefinitionTarget | null = null;

    let state = EditorState.create({
      doc: RESEARCH_QUESTION_TP,
      extensions: [
        typeprompt({
          path: "prompts/ResearchQuestion.tp",
          workspaceFiles: {
            "prompts/webSearch.tp": WEB_SEARCH_TP,
          },
          patchBase: null,
          onJumpToDefinition: (target: JumpToDefinitionTarget) => {
            callbackTarget = target;
          },
        }),
      ],
    });

    const mockView = {
      get state() {
        return state;
      },
      dispatch(tr: Transaction | TransactionSpec | { state: EditorState }) {
        if ("state" in tr && tr.state instanceof EditorState) {
          state = tr.state;
        } else {
          state = state.update(tr as TransactionSpec).state;
        }
      },
    } as unknown as EditorView;

    const toolRefOffset = RESEARCH_QUESTION_TP.indexOf("webSearch");
    const handled = jumpToDefinition(mockView, toolRefOffset + 1);

    assert.strictEqual(handled, true);
    assert.ok(callbackTarget !== null);
    assert.strictEqual(
      (callbackTarget as JumpToDefinitionTarget).path,
      "prompts/webSearch.tp",
    );
    assert.strictEqual(
      (callbackTarget as JumpToDefinitionTarget).text,
      "webSearch",
    );
  });

  it("updates selection in same file and scrolls to center when jumping to internal definition", () => {
    let state = EditorState.create({
      doc: RESEARCH_QUESTION_TP,
      extensions: [
        typeprompt({
          path: "prompts/ResearchQuestion.tp",
          workspaceFiles: {},
          patchBase: null,
        }),
      ],
    });

    let lastSpec: TransactionSpec | null = null;
    const mockView = {
      get state() {
        return state;
      },
      dispatch(tr: Transaction | TransactionSpec | { state: EditorState }) {
        if ("state" in tr && tr.state instanceof EditorState) {
          state = tr.state;
        } else {
          lastSpec = tr as TransactionSpec;
          state = state.update(lastSpec).state;
        }
      },
      dom: {
        dispatchEvent(): boolean {
          return true;
        },
      },
    } as unknown as EditorView;

    const insertQuestionOffset =
      RESEARCH_QUESTION_TP.indexOf("input.question") + "input.".length;
    const handled = jumpToDefinition(mockView, insertQuestionOffset);

    assert.strictEqual(handled, true);
    const expectedDefOffset = RESEARCH_QUESTION_TP.indexOf("question: string;");
    assert.strictEqual(state.selection.main.anchor, expectedDefOffset);
    assert.ok(lastSpec !== null);
    assert.ok((lastSpec as TransactionSpec).effects !== undefined);
  });

  it("turns cursor to pointer on keydown when mouse is over a jumpable symbol without moving mouse", () => {
    const state = EditorState.create({
      doc: RESEARCH_QUESTION_TP,
      extensions: [
        typeprompt({
          path: "prompts/ResearchQuestion.tp",
          workspaceFiles: {
            "prompts/webSearch.tp": WEB_SEARCH_TP,
          },
          patchBase: null,
        }),
      ],
    });

    const toolRefOffset = RESEARCH_QUESTION_TP.indexOf("webSearch") + 2;
    const dom = { style: { cursor: "" } };
    const mockView = {
      state,
      dom,
      posAtCoords(coords: { x: number; y: number }) {
        return coords.x === 100 && coords.y === 50 ? toolRefOffset : null;
      },
    } as unknown as EditorView;

    const plugin = new JumpToDefinitionHoverPlugin(mockView);
    plugin.lastCoords = { x: 100, y: 50 };

    // Press Meta key
    plugin.onKeyDown({
      key: "Meta",
      metaKey: true,
      ctrlKey: false,
    } as KeyboardEvent);
    assert.strictEqual(dom.style.cursor, "pointer");

    // Release Meta key
    plugin.onKeyUp({
      key: "Meta",
      metaKey: false,
      ctrlKey: false,
    } as KeyboardEvent);
    assert.strictEqual(dom.style.cursor, "");

    // Press Meta key over position without definition
    plugin.lastCoords = { x: 999, y: 999 };
    plugin.onKeyDown({
      key: "Meta",
      metaKey: true,
      ctrlKey: false,
    } as KeyboardEvent);
    assert.strictEqual(dom.style.cursor, "");

    // Blur resets cursor and lastCoords
    dom.style.cursor = "pointer";
    plugin.onBlur();
    assert.strictEqual(dom.style.cursor, "");
    assert.strictEqual(plugin.lastCoords, null);
  });

  it("rejects coordinates that fall to the right of the definition in empty line space", () => {
    const state = EditorState.create({
      doc: RESEARCH_QUESTION_TP,
      extensions: [
        typeprompt({
          path: "prompts/ResearchQuestion.tp",
          workspaceFiles: {
            "prompts/webSearch.tp": WEB_SEARCH_TP,
          },
          patchBase: null,
        }),
      ],
    });

    const toolRefStart = RESEARCH_QUESTION_TP.indexOf("webSearch");
    const toolRefEnd = toolRefStart + "webSearch".length;

    // Simulate mock view where webSearch is between x: 50 and x: 150 on line y: 100..120
    const mockView = {
      state,
      posAtCoords(coords: { x: number; y: number }) {
        // CodeMirror returns the end of line for any x coordinate past the text on that line
        if (coords.y >= 100 && coords.y <= 120) {
          return toolRefEnd;
        }
        return null;
      },
      coordsAtPos(pos: number) {
        if (pos === toolRefStart) {
          return { left: 50, right: 60, top: 100, bottom: 120 };
        }
        if (pos === toolRefEnd) {
          return { left: 140, right: 150, top: 100, bottom: 120 };
        }
        return null;
      },
    } as unknown as EditorView;

    // Inside the symbol bounding box (x: 100) -> matches
    const insideMatch = findDefinitionAtCoords(mockView, { x: 100, y: 110 });
    assert.ok(insideMatch !== null);
    assert.strictEqual(insideMatch.definition.text, "webSearch");

    // Past the end of the line (x: 350) -> posAtCoords returns toolRefEnd, but bounding box rejects it!
    const outsideRight = findDefinitionAtCoords(mockView, { x: 350, y: 110 });
    assert.strictEqual(outsideRight, null);

    // Before the start of the symbol (x: 20) -> rejected
    const outsideLeft = findDefinitionAtCoords(mockView, { x: 20, y: 110 });
    assert.strictEqual(outsideLeft, null);

    // Below the line (y: 200) -> rejected
    const outsideBottom = findDefinitionAtCoords(mockView, { x: 100, y: 200 });
    assert.strictEqual(outsideBottom, null);
  });

  it("underlines hovered symbol when holding Meta/Ctrl and removes underline on keyup/blur", () => {
    let state = EditorState.create({
      doc: RESEARCH_QUESTION_TP,
      extensions: [
        typeprompt({
          path: "prompts/ResearchQuestion.tp",
          workspaceFiles: {
            "prompts/webSearch.tp": WEB_SEARCH_TP,
          },
          patchBase: null,
        }),
      ],
    });

    const toolRefStart = RESEARCH_QUESTION_TP.indexOf("webSearch");
    const toolRefEnd = toolRefStart + "webSearch".length;
    const dom = { style: { cursor: "" } };

    const mockView = {
      get state() {
        return state;
      },
      dispatch(tr: Transaction | TransactionSpec | { state: EditorState }) {
        if ("state" in tr && tr.state instanceof EditorState) {
          state = tr.state;
        } else {
          state = state.update(tr as TransactionSpec).state;
        }
      },
      dom,
      posAtCoords(coords: { x: number; y: number }) {
        return coords.x === 100 && coords.y === 50 ? toolRefStart + 2 : null;
      },
      coordsAtPos(pos: number) {
        if (pos === toolRefStart) {
          return { left: 50, right: 60, top: 40, bottom: 60 };
        }
        if (pos === toolRefEnd) {
          return { left: 140, right: 150, top: 40, bottom: 60 };
        }
        return null;
      },
    } as unknown as EditorView;

    const plugin = new JumpToDefinitionHoverPlugin(mockView);
    plugin.lastCoords = { x: 100, y: 50 };

    // Initially no underline
    let decos = state.field(jumpToDefinitionHoverField);
    assert.strictEqual(decos.size, 0);

    // Press Meta key
    plugin.onKeyDown({
      key: "Meta",
      metaKey: true,
      ctrlKey: false,
    } as KeyboardEvent);

    assert.strictEqual(dom.style.cursor, "pointer");
    decos = state.field(jumpToDefinitionHoverField);
    assert.strictEqual(decos.size, 1);

    let fromPos = -1;
    let toPos = -1;
    let className = "";
    decos.between(0, state.doc.length, (from, to, val) => {
      fromPos = from;
      toPos = to;
      className = (val.spec as { class?: string }).class ?? "";
    });
    assert.strictEqual(fromPos, toolRefStart);
    assert.strictEqual(toPos, toolRefEnd);
    assert.strictEqual(className, "cm-jump-to-definition-link");

    // Release Meta key
    plugin.onKeyUp({
      key: "Meta",
      metaKey: false,
      ctrlKey: false,
    } as KeyboardEvent);

    assert.strictEqual(dom.style.cursor, "");
    decos = state.field(jumpToDefinitionHoverField);
    assert.strictEqual(decos.size, 0);

    // Press Ctrl key
    plugin.onKeyDown({
      key: "Control",
      metaKey: false,
      ctrlKey: true,
    } as KeyboardEvent);

    assert.strictEqual(dom.style.cursor, "pointer");
    decos = state.field(jumpToDefinitionHoverField);
    assert.strictEqual(decos.size, 1);

    // Blur clears decoration
    plugin.onBlur();
    assert.strictEqual(dom.style.cursor, "");
    decos = state.field(jumpToDefinitionHoverField);
    assert.strictEqual(decos.size, 0);

    plugin.destroy();
  });

  it("setHoverLinkEffect manually sets and clears underline decoration in jumpToDefinitionHoverField", () => {
    let state = EditorState.create({
      doc: "const foo = 123;",
      extensions: [jumpToDefinitionHoverField],
    });

    assert.strictEqual(state.field(jumpToDefinitionHoverField).size, 0);

    // Dispatch effect to underline "foo" (index 6 to 9)
    state = state.update({
      effects: setHoverLinkEffect.of({ from: 6, to: 9 }),
    }).state;

    const decos = state.field(jumpToDefinitionHoverField);
    assert.strictEqual(decos.size, 1);
    let fromPos = -1;
    let toPos = -1;
    decos.between(0, state.doc.length, (from, to) => {
      fromPos = from;
      toPos = to;
    });
    assert.strictEqual(fromPos, 6);
    assert.strictEqual(toPos, 9);

    // Clear underline
    state = state.update({
      effects: setHoverLinkEffect.of(null),
    }).state;
    assert.strictEqual(state.field(jumpToDefinitionHoverField).size, 0);
  });
});
