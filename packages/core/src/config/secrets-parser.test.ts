import { expect } from "buckwheat";
import { describe, it } from "mocha";
import type { InternalErrors } from "../util/shared-types.js";
import {
  DEFAULT_SECRETS_YAML,
  type SecretsParseResult,
  parseSecretsYaml,
} from "./secrets-parser.js";

function parse(
  content: string,
  path = ".typeprompt.secrets.yaml",
): SecretsParseResult | InternalErrors {
  return parseSecretsYaml(content, path);
}

describe("parseSecretsYaml", () => {
  it("parses empty YAML object as empty secrets", () => {
    const result = parse("{}");
    expect(result).toMatch({
      kind: "success",
      secrets: {},
    });
  });

  it("parses all supported provider keys under apiKeys", () => {
    const yaml = [
      "apiKeys:",
      "  openai: sk-openai-123",
      "  anthropic: sk-ant-456",
      "  google: AIzaSy789",
      "  xai: xai-abc",
      "  mistral: mis-def",
      "  vercelGateway: vck-ghi",
    ].join("\n");

    const result = parse(yaml);
    expect(result).toMatch({
      kind: "success",
      secrets: {
        apiKeys: {
          openai: "sk-openai-123",
          anthropic: "sk-ant-456",
          google: "AIzaSy789",
          xai: "xai-abc",
          mistral: "mis-def",
          vercelGateway: "vck-ghi",
        },
      },
    });
  });

  it("parses subset of provider keys under apiKeys", () => {
    const yaml = [
      "# OpenAI and Google keys only",
      "apiKeys:",
      "  openai: sk-openai-only",
      "  google: AIzaSy-only",
    ].join("\n");

    const result = parse(yaml);
    expect(result).toMatch({
      kind: "success",
      secrets: {
        apiKeys: {
          openai: "sk-openai-only",
          google: "AIzaSy-only",
        },
      },
    });
  });

  it("fails when a provider key is empty string", () => {
    const yaml = ["apiKeys:", '  openai: ""'].join("\n");
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: yaml.indexOf('""') },
          message: "Must not be empty",
        },
      ],
    });
  });

  it("fails on unknown fields under apiKeys", () => {
    const yaml = ["apiKeys:", "  unknownProvider: sk-123"].join("\n");
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: yaml.indexOf("unknownProvider") },
          message: "Unknown field 'unknownProvider'",
        },
      ],
    });
  });

  it("fails on unknown top-level fields", () => {
    const yaml = "unknownSection:\n  foo: bar";
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: 0 },
          message: "Unknown field 'unknownSection'",
        },
      ],
    });
  });

  it("fails when a provider key is not a string", () => {
    const yaml = ["apiKeys:", "  openai: 12345"].join("\n");
    const result = parse(yaml);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: yaml.indexOf("12345") },
          message: "Expected string but got number",
        },
      ],
    });
  });

  it("fails on invalid YAML syntax", () => {
    const result = parse("apiKeys: [unclosed");
    expect(result).toMatch({
      kind: "error",
      errors: [{ span: { start: 18 }, message: /unclosed/ }],
    });
  });
});

describe("DEFAULT_SECRETS_YAML", () => {
  it("parses as a valid secrets file as-is", () => {
    const result = parseSecretsYaml(
      DEFAULT_SECRETS_YAML,
      ".typeprompt.secrets.yaml",
    );
    expect(result).toMatch({
      kind: "success",
      secrets: {
        apiKeys: {
          vercelGateway: "...",
        },
      },
    });
  });

  it("parses valid secrets when all commented provider keys are uncommented", () => {
    const lines = DEFAULT_SECRETS_YAML.split("\n");
    const apiKeysIndex = lines.findIndex((line) => line.trim() === "apiKeys:");
    expect(apiKeysIndex >= 0).toBe(true);

    const uncommentedLines = lines.map((line, idx) => {
      if (idx > apiKeysIndex && line.startsWith("  #")) {
        return line.replace(/^ {2}# ?/, "  ");
      }
      return line;
    });
    const uncommentedSecrets = uncommentedLines.join("\n");

    const result = parseSecretsYaml(
      uncommentedSecrets,
      ".typeprompt.secrets.yaml",
    );
    if (result.kind !== "success") {
      throw new Error(
        `Secrets validation failed:\n${result.errors.map((e) => e.message).join("\n")}`,
      );
    }

    expect(result.secrets.apiKeys).toMatch({
      vercelGateway: "...",
      openai: "sk-...",
      anthropic: "sk-...",
      google: "AIzaSy...",
      xai: "xai-...",
      mistral: "...",
    });
  });
});
