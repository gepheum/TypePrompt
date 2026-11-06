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

  it("finds project and relative path by URI with prefix matching", () => {
    const store = new CompilationResultStore();
    const resA = makeFakeResult(1);
    const resB = makeFakeResult(2);

    store.handleNotification({
      projects: {
        "file:///workspace/app/": resA,
        "file:///workspace/lib": resB,
      },
    });

    const matchA = store.findByUri("file:///workspace/app/prompts/hello.tp");
    expect(matchA?.project.edition).toBe(1);
    expect(matchA?.relativePath).toBe("prompts/hello.tp");

    const matchB = store.findByUri("file:///workspace/lib/prompts/shared.tp");
    expect(matchB?.project.edition).toBe(2);
    expect(matchB?.relativePath).toBe("prompts/shared.tp");

    const nonMatch = store.findByUri("file:///workspace/other/hello.tp");
    expect(nonMatch).toBe(null);
  });
});
