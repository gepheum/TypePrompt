import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { type ConfigParseResult, parseConfigYaml } from "./config-parser.js";

function parse(content: string): ConfigParseResult {
  return parseConfigYaml({ content, path: "config.yml" });
}

describe("parseConfigYaml", () => {
  it("parses a minimal valid config with typescript codegen", () => {
    const result = parse(
      [
        "include: prompts/*.xml",
        "gen:",
        "  typescript:",
        "    file: out/prompts.ts",
      ].join("\n"),
    );

    expect(result).toMatch({
      kind: "success",
      config: {
        include: "prompts/*.xml",
        gen: { typescript: { file: "out/prompts.ts" } },
      },
    });
  });

  it("parses all fields", () => {
    const result = parse(
      [
        "include: prompts/*.tp",
        "gen:",
        "  typescript:",
        "    file: out/prompts.ts",
        "  python:",
        "    file: out/prompts.py",
      ].join("\n"),
    );

    expect(result).toMatch({
      kind: "success",
      config: {
        include: "prompts/*.tp",
        gen: {
          typescript: { file: "out/prompts.ts" },
          python: { file: "out/prompts.py" },
        },
      },
    });
  });

  it("accepts an empty gen block", () => {
    const result = parse("include: prompts/*.xml\ngen: {}");
    expect(result).toMatch({
      kind: "success",
      config: { include: "prompts/*.xml", gen: {} },
    });
  });

  it("fails when include is missing", () => {
    const result = parse("{}");
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /Invalid value for 'include'/ }],
    });
  });

  it("fails on invalid YAML syntax and reports a span", () => {
    const result = parse("include: [unclosed");
    expect(result).toMatch({
      kind: "error",
      errors: [{ span: { start: 18 }, message: /unclosed/ }],
    });
  });

  it("fails on unknown top-level fields with a root-level span", () => {
    const result = parse("include: prompts/*.xml\noutputPath: x");
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: 0 },
          message: /Unknown config field\(s\): 'outputPath'/,
        },
      ],
    });
  });

  it("fails with a span pointing at the bad value for wrong field type", () => {
    const yaml = "include: 123";
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: yaml.indexOf("123") },
          message: /Invalid value for 'include'/,
        },
      ],
    });
  });

  it("fails when typescript file does not end with .ts", () => {
    const result = parse(
      [
        "include: prompts/*.xml",
        "gen:",
        "  typescript:",
        "    file: out/prompts.py",
      ].join("\n"),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /Invalid value for 'gen.typescript.file'/ }],
    });
  });

  it("fails when python file does not end with .py", () => {
    const result = parse(
      [
        "include: prompts/*.xml",
        "gen:",
        "  python:",
        "    file: out/prompts.ts",
      ].join("\n"),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /Invalid value for 'gen.python.file'/ }],
    });
  });

  it("fails on unknown nested fields", () => {
    const result = parse(
      [
        "include: prompts/*.xml",
        "gen:",
        "  typescript:",
        "    file: out/p.ts",
        "    extra: x",
      ].join("\n"),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /Unknown config field\(s\): 'extra'/ }],
    });
  });
});
