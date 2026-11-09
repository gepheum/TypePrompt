import type { Lsp } from "@typeprompt/core";
import { describe, it } from "mocha";
import assert from "node:assert";
import {
  PlaygroundPreviewElement,
  playgroundPreviewEvents,
} from "./playground-preview.js";

describe("PlaygroundPreviewElement", () => {
  it("initializes component instance", () => {
    const el = new PlaygroundPreviewElement();
    assert.ok(el);
    assert.strictEqual(el.tagName.toLowerCase(), "tp-playground-preview");
  });

  it("exports events nanoevents emitter and fires createSecrets, runInferences, selectSample", () => {
    let createSecretsCalled = false;
    let runInferencesCalled = false;
    let selectedKey = "";
    let selectedIndex = -1;

    const unbind1 = playgroundPreviewEvents.on("createSecrets", () => {
      createSecretsCalled = true;
    });
    const unbind2 = playgroundPreviewEvents.on("runInferences", () => {
      runInferencesCalled = true;
    });
    const unbind3 = playgroundPreviewEvents.on("selectSample", (key, idx) => {
      selectedKey = key;
      selectedIndex = idx;
    });

    playgroundPreviewEvents.emit("createSecrets");
    assert.strictEqual(createSecretsCalled, true);

    playgroundPreviewEvents.emit("runInferences");
    assert.strictEqual(runInferencesCalled, true);

    playgroundPreviewEvents.emit("selectSample", "name:test", 2);
    assert.strictEqual(selectedKey, "name:test");
    assert.strictEqual(selectedIndex, 2);

    unbind1();
    unbind2();
    unbind3();
  });

  it("renders with wireProject", () => {
    const el = new PlaygroundPreviewElement();
    const fakeProject: Lsp.WireProject = {
      folderUri: "file:///mock-workspace",
      compilationResult: {
        edition: 1,
        sourceFiles: {},
        templates: {},
        tools: {},
        playgrounds: {
          "Main:Greeting": {
            id: "Main:Greeting",
            namespace: "Main",
            forTemplate: "Greeting",
            isValid: true,
            model: { model: "openai/gpt-4o" },
            samples: [
              {
                name: "Greeting Sample",
                request: {
                  systemMessage: "You are a greeter.",
                  outputFormat: { format: "text" },
                  tools: [],
                  messages: [
                    {
                      role: "user",
                      input: {},
                      rendered: "Hi there!",
                    },
                  ],
                },
              },
            ],
          },
        },
        signature: undefined,
        anyErrors: false,
        finalErrors: {},
        warnings: {},
        timestampMillis: Date.now(),
      },
      secrets: {
        kind: "success",
        secrets: {
          apiKeys: {
            openai: "sk-mock",
          },
        },
      },
    };

    el.wireProject = fakeProject;
    const template = el.render();
    assert.ok(template);

    function flattenTemplate(t: unknown): string {
      if (!t || typeof t !== "object") return String(t ?? "");
      if (
        "strings" in t &&
        Array.isArray((t as { strings: unknown }).strings)
      ) {
        const values = (t as { values?: unknown[] }).values ?? [];
        return (t as { strings: string[] }).strings
          .map(
            (str: string, i: number) =>
              str + (i < values.length ? flattenTemplate(values[i]) : ""),
          )
          .join("");
      }
      if (Array.isArray(t)) {
        return t.map(flattenTemplate).join("");
      }
      return "";
    }

    const renderedStr = flattenTemplate(template);
    assert.ok(renderedStr.includes("sticky-header"));
    assert.ok(renderedStr.includes("sample-segmented-control"));
    assert.ok(renderedStr.includes("sample-segment-btn"));
  });
});
