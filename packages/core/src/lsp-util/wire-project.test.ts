import { expect } from "buckwheat";
import { compile } from "../compiler/compiler.js";
import {
  toWireCompilationResult,
  type WireCompilationResults,
} from "./wire-compilation-result.js";

describe("WireCompilationResult", () => {
  it("converts CompilationResult to JSON-safe WireCompilationResult", () => {
    const files = {
      "Legal/shared.tp": `
<namespace name="Legal">
  type User = { id: string, name: string };
</namespace>
`,
      "Legal/ReviewContract.tp": `
<template name="ReviewContract" namespace="Legal">
  <schema>
    type Input = { user: shared.User };
    type Output = { greeting: string };
  </schema>
  <system>You are a helpful assistant.</system>
  <user>Hello, <insert val="input.user.name" />!</user>
</template>
`,
      "Legal/play.tp": `
<playground for="ReviewContract" namespace="Legal">
  <model>
    model: "openai/gpt-4o"
    temperature: 0.7
  </model>
  <samples>
    - input:
        user:
          id: "1"
          name: "Alice"
  </samples>
</playground>
`,
    };

    const compilation = compile(files, {
      cache: null,
      patchBase: null,
    });

    expect(compilation.anyErrors).toBe(false);

    const wire = toWireCompilationResult(compilation);

    // Verify it survives JSON round-tripping
    const jsonStr = JSON.stringify(wire);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.anyErrors).toBe(false);
    expect(parsed.edition).toBe(compilation.edition);

    // Check sourceFiles
    expect(wire.sourceFiles["Legal/play.tp"]?.entity?.kind).toBe("playground");
    if (wire.sourceFiles["Legal/play.tp"]?.entity?.kind === "playground") {
      expect(wire.sourceFiles["Legal/play.tp"].entity.forTemplate).toBe(
        "ReviewContract",
      );
      expect(wire.sourceFiles["Legal/play.tp"].entity.namespace).toBe("Legal");
    }

    expect(wire.sourceFiles["Legal/ReviewContract.tp"]?.entity?.kind).toBe(
      "template",
    );
    if (
      wire.sourceFiles["Legal/ReviewContract.tp"]?.entity?.kind === "template"
    ) {
      expect(wire.sourceFiles["Legal/ReviewContract.tp"].entity.name).toBe(
        "ReviewContract",
      );
      expect(wire.sourceFiles["Legal/ReviewContract.tp"].entity.namespace).toBe(
        "Legal",
      );
    }

    expect(wire.sourceFiles["Legal/shared.tp"]?.entity?.kind).toBe("namespace");
    if (wire.sourceFiles["Legal/shared.tp"]?.entity?.kind === "namespace") {
      expect(wire.sourceFiles["Legal/shared.tp"].entity.name).toBe("Legal");
    }

    // Check playgrounds
    expect(Object.keys(wire.playgrounds).length).toBe(1);
    const playgroundId = Object.keys(wire.playgrounds)[0]!;
    const playground = wire.playgrounds[playgroundId]!;
    expect(playground.isValid).toBe(true);
    expect(playground.forTemplate).toBe("Legal:ReviewContract");

    // Check templates
    expect(Object.keys(wire.templates).length).toBe(1);
    const templateId = Object.keys(wire.templates)[0]!;
    const template = wire.templates[templateId]!;
    expect(template.name).toBe("ReviewContract");
    expect(template.namespace).toBe("Legal");
    expect(template.isValid).toBe(true);

    // Check WireCompilationResults container
    const results: WireCompilationResults = {
      projects: {
        "file:///workspace/": wire,
        "file:///other/": null,
      },
    };
    const resultsJson = JSON.parse(JSON.stringify(results));
    expect(resultsJson.projects["file:///workspace/"] !== null).toBe(true);
    expect(resultsJson.projects["file:///other/"]).toBe(null);
  });
});
