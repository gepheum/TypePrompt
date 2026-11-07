import type { Lsp } from "@typeprompt/core";
import { ProjectStore } from "@typeprompt/language-server";
import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { renderPlaygroundPreviewHtml } from "./render-preview-page.js";

function makeFakeProject(params: {
  readonly folderUri?: string;
  readonly hasErrors?: boolean;
  readonly apiKeys?: Record<string, string>;
  readonly samples?: readonly Lsp.WirePlaygroundSample[];
}): Lsp.WireProject {
  const {
    folderUri = "file:///workspace/project/",
    hasErrors = false,
    apiKeys = {},
    samples = [
      {
        name: "sample-1",
        input: "hello",
        request: {
          systemMessage: "You are a helpful assistant.",
          tools: [],
          messages: [
            {
              role: "user",
              input: { text: "hello" },
              rendered: "hello",
            },
          ],
          outputFormat: { format: "text" },
        },
      },
    ],
  } = params;
  return {
    folderUri,
    compilationResult: {
      sourceFiles: {
        "prompts/test.play.tp": {
          path: "prompts/test.play.tp",
          hasErrors: false,
          entity: {
            kind: "playground",
            forTemplate: "Test",
            namespace: null,
            model: { model: "openai/gpt-4o" },
            samples,
          },
        },
      },
      templates: {
        "Main:Test": {
          id: "Main:Test",
          name: "Test",
          namespace: null,
          isValid: true,
          sourcePath: "prompts/test.tp",
        },
      },
      tools: {},
      playgrounds: {
        "Main:Test": {
          id: "Main:Test",
          forTemplate: "Main:Test",
          namespace: null,
          isValid: true,
          model: { model: "openai/gpt-4o" },
          samples,
        },
      },
      edition: 1,
      signature: "sig-1",
      anyErrors: hasErrors,
      finalErrors: {},
      warnings: {},
      timestampMillis: Date.now(),
    },
    secrets: {
      kind: "success",
      secrets: {
        apiKeys,
      },
    },
  };
}

