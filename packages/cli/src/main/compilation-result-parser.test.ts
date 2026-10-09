import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { parseCompilationResult } from "./compilation-result-parser.js";
import { ExitError } from "./exit-error.js";
import { HELLO_WORLD_TEMPLATE } from "./project-initializer.js";

describe("parseCompilationResult", () => {
  it("compiles valid templates JSON to ValidCompilationResult", () => {
    const validJson = JSON.stringify({
      edition: 0,
      signature: "test-sig",
      singleNamespace: true,
      templates: {},
      tools: {},
      sourceFiles: {
        "prompts/hello.xml": HELLO_WORLD_TEMPLATE,
      },
    });

    const result = parseCompilationResult(validJson, "test.json");
    expect(result.anyErrors).toBe(false);
    expect(result.templates["Main:SayHello"] !== undefined).toBe(true);
  });

  it("throws ExitError on invalid JSON syntax", () => {
    let error: unknown;
    try {
      parseCompilationResult("{ invalid json", "bad.json");
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
    expect((error as ExitError).message).toMatch(
      /Failed to parse JSON in bad\.json/,
    );
  });

  it("throws ExitError on invalid schema", () => {
    let error: unknown;
    try {
      parseCompilationResult(
        JSON.stringify({ edition: "not a number" }),
        "schema.json",
      );
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
    expect((error as ExitError).message).toMatch(
      /Invalid templates JSON in schema\.json/,
    );
  });

  it("throws ExitError if templates fail compilation", () => {
    const invalidTemplateJson = JSON.stringify({
      edition: 0,
      signature: "test-sig",
      singleNamespace: true,
      templates: {},
      tools: {},
      sourceFiles: {
        "prompts/invalid.xml": "<not-valid-xml",
      },
    });

    let error: unknown;
    try {
      parseCompilationResult(invalidTemplateJson, "invalid-template.json");
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
    expect((error as ExitError).message).toBe(
      "Compilation of base project failed",
    );
  });
});
