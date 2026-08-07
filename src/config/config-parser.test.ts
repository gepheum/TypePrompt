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
  it("parses a minimal config with enabled typescript codegen", () => {
    const config = parseConfigYaml({
      content: [
        "gen:",
        "  typescript:",
        "    enabled: true",
        "    file: out/prompts.ts",
      ].join("\n"),
      path: "config.yml",
    });

    expect(config).toMatch({
      gen: { typescript: { enabled: true, file: "out/prompts.ts" } },
    });
  });

  it("parses all fields", () => {
    const config = parseConfigYaml({
      content: [
        "input: prompts/*.tp",
        "gen:",
        "  typescript:",
        "    enabled: true",
        "    file: out/prompts.ts",
        "  python:",
        "    enabled: true",
        "    file: out/prompts.py",
      ].join("\n"),
      path: "config.yml",
    });

    expect(config).toMatch({
      input: "prompts/*.tp",
      gen: {
        typescript: { enabled: true, file: "out/prompts.ts" },
        python: { enabled: true, file: "out/prompts.py" },
      },
    });
  });

  it("accepts enabled: false without a file", () => {
    const config = parseConfigYaml({
      content: ["gen:", "  typescript:", "    enabled: false"].join("\n"),
      path: "config.yml",
    });
    expect(config).toMatch({ gen: { typescript: { enabled: false } } });
  });

  it("fails with line number on invalid YAML syntax", () => {
    expectConfigParseError(
      () =>
        parseConfigYaml({ content: "input: [unclosed", path: "config.yml" }),
      /config\.yml:\d+:\d+:/,
    );
  });

  it("fails with line number on unknown fields", () => {
    expectConfigParseError(
      () => parseConfigYaml({ content: "outputPath: x", path: "config.yml" }),
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
