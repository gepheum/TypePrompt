import type { Lsp } from "@typeprompt/core";
import { ProjectStore } from "@typeprompt/language-server";
import { expect } from "buckwheat";
import { isTemplateWithoutPlayground } from "./is-template-without-playground.js";

function makeFakeProject(params: {
  sourceFiles?: { [path: string]: Lsp.WireSourceFile };
  playgrounds?: { [id: string]: Lsp.WirePlayground };
}): Lsp.WireProject {
  return {
    folderUri: "file:///workspace/project/",
    compilationResult: {
      sourceFiles: params.sourceFiles ?? {},
      templates: {},
      tools: {},
      playgrounds: params.playgrounds ?? {},
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
        apiKeys: {},
      },
    },
  };
}

describe("isTemplateWithoutPlayground", () => {
  it("returns false for non-.tp files", () => {
    const store = new ProjectStore();
    const doc = {
      uri: { toString: (): string => "file:///workspace/project/foo.ts" },
      fileName: "/workspace/project/foo.ts",
    };
    expect(isTemplateWithoutPlayground(doc, store)).toBe(false);
  });

  it("returns false for .play.tp files", () => {
    const store = new ProjectStore();
    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/Translate.play.tp",
      },
      fileName: "/workspace/project/prompts/Translate.play.tp",
    };
    expect(isTemplateWithoutPlayground(doc, store)).toBe(false);
  });

  it("returns false for meta.tp and shared.tp", () => {
    const store = new ProjectStore();
    const metaDoc = {
      uri: {
        toString: (): string => "file:///workspace/project/prompts/meta.tp",
      },
      fileName: "/workspace/project/prompts/meta.tp",
    };
    const sharedDoc = {
      uri: {
        toString: (): string => "file:///workspace/project/prompts/shared.tp",
      },
      fileName: "/workspace/project/prompts/shared.tp",
    };
    expect(isTemplateWithoutPlayground(metaDoc, store)).toBe(false);
    expect(isTemplateWithoutPlayground(sharedDoc, store)).toBe(false);
  });

  it("returns false for tool entities in compilationResult", () => {
    const store = new ProjectStore();
    store.handleNotification({
      projects: {
        "file:///workspace/project/": makeFakeProject({
          sourceFiles: {
            "prompts/getWeather.tp": {
              path: "prompts/getWeather.tp",
              hasErrors: false,
              entity: {
                kind: "tool",
                name: "getWeather",
                namespace: null,
              },
            },
          },
        }),
      },
    });

    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/getWeather.tp",
      },
      fileName: "/workspace/project/prompts/getWeather.tp",
    };
    expect(isTemplateWithoutPlayground(doc, store)).toBe(false);
  });

  it("returns false if playground file already exists in sourceFiles", () => {
    const store = new ProjectStore();
    store.handleNotification({
      projects: {
        "file:///workspace/project/": makeFakeProject({
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
            "prompts/Translate.play.tp": {
              path: "prompts/Translate.play.tp",
              hasErrors: false,
              entity: {
                kind: "playground",
                forTemplate: "Translate",
                namespace: null,
              },
            },
          },
        }),
      },
    });

    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/Translate.tp",
      },
      fileName: "/workspace/project/prompts/Translate.tp",
    };
    expect(isTemplateWithoutPlayground(doc, store)).toBe(false);
  });

  it("returns false if playground already exists in compilationResult playgrounds map", () => {
    const store = new ProjectStore();
    store.handleNotification({
      projects: {
        "file:///workspace/project/": makeFakeProject({
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
          playgrounds: {
            "Main:Translate": {
              id: "Main:Translate",
              forTemplate: "Translate",
              namespace: null,
              isValid: true,
            },
          },
        }),
      },
    });

    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/Translate.tp",
      },
      fileName: "/workspace/project/prompts/Translate.tp",
    };
    expect(isTemplateWithoutPlayground(doc, store)).toBe(false);
  });

  it("returns true for template without playground in projectStore", () => {
    const store = new ProjectStore();
    store.handleNotification({
      projects: {
        "file:///workspace/project/": makeFakeProject({
          sourceFiles: {
            "prompts/NewTemplate.tp": {
              path: "prompts/NewTemplate.tp",
              hasErrors: false,
              entity: {
                kind: "template",
                name: "NewTemplate",
                namespace: null,
              },
            },
          },
        }),
      },
    });

    const doc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/NewTemplate.tp",
      },
      fileName: "/workspace/project/prompts/NewTemplate.tp",
    };
    expect(isTemplateWithoutPlayground(doc, store)).toBe(true);
  });
});
