import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { ConfigParseError, parseConfigToml } from "./config-parser.js";

function expectConfigParseError(
  fn: () => unknown,
  messagePattern: RegExp,
): void {
  try {
    fn();
  } catch (error: unknown) {
    if (!(error instanceof ConfigParseError)) {
      throw error;
    }
    expect(error.message).toMatch(messagePattern);
    return;
  }

  throw new Error("Expected ConfigParseError to be thrown");
}

describe("parseConfigToml", () => {
  it("parses canonical field names", () => {
    const config = parseConfigToml({
      content: [
        'input = "prompts/*.tp"',
        'generatedDotPyPath = "out/prompts.py"',
        'generatedDotTsPath = "out/prompts.ts"',
      ].join("\n"),
      path: "config.toml",
    });

    expect(config).toMatch({
      input: "prompts/*.tp",
      generatedDotPyPath: "out/prompts.py",
      generatedDotTsPath: "out/prompts.ts",
    });
  });

  it("accepts generatedPythonPath and generatedTypeScriptPath aliases", () => {
    const config = parseConfigToml({
      content: [
        'generatedPythonPath = "out/prompts.py"',
        'generatedTypeScriptPath = "out/prompts.ts"',
      ].join("\n"),
      path: "config.toml",
    });

    expect(config).toMatch({
      generatedDotPyPath: "out/prompts.py",
      generatedDotTsPath: "out/prompts.ts",
    });
  });

  it("fails with clear TOML syntax errors", () => {
    expectConfigParseError(
      () => parseConfigToml({ content: 'input = "oops', path: "config.toml" }),
      /config\.toml: invalid TOML syntax:/,
    );
  });

  it("fails on unknown fields", () => {
    expectConfigParseError(
      () =>
        parseConfigToml({ content: 'outputPath = "x"', path: "config.toml" }),
      /unknown config field\(s\): 'outputPath'/,
    );
  });

  it("fails on wrong field type", () => {
    expectConfigParseError(
      () => parseConfigToml({ content: "input = 123", path: "config.toml" }),
      /invalid value for 'input': Invalid input: expected string, received number/,
    );
  });

  it("fails on conflicting alias and canonical values", () => {
    expectConfigParseError(
      () =>
        parseConfigToml({
          content: [
            'generatedDotPyPath = "a.py"',
            'generatedPythonPath = "b.py"',
          ].join("\n"),
          path: "config.toml",
        }),
      /invalid value for 'generatedPythonPath': conflicts with 'generatedDotPyPath'/,
    );
  });
});