describe("renderPlaygroundPreviewHtml", () => {
  it("renders API keys warning banner when secrets has no API keys", () => {
    const store = new ProjectStore();
    const fakeProject = makeFakeProject({ apiKeys: {} });
    store.handleNotification({
      projects: {
        "file:///workspace/project/": fakeProject,
      },
    });

    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/test.play.tp",
      },
      fileName: "/workspace/project/prompts/test.play.tp",
    };

    const html = renderPlaygroundPreviewHtml(doc, store);
    expect(html.includes("<title>Preview: test</title>")).toBe(true);
    expect(
      html.includes("Inference cannot be run because no API key is available."),
    ).toBe(true);
    expect(html.includes('id="create-secrets-link"')).toBe(true);
    expect(html.includes("Create .typeprompt.secrets.yaml")).toBe(true);
    expect(html.includes('id="run-inferences-button"')).toBe(false);
    // Should not show error overlay
    expect(html.includes('style="display: none;"')).toBe(true);
  });

  it("does not render API keys warning banner when secrets contains at least one API key", () => {
    const store = new ProjectStore();
    const fakeProject = makeFakeProject({
      apiKeys: { openai: "sk-test-key-12345" },
    });
    store.handleNotification({
      projects: {
        "file:///workspace/project/": fakeProject,
      },
    });

    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/test.play.tp",
      },
      fileName: "/workspace/project/prompts/test.play.tp",
    };

    const html = renderPlaygroundPreviewHtml(doc, store);
    expect(
      html.includes("Inference cannot be run because no API key is available."),
    ).toBe(false);
    expect(html.includes('id="create-secrets-link"')).toBe(false);
    expect(html.includes('id="run-inferences-button"')).toBe(true);
    expect(html.includes("Run Inferences")).toBe(true);
    expect(html.includes('style="display: none;"')).toBe(true);
  });

  it("renders loading state when project has not yet been scanned", () => {
    const store = new ProjectStore();
    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/unscanned.play.tp",
      },
      fileName: "/workspace/project/prompts/unscanned.play.tp",
    };

    const html = renderPlaygroundPreviewHtml(doc, store);
    expect(html.includes("Loading playground preview...")).toBe(true);
    expect(html.includes('style="display: none;"')).toBe(true);
  });

  it("renders preview when given a template document that has a playground", () => {
    const store = new ProjectStore();
    const fakeProject: Lsp.WireProject = {
      folderUri: "file:///workspace/project/",
      compilationResult: {
        sourceFiles: {
          "prompts/Translate.tp": {
            path: "prompts/Translate.tp",
            hasErrors: false,
            entity: {
              kind: "template",
              name: "Translate",
              namespace: null,
            },
          },
        },
        templates: {},
        tools: {},
        playgrounds: {
          "Main:Translate": {
            id: "Main:Translate",
            forTemplate: "Translate",
            namespace: null,
            isValid: true,
            samples: [
              {
                index: 0,
                name: "Greeting sample",
                variables: { text: "hello" },
                tools: [],
              },
            ],
          },
        },
        edition: 1,
        signature: undefined,
        anyErrors: false,
        finalErrors: {},
        warnings: {},
        timestampMillis: Date.now(),
      },
      secrets: {
        kind: "success",
        secrets: {
          apiKeys: { openai: "sk-test" },
        },
      },
    };
    store.handleNotification({
      projects: {
        "file:///workspace/project/": fakeProject,
      },
    });

    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/Translate.tp",
      },
      fileName: "/workspace/project/prompts/Translate.tp",
    };

    const html = renderPlaygroundPreviewHtml(doc, store);
    expect(html.includes("<title>Preview: Translate</title>")).toBe(true);
    expect(html.includes("Greeting sample")).toBe(true);
  });

  it("labels unnamed samples as Anonymous ${index + 1}/${total} in select dropdown", () => {
    const store = new ProjectStore();
    const fakeProject = makeFakeProject({
      folderUri: "file:///workspace/project/",
      samples: [
        {
          input: "unnamed sample 1",
          request: {
            systemMessage: "",
            tools: [],
            messages: [
              {
                role: "user",
                input: { message: "hello" },
                rendered: "hello",
              },
            ],
            outputFormat: { format: "text" },
          },
        },
        {
          name: "Named Sample",
          input: "named sample 2",
          request: {
            systemMessage: "",
            tools: [],
            messages: [
              {
                role: "user",
                input: { message: "world" },
                rendered: "world",
              },
            ],
            outputFormat: { format: "text" },
          },
        },
      ],
    });
    store.handleNotification({
      projects: {
        "file:///workspace/project/": fakeProject,
      },
    });

    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/test.play.tp",
      },
      fileName: "/workspace/project/prompts/test.play.tp",
    };

    const html = renderPlaygroundPreviewHtml(doc, store);
    expect(html.includes("Anonymous 1/2")).toBe(true);
    expect(html.includes("Named Sample")).toBe(true);
  });

  it("renders model YAML config card next to Run Inferences button when API keys exist", () => {
    const store = new ProjectStore();
    const fakeProject = makeFakeProject({
      folderUri: "file:///workspace/project/",
      apiKeys: { openai: "sk-test" },
    });
    store.handleNotification({
      projects: {
        "file:///workspace/project/": fakeProject,
      },
    });

    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/test.play.tp",
      },
      fileName: "/workspace/project/prompts/test.play.tp",
    };

    const html = renderPlaygroundPreviewHtml(doc, store);
    expect(html.includes('class="model-yaml-card"')).toBe(true);
    expect(html.includes("openai/gpt-4o")).toBe(true);
    expect(html.includes("run-inferences-button")).toBe(true);
  });

  it("does not render model YAML config card when API keys are missing", () => {
    const store = new ProjectStore();
    const fakeProject = makeFakeProject({
      folderUri: "file:///workspace/project/",
      apiKeys: {},
    });
    store.handleNotification({
      projects: {
        "file:///workspace/project/": fakeProject,
      },
    });

    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/test.play.tp",
      },
      fileName: "/workspace/project/prompts/test.play.tp",
    };

    const html = renderPlaygroundPreviewHtml(doc, store);
    expect(html.includes('class="model-yaml-card"')).toBe(false);
    expect(html.includes("no-api-keys-banner")).toBe(true);
  });
});
