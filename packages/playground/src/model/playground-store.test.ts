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

describe("PlaygroundStore jumpToFile", () => {
  it("switches to new file within template group and preserves template", () => {
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
    const initialModel = store.model;
    assert.ok(initialModel !== null);
    assert.strictEqual(
      initialModel.selectedTemplatePath,
      "prompts/ResearchQuestion.tp",
    );
    assert.strictEqual(
      initialModel.selectedFilePath,
      "prompts/ResearchQuestion.tp",
    );

    // Jump to webSearch.tp at offset 12..21
    store.jumpToFile("prompts/webSearch.tp", { start: 12, end: 21 });

    const updatedModel = store.model;
    assert.ok(updatedModel !== null);
    assert.strictEqual(
      updatedModel.selectedTemplatePath,
      "prompts/ResearchQuestion.tp",
    );
    assert.strictEqual(updatedModel.selectedFilePath, "prompts/webSearch.tp");

    // Verify selection was updated in the target file's editor state
    const targetSource = updatedModel.editedSources["prompts/webSearch.tp"];
    assert.ok(targetSource);
    assert.strictEqual(targetSource.editorState.selection.main.anchor, 12);
    assert.strictEqual(targetSource.editorState.selection.main.head, 21);
  });

  it("handles jumpToFile within the same file by updating selection", () => {
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

    const updatedModel = store.model;
    assert.ok(updatedModel !== null);
    assert.strictEqual(
      updatedModel.selectedFilePath,
      "prompts/ResearchQuestion.tp",
    );

    const source = updatedModel.editedSources["prompts/ResearchQuestion.tp"];
    assert.ok(source);
    assert.strictEqual(source.editorState.selection.main.anchor, 40);
    assert.strictEqual(source.editorState.selection.main.head, 48);
  });
});
