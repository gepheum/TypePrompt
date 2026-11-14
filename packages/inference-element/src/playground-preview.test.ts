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

  it("exports events nanoevents emitter and fires createSecrets, runInference, selectSample", () => {
    let createSecretsCalled = false;
    let runInferenceCalled = false;
    let selectedKey = "";
    let selectedIndex = -1;

    const unbind1 = playgroundPreviewEvents.on("createSecrets", () => {
      createSecretsCalled = true;
    });
    const unbind2 = playgroundPreviewEvents.on("runInference", () => {
      runInferenceCalled = true;
    });
    const unbind3 = playgroundPreviewEvents.on("selectSample", (key, idx) => {
      selectedKey = key;
      selectedIndex = idx;
    });

    playgroundPreviewEvents.emit("createSecrets");
    assert.strictEqual(createSecretsCalled, true);

    playgroundPreviewEvents.emit("runInference");
    assert.strictEqual(runInferenceCalled, true);

    playgroundPreviewEvents.emit("selectSample", "name:test", 2);
    assert.strictEqual(selectedKey, "name:test");
    assert.strictEqual(selectedIndex, 2);

    unbind1();
    unbind2();
    unbind3();
  });

  it("renders with wireProject via setProjectData", () => {
    const el = new PlaygroundPreviewElement();
    const fakeProject: Lsp.WireProject = {
      folderUri: "file:///mock-workspace",
      compilationResult: {
        edition: 1,
        sourceFiles: {
          "prompts/Greeting.play.tp": {
            path: "prompts/Greeting.play.tp",
            hasErrors: false,
            entity: {
              kind: "playground",
              namespace: "Main",
              forTemplate: "Greeting",
            },
          },
        },
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

    el.setProjectData(fakeProject, "prompts/Greeting.play.tp");
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
    assert.ok(renderedStr.includes("preview-header"));
    assert.ok(renderedStr.includes("header-top"));
    assert.ok(renderedStr.includes("header-actions"));
    assert.ok(renderedStr.includes("Greeting"));
    assert.ok(renderedStr.includes("Playground preview · 1 sample"));
    assert.ok(renderedStr.includes("run-inference-button"));
    assert.ok(renderedStr.includes("model-yaml-card"));
    assert.ok(renderedStr.includes("sample-segmented-control"));
    assert.ok(renderedStr.includes("sample-segment-btn"));
  });

  it("renders no-api-keys banner and hides run-inference-button when api keys are missing", () => {
    const el = new PlaygroundPreviewElement();
    const fakeProject: Lsp.WireProject = {
      folderUri: "file:///mock-workspace",
      compilationResult: {
        edition: 1,
        sourceFiles: {
          "prompts/Test.play.tp": {
            path: "prompts/Test.play.tp",
            hasErrors: false,
            entity: {
              kind: "playground",
              namespace: "Main",
              forTemplate: "Test",
            },
          },
        },
        templates: {},
        tools: {},
        playgrounds: {
          "Main:Test": {
            id: "Main:Test",
            namespace: "Main",
            forTemplate: "Test",
            isValid: true,
            model: { model: "anthropic/claude-3-5-sonnet" },
            samples: [],
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
          apiKeys: {},
        },
      },
    };

    el.setProjectData(fakeProject, "prompts/Test.play.tp");
    const template = el.render();

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
    assert.ok(renderedStr.includes("no-api-keys-banner"));
    assert.ok(!renderedStr.includes("run-inference-button"));
    assert.ok(renderedStr.includes("Playground preview · 0 samples"));
  });

  it("renders detailed error message in banner when API keys are present but model cannot be resolved", () => {
    const el = new PlaygroundPreviewElement();
    const fakeProject: Lsp.WireProject = {
      folderUri: "file:///mock-workspace",
      compilationResult: {
        edition: 1,
        sourceFiles: {
          "prompts/Test.play.tp": {
            path: "prompts/Test.play.tp",
            hasErrors: false,
            entity: {
              kind: "playground",
              namespace: "Main",
              forTemplate: "Test",
            },
          },
        },
        templates: {},
        tools: {},
        playgrounds: {
          "Main:Test": {
            id: "Main:Test",
            namespace: "Main",
            forTemplate: "Test",
            isValid: true,
            model: { model: "openai/gpt-4o" },
            samples: [],
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
            anthropic: "sk-ant-test",
          },
        },
      },
    };

    el.setProjectData(fakeProject, "prompts/Test.play.tp");
    const template = el.render();

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
    assert.ok(renderedStr.includes("no-api-keys-banner"));
    assert.ok(
      renderedStr.includes(
        "Missing API key for model 'openai/gpt-4o': provide 'openai' or 'vercelGateway' API key",
      ),
    );
    assert.ok(renderedStr.includes("Edit .typeprompt.secrets.yaml"));
    assert.ok(!renderedStr.includes("run-inference-button"));
  });

  it("retains last successful projectData when updated with errors and displays error banner", () => {
    const el = new PlaygroundPreviewElement();
    const validProject: Lsp.WireProject = {
      folderUri: "file:///mock-workspace",
      compilationResult: {
        edition: 1,
        sourceFiles: {
          "prompts/Greeting.play.tp": {
            path: "prompts/Greeting.play.tp",
            hasErrors: false,
            entity: {
              kind: "playground",
              namespace: "Main",
              forTemplate: "Greeting",
            },
          },
        },
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
          apiKeys: { openai: "sk-mock" },
        },
      },
    };

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

    // Set initial valid project
    el.setProjectData(validProject, "prompts/Greeting.play.tp");
    let renderedStr = flattenTemplate(el.render());
    assert.ok(renderedStr.includes("Greeting Sample"));
    assert.ok(!renderedStr.includes("Address the TypePrompt errors"));

    // Now send project with compilation errors
    const projectWithErrors: Lsp.WireProject = {
      ...validProject,
      compilationResult: {
        ...validProject.compilationResult,
        anyErrors: true,
      },
    };
    el.setProjectData(projectWithErrors, "prompts/Greeting.play.tp");

    renderedStr = flattenTemplate(el.render());
    // Retains last successful rendering under the overlay!
    assert.ok(renderedStr.includes("Greeting Sample"));
    // AND shows the error banner
    assert.ok(renderedStr.includes("Address the TypePrompt errors"));

    // Also test syntax error where sourceFile.entity is undefined and sourceFile.hasErrors is true
    const projectWithParseError: Lsp.WireProject = {
      ...validProject,
      compilationResult: {
        ...validProject.compilationResult,
        anyErrors: true,
        sourceFiles: {
          "prompts/Greeting.play.tp": {
            path: "prompts/Greeting.play.tp",
            hasErrors: true,
            entity: undefined,
          },
        },
      },
    };
    el.setProjectData(projectWithParseError, "prompts/Greeting.play.tp");

    renderedStr = flattenTemplate(el.render());
    assert.ok(renderedStr.includes("Greeting Sample"));
    assert.ok(renderedStr.includes("Address the TypePrompt errors"));

    // Now resolve errors
    el.setProjectData(validProject, "prompts/Greeting.play.tp");
    renderedStr = flattenTemplate(el.render());
    assert.ok(renderedStr.includes("Greeting Sample"));
    assert.ok(!renderedStr.includes("Address the TypePrompt errors"));
  });
});
