import type { Inferences, Lsp } from "@typeprompt/core";
import { describe, it } from "mocha";
import assert from "node:assert";
import {
  getInferencePageHtml,
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
    assert.ok(html.includes('playgroundPreviewEvents.on("runInference"'));
    assert.ok(html.includes('playgroundPreviewEvents.on("selectSample"'));
    assert.ok(html.includes("preview.wireProject = "));
  });

  it("generates inference page HTML mounting <tp-inference-run>", () => {
    const fakeInferenceRun: Inferences.InferenceRun<Inferences.Pending> = {
      kind: "playground-inference-run",
      id: "12345678",
      templateId: "Main:Test",
      isoTimestamp: new Date().toISOString(),
      model: { model: "openai/gpt-4o" },
      templateFiles: {},
      inferences: [],
    };

    const html = getInferencePageHtml(fakeScriptUri, fakeInferenceRun, "Test");

    assert.ok(
      html.includes('<tp-inference-run id="inference-run"></tp-inference-run>'),
    );
    assert.ok(html.includes("inferenceRun.inferenceRun = "));
    assert.ok(html.includes("updateInferenceRun"));
  });
});
