import type { Inferences, Lsp } from "@typeprompt/core";
import {
  THEME_VARIABLES,
  type ThemeVariable,
  type ThemeVariables,
} from "@typeprompt/inference-element";
import { describe, it } from "mocha";
import assert from "node:assert";
import {
  getInferencePageHtml,
  getPlaygroundPreviewHtml,
  vscodeThemeVariables,
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
    assert.ok(html.includes("preview.setProjectData("));
  });

  it("generates inference page HTML mounting <tp-inference-run>", () => {
    const fakeInferenceRun: Inferences.InferenceRun<Inferences.Pending> = {
      kind: "playground-inference-run",
      id: "12345678",
      templateId: "Main:Test",
      isoTimestamp: new Date().toISOString(),
      model: { model: "openai/gpt-4o" },
      sourceFiles: {},
      inferences: [],
    };

    const html = getInferencePageHtml(fakeScriptUri, fakeInferenceRun, "Test");

    assert.ok(
      html.includes('<tp-inference-run id="inference-run"></tp-inference-run>'),
    );
    assert.ok(html.includes("inferenceRun.inferenceRun = "));
    assert.ok(html.includes("updateInferenceRun"));
  });

  it("defines every required theme variable from @typeprompt/inference-element", () => {
    for (const v of THEME_VARIABLES) {
      assert.ok(
        v in vscodeThemeVariables,
        `Expected vscodeThemeVariables to define ${v}`,
      );
      assert.ok(
        vscodeThemeVariables[v].length > 0,
        `Expected vscodeThemeVariables[${v}] to be a non-empty string`,
      );
    }
  });

  it("contains no extraneous variables beyond THEME_VARIABLES", () => {
    const keys = Object.keys(vscodeThemeVariables);
    const requiredSet = new Set<string>(THEME_VARIABLES);
    for (const k of keys) {
      assert.ok(
        requiredSet.has(k),
        `Found unexpected variable in vscodeThemeVariables: ${k}`,
      );
    }
    assert.strictEqual(keys.length, THEME_VARIABLES.length);
  });

  it("injects vscodeThemeVariables and theme rules into webview HTML", () => {
    const html = getPlaygroundPreviewHtml(fakeScriptUri, null, "test");
    assert.ok(html.includes("--tp-font-family: var(--vscode-font-family);"));
    assert.ok(html.includes("--tp-message-margin: 2.5rem;"));
    assert.ok(html.includes("body.vscode-light {"));
    assert.ok(html.includes("body.vscode-high-contrast"));
  });

  it("enforces compile-time typesafety for theme variables contract", () => {
    type ExactKeys = keyof typeof vscodeThemeVariables extends ThemeVariable
      ? ThemeVariable extends keyof typeof vscodeThemeVariables
        ? true
        : false
      : false;
    const isExact: ExactKeys = true;
    assert.strictEqual(isExact, true);

    // @ts-expect-error Missing property should cause a compile-time error
    const _missing: ThemeVariables = { "--tp-bg": "red" };
    void _missing;

    const _extra: ThemeVariables = {
      ...vscodeThemeVariables,
      // @ts-expect-error Unknown property should cause a compile-time error
      "--tp-invalid": "blue",
    };
    void _extra;
  });
});
