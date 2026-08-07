import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { ConfigParseError, parseConfigYaml } from "./config-parser.js";

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

describe("parseConfigYaml", () => {
  it("parses a minimal config with only gen.typescript.dotTsPath", () => {
    const config = parseConfigYaml({
      content: [
        "gen:",
        "  typescript:",
        '    dotTsPath: out/prompts.ts',
      ].join("\n"),
      path: "config.yml",
    });

    expect(config).toMatch({
      gen: { typescript: { dotTsPath: "out/prompts.ts" } },
    });
  });

  it("parses all fields", () => {
    const config = parseConfigYaml({
      content: [
        "input: prompts/*.tp",
        "gen:",
        "  typescript:",
        "    dotTsPath: out/prompts.ts",
        "  python:",
        "    dotPyPath: out/prompts.py",
      ].join("\n"),
      path: "config.yml",
    });

    expect(config).toMatch({
      input: "prompts/*.tp",
      gen: {
        typescript: { dotTsPath: "out/prompts.ts" },
        python: { dotPyPath: "out/prompts.py" },
      },
    });
  });

  it("fails with line number on invalid YAML syntax", () => {
    expectConfigParseError(
      () => parseConfigYaml({ content: "input: [unclosed", path: "config.yml" }),
      /config\.yml:\d+:\d+:/,
    );
  });

  it("fails with line number on unknown fields", () => {
    expectConfigParseError(
      () =>
        parseConfigYaml({ content: "outputPath: x", path: "config.yml" }),
      /config\.yml:\d+:\d+:.*unknown config field\(s\): 'outputPath'/,
    );
  });

  it("fails with line number on wrong field type", () => {
    expectConfigParseError(
      () => parseConfigYaml({ content: "input: 123", path: "config.yml" }),
      /config\.yml:\d+:\d+:.*invalid value for 'input'/,
    );
  });
});
