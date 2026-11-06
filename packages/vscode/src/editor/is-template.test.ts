import type { Lsp } from "@typeprompt/core";
import { ProjectStore } from "@typeprompt/language-server";
import { expect } from "buckwheat";
import {
  canOpenPreview,
  isPlaygroundFile,
  isTemplateFile,
} from "./is-template.js";

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

describe("isPlaygroundFile", () => {
  it("determines playground from compilationResult entity kind", () => {
    const store = new ProjectStore();
    store.handleNotification({
      projects: {
        "file:///workspace/project/": makeFakeProject({
          sourceFiles: {
            "prompts/CustomName.tp": {
              path: "prompts/CustomName.tp",
              hasErrors: false,
              entity: {
                kind: "playground",
                forTemplate: "Translate",
                namespace: null,
              },
            },
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
        }),
      },
    });

    const playgroundDoc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/CustomName.tp",
      },
      fileName: "/workspace/project/prompts/CustomName.tp",
    };
    const templateDoc = {
      uri: {
        toString: (): string =>
          "file:///workspace/project/prompts/Translate.tp",
      },
      fileName: "/workspace/project/prompts/Translate.tp",
    };

    expect(isPlaygroundFile(playgroundDoc, store)).toBe(true);
    expect(isPlaygroundFile(templateDoc, store)).toBe(false);
  });

  it("returns false for non-.tp files", () => {
    const store = new ProjectStore();
    const doc = {
      uri: { toString: (): string => "file:///workspace/project/foo.ts" },
      fileName: "/workspace/project/foo.ts",
    };
    expect(isPlaygroundFile(doc, store)).toBe(false);
  });
});

describe("isTemplate", () => {
  it("returns 'with-playground' for template with playground in playgrounds map", () => {
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
    expect(isTemplateFile(doc, store)).toBe("with-playground");
    expect(canOpenPreview(doc, store)).toBe(true);
  });

  it("returns 'no-playground' for template without playground", () => {
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
    expect(isTemplateFile(doc, store)).toBe("no-playground");
    expect(canOpenPreview(doc, store)).toBe(false);
  });

  it("returns false for tool, meta, and shared files", () => {
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
            "prompts/meta.tp": {
              path: "prompts/meta.tp",
              hasErrors: false,
              entity: { kind: "meta" },
            },
            "prompts/shared.tp": {
              path: "prompts/shared.tp",
              hasErrors: false,
              entity: { kind: "namespace", name: "Main" },
            },
          },
        }),
      },
    });

    for (const name of ["getWeather.tp", "meta.tp", "shared.tp"]) {
      const doc = {
        uri: {
          toString: (): string => `file:///workspace/project/prompts/${name}`,
        },
        fileName: `/workspace/project/prompts/${name}`,
      };
      expect(isTemplateFile(doc, store)).toBe(false);
      expect(canOpenPreview(doc, store)).toBe(false);
    }
  });
});
