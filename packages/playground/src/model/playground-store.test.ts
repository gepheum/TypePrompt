import { describe, it } from "mocha";
import assert from "node:assert";
import type { PullSourcesResponse } from "../contract.js";
import { PlaygroundStore } from "./playground-store.js";

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

const META_TP = `<meta>
  model: gpt-4o
  temperature: 0.2
</meta>
`;

describe("PlaygroundStore", () => {
  it("initializes with sorted files and selects the first file", () => {
    const store = new PlaygroundStore();
    const response: PullSourcesResponse = {
      timestampMillis: 1000,
      sourceFiles: {
        "prompts/ResearchQuestion.tp": RESEARCH_QUESTION_TP,
        "prompts/webSearch.tp": WEB_SEARCH_TP,
        "prompts/meta.tp": META_TP,
      },
    };

    store.init(response);
    const model = store.model;
    assert.ok(model !== null);
    assert.strictEqual(model.selectedFilePath, "prompts/meta.tp");
    assert.strictEqual(model.activeActivity, "files");
  });

  it("selectFile changes the selected file", () => {
    const store = new PlaygroundStore();
    const response: PullSourcesResponse = {
      timestampMillis: 1000,
      sourceFiles: {
        "prompts/ResearchQuestion.tp": RESEARCH_QUESTION_TP,
        "prompts/webSearch.tp": WEB_SEARCH_TP,
        "prompts/meta.tp": META_TP,
      },
    };

    store.init(response);
    store.selectFile("prompts/meta.tp");

    const model = store.model;
    assert.ok(model !== null);
    assert.strictEqual(model.selectedFilePath, "prompts/meta.tp");
  });

  it("setActivity changes the active activity", () => {
    const store = new PlaygroundStore();
    const response: PullSourcesResponse = {
      timestampMillis: 1000,
      sourceFiles: {
        "prompts/ResearchQuestion.tp": RESEARCH_QUESTION_TP,
      },
    };

    store.init(response);
    store.setActivity("inferences");

    const model = store.model;
    assert.ok(model !== null);
    assert.strictEqual(model.activeActivity, "inferences");
  });

  it("jumpToFile switches selected file and sets selection range", () => {
    const store = new PlaygroundStore();
    const response: PullSourcesResponse = {
      timestampMillis: 1000,
      sourceFiles: {
        "prompts/ResearchQuestion.tp": RESEARCH_QUESTION_TP,
        "prompts/webSearch.tp": WEB_SEARCH_TP,
        "prompts/meta.tp": META_TP,
      },
    };

    store.init(response);
    store.jumpToFile("prompts/webSearch.tp", { start: 12, end: 21 });

    const model = store.model;
    assert.ok(model !== null);
    assert.strictEqual(model.selectedFilePath, "prompts/webSearch.tp");
    assert.strictEqual(model.activeActivity, "files");

    const targetSource = model.editedSources["prompts/webSearch.tp"];
    assert.ok(targetSource);
    assert.strictEqual(targetSource.editorState.selection.main.anchor, 12);
    assert.strictEqual(targetSource.editorState.selection.main.head, 21);
  });

  it("jumpToFile within the same file updates selection", () => {
    const store = new PlaygroundStore();
    const response: PullSourcesResponse = {
      timestampMillis: 1000,
      sourceFiles: {
        "prompts/ResearchQuestion.tp": RESEARCH_QUESTION_TP,
        "prompts/webSearch.tp": WEB_SEARCH_TP,
        "prompts/meta.tp": META_TP,
      },
    };

    store.init(response);
    store.jumpToFile("prompts/ResearchQuestion.tp", { start: 40, end: 48 });

    const model = store.model;
    assert.ok(model !== null);
    assert.strictEqual(model.selectedFilePath, "prompts/ResearchQuestion.tp");

    const source = model.editedSources["prompts/ResearchQuestion.tp"];
    assert.ok(source);
    assert.strictEqual(source.editorState.selection.main.anchor, 40);
    assert.strictEqual(source.editorState.selection.main.head, 48);
  });
});
