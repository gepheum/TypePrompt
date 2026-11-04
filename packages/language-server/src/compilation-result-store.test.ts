import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { CompilationResultStore } from "./compilation-result-store.js";
import type { WireCompilationResult } from "./wire-compilation-result.js";

function makeFakeResult(edition: number): WireCompilationResult {
  return {
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
  };
}

describe("CompilationResultStore", () => {
  it("populates new projects and prunes removed projects", () => {
    const store = new CompilationResultStore();
    const resA = makeFakeResult(1);
    const resB = makeFakeResult(1);

    store.handleNotification({
      projects: {
        "file:///projectA/": resA,
        "file:///projectB/": resB,
      },
    });

    expect(store.projects.size).toBe(2);
    expect(store.projects.get("file:///projectA/")?.edition).toBe(1);
    expect(store.projects.get("file:///projectB/")?.edition).toBe(1);

    // Project A updates, Project B unchanged (null), Project C added
    const resA2 = makeFakeResult(2);
    const resC = makeFakeResult(1);
    store.handleNotification({
      projects: {
        "file:///projectA/": resA2,
        "file:///projectB/": null,
        "file:///projectC/": resC,
      },
    });

    expect(store.projects.size).toBe(3);
    expect(store.projects.get("file:///projectA/")?.edition).toBe(2);
    expect(store.projects.get("file:///projectB/")?.edition).toBe(1);
    expect(store.projects.get("file:///projectC/")?.edition).toBe(1);

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

  it("finds compilation result for file by prefix matching", () => {
    const store = new CompilationResultStore();
    const resA = makeFakeResult(1);

    store.handleNotification({
      projects: {
        "file:///workspace/app/": resA,
      },
    });

    const match = store.getForFile("file:///workspace/app/prompts/hello.tp");
    expect(match?.edition).toBe(1);

    const nonMatch = store.getForFile("file:///workspace/other/hello.tp");
    expect(nonMatch === undefined).toBe(true);
  });
});

