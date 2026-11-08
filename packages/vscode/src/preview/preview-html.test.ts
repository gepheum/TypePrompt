import type { Inferences, Lsp } from "@typeprompt/core";
import { describe, it } from "mocha";
import assert from "node:assert";
import {
  getInferencesPageHtml,
  getPlaygroundPreviewHtml,
} from "./preview-html.js";

describe("preview-html (vscode extension)", () => {
  const fakeScriptUri = "https://webview.local/dist/webview.js";

  it("generates playground preview HTML mounting <playground-preview>", () => {
    const fakeProject: Lsp.WireProject = {
      folderUri: "file:///mock-workspace",
      compilationResult: {
        edition: 1,
        sourceFiles: {},
        templates: {},
        tools: {},
        playgrounds: {},
        signature: undefined,
        anyErrors: false,
        finalErrors: {},
        warnings: {},
        timestampMillis: Date.now(),
      },
      secrets: { kind: "success", secrets: { apiKeys: {} } },
    };

    const html = getPlaygroundPreviewHtml(
      fakeScriptUri,
      { project: fakeProject, relativePath: "prompts/test.play.tp" },
      "test",
    );

    assert.ok(
      html.includes(
        '<tp-playground-preview id="preview"></tp-playground-preview>',
      ),
    );
    assert.ok(html.includes('playgroundPreviewEvents.on("createSecrets"'));
    assert.ok(html.includes('playgroundPreviewEvents.on("runInferences"'));
    assert.ok(html.includes('playgroundPreviewEvents.on("selectSample"'));
    assert.ok(html.includes("preview.wireProject = "));
  });

  it("generates inferences page HTML mounting <inference-set>", () => {
    const fakeInferenceSet: Inferences.InferenceSet<Inferences.Pending> = {
      kind: "playground-inference-set",
      id: "12345678",
      templateId: "Main:Test",
      isoTimestamp: new Date().toISOString(),
      model: { model: "openai/gpt-4o" },
      templateFiles: {},
      inferences: [],
    };

    const html = getInferencesPageHtml(fakeScriptUri, fakeInferenceSet, "Test");

    assert.ok(
      html.includes('<tp-inference-set id="inferences"></tp-inference-set>'),
    );
    assert.ok(html.includes("inferences.inferenceSet = "));
    assert.ok(html.includes("updateInferenceSet"));
  });
});
