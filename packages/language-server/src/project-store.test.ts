import type { Lsp } from "@typeprompt/core";
import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { ProjectStore } from "./project-store.js";

function makeFakeProject(
  edition: number,
  folderUri = "file:///project/",
): Lsp.WireProject {
  return {
    folderUri,
    compilationResult: {
      sourceFiles: {},
      templates: {},
      tools: {},
      playgrounds: {},
      edition,
      signature: `sig-${edition}`,
      anyErrors: false,
      finalErrors: {},
      warnings: {},
      timestampMillis: Date.now(),
    },
    secrets: { kind: "success", secrets: {} },
  };
}

describe("ProjectStore", () => {
  it("populates new projects and prunes removed projects", () => {
    const store = new ProjectStore();
    const resA = makeFakeProject(1);
    const resB = makeFakeProject(1);

    store.handleNotification({
      projects: {
        "file:///projectA/": resA,
        "file:///projectB/": resB,
      },
    });

    expect(store.projects.size).toBe(2);
    expect(
      store.projects.get("file:///projectA/")?.compilationResult.edition,
    ).toBe(1);
    expect(
      store.projects.get("file:///projectB/")?.compilationResult.edition,
    ).toBe(1);

    // Project A updates, Project B unchanged (null), Project C added
    const resA2 = makeFakeProject(2);
    const resC = makeFakeProject(1);
    store.handleNotification({
      projects: {
        "file:///projectA/": resA2,
        "file:///projectB/": null,
        "file:///projectC/": resC,
      },
    });

    expect(store.projects.size).toBe(3);
    expect(
      store.projects.get("file:///projectA/")?.compilationResult.edition,
    ).toBe(2);
    expect(
      store.projects.get("file:///projectB/")?.compilationResult.edition,
    ).toBe(1);
    expect(
      store.projects.get("file:///projectC/")?.compilationResult.edition,
    ).toBe(1);

    // Project B removed
    store.handleNotification({
      projects: {
        "file:///projectA/": null,
        "file:///projectC/": null,
      },
    });

    expect(store.projects.size).toBe(2);
    expect(store.projects.has("file:///projectB/")).toBe(false);
  });

  it("finds project and relative path by URI with prefix matching", () => {
    const store = new ProjectStore();
    const resA = makeFakeProject(1, "file:///workspace/app/");
    const resB = makeFakeProject(2, "file:///workspace/lib/");

    store.handleNotification({
      projects: {
        "file:///workspace/app/": resA,
        "file:///workspace/lib": resB,
      },
    });

    const matchA = store.findByUri("file:///workspace/app/prompts/hello.tp");
    expect(matchA?.project.compilationResult.edition).toBe(1);
    expect(matchA?.relativePath).toBe("prompts/hello.tp");
    expect(matchA?.project.folderUri).toBe("file:///workspace/app/");

    const matchB = store.findByUri("file:///workspace/lib/prompts/shared.tp");
    expect(matchB?.project.compilationResult.edition).toBe(2);
    expect(matchB?.relativePath).toBe("prompts/shared.tp");
    expect(matchB?.project.folderUri).toBe("file:///workspace/lib/");

    const nonMatch = store.findByUri("file:///workspace/other/hello.tp");
    expect(nonMatch).toBe(null);
  });
});
