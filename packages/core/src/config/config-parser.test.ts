import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { type ConfigParseResult, parseConfigYaml } from "./config-parser.js";

function parse(content: string, path = "typeprompt.yml"): ConfigParseResult {
  return parseConfigYaml(content, path);
}

describe("parseConfigYaml", () => {
  it("parses a minimal valid config with typescript codegen", () => {
    const result = parse(
      [
        "include:",
        "  - prompts/*.tp",
        "gen:",
        "  typescript:",
        "    file: out/prompts.ts",
      ].join("\n"),
    );

    expect(result).toMatch({
      kind: "success",
      config: {
        include: ["prompts/*.tp"],
        gen: { typescript: { file: "out/prompts.ts" } },
      },
    });
  });

  it("parses all fields", () => {
    const result = parse(
      [
        "include:",
        "  - prompts/*.tp",
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
        include: ["prompts/*.tp"],
        gen: {
          typescript: { file: "out/prompts.ts" },
          python: { file: "out/prompts.py" },
        },
      },
    });
  });

  it("accepts an empty gen block", () => {
    const result = parse("include:\n  - prompts/*.tp\ngen: {}");
    expect(result).toMatch({
      kind: "success",
      config: { include: ["prompts/*.tp"], gen: {} },
    });
  });

  it("accepts an array of include patterns", () => {
    const result = parse(
      ["include:", "  - prompts/*.tp", "  - other/**/*.tp", "gen: {}"].join(
        "\n",
      ),
    );
    expect(result).toMatch({
      kind: "success",
      config: { include: ["prompts/*.tp", "other/**/*.tp"], gen: {} },
    });
  });

  it("fails when include is a string instead of an array", () => {
    const yaml = "include: prompts/*.tp";
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: yaml.indexOf("prompts/*.tp") },
          message: "Expected array but got string",
        },
      ],
    });
  });

  it("fails when include array is empty", () => {
    const yaml = "include: []";
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: yaml.indexOf("[]") },
          message: "Must not be empty",
        },
      ],
    });
  });

  it("fails when include is missing", () => {
    const result = parse("{}");
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: 0 },
          message: "Missing required field 'include'",
        },
      ],
    });
  });

  it("fails on invalid YAML syntax and reports a span", () => {
    const result = parse("include: [unclosed");
    expect(result).toMatch({
      kind: "error",
      errors: [{ span: { start: 18 }, message: /unclosed/ }],
    });
  });

  it("fails on unknown top-level fields", () => {
    const yaml = "include:\n  - prompts/*.tp\noutputPath: x";
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: yaml.indexOf("outputPath") },
          message: "Unknown field 'outputPath'",
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
          message: "Expected array but got number",
        },
      ],
    });
  });

  it("fails when typescript file does not end with .ts", () => {
    const yaml = [
      "include:",
      "  - prompts/*.tp",
      "gen:",
      "  typescript:",
      "    file: out/prompts.py",
    ].join("\n");
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: yaml.indexOf("out/prompts.py") },
          message: "Must end with '.ts'",
        },
      ],
    });
  });

  it("fails when python file does not end with .py", () => {
    const yaml = [
      "include:",
      "  - prompts/*.tp",
      "gen:",
      "  python:",
      "    file: out/prompts.ts",
    ].join("\n");
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: yaml.indexOf("out/prompts.ts") },
          message: "Must end with '.py'",
        },
      ],
    });
  });

  it("fails on unknown nested fields", () => {
    const yaml = [
      "include:",
      "  - prompts/*.tp",
      "gen:",
      "  typescript:",
      "    file: out/p.ts",
      "    extra: x",
    ].join("\n");
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: yaml.indexOf("extra") },
          message: "Unknown field 'extra'",
        },
      ],
    });
  });

  it("fails on unknown top-level field play", () => {
    const yaml = [
      "include:",
      "  - prompts/*.tp",
      "play:",
      "  envFile: .env",
    ].join("\n");
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: yaml.indexOf("play") },
          message: "Unknown field 'play'",
        },
      ],
    });
  });
});
