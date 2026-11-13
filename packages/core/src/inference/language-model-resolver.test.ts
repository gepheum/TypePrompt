import { describe, it } from "mocha";
import assert from "node:assert/strict";
import { parseSecretsYaml } from "../config/secrets-parser.js";
import { tryResolveLanguageModel } from "./language-model-resolver.js";

describe("language-model-resolver", () => {
  it("returns error when apiKeys is not specified", () => {
    const resultOmitted = tryResolveLanguageModel({ model: "openai/gpt-4o" });
    assert.equal(resultOmitted.kind, "error");
    if (resultOmitted.kind === "error") {
      assert.equal(resultOmitted.shortMessage, "No API keys configured");
      assert.match(
        resultOmitted.detailedMessage,
        /create a \.typeprompt\.secrets\.yaml file in your project directory/i,
      );

      const yamlMatch = resultOmitted.detailedMessage.match(
        /```yaml\n([\s\S]*?)\n```/,
      );
      assert.ok(
        yamlMatch,
        "Expected detailedMessage to contain a ```yaml code block",
      );
      const yamlContent = yamlMatch[1];
      assert.ok(yamlContent, "Expected yaml content inside code block");
      const parsed = parseSecretsYaml(yamlContent, ".typeprompt.secrets.yaml");
      assert.equal(parsed.kind, "success");
      if (parsed.kind === "success") {
        assert.ok(parsed.secrets.apiKeys);
        assert.equal(parsed.secrets.apiKeys.openai, "sk-...");
      }
    }

    const resultUndefined = tryResolveLanguageModel(
      { model: "openai/gpt-4o" },
      undefined,
    );
    assert.equal(resultUndefined.kind, "error");
    if (resultUndefined.kind === "error") {
      assert.equal(resultUndefined.shortMessage, "No API keys configured");
      assert.match(
        resultUndefined.detailedMessage,
        /create a \.typeprompt\.secrets\.yaml file in your project directory/i,
      );
    }
  });

  it("returns error with shortMessage and detailedMessage when direct provider key is missing", () => {
    const result = tryResolveLanguageModel({ model: "openai/gpt-4o" }, {});
    assert.equal(result.kind, "error");
    if (result.kind === "error") {
      assert.equal(
        result.shortMessage,
        "Missing 'openai' or 'vercelGateway' API key",
      );
      assert.equal(
        result.detailedMessage,
        "Missing API key for model 'openai/gpt-4o': provide 'openai' or 'vercelGateway' API key",
      );
    }
  });

  it("returns error when other provider requires vercelGateway API key", () => {
    const result = tryResolveLanguageModel(
      { model: "deepseek/deepseek-r1" },
      { openai: "sk-test" },
    );
    assert.equal(result.kind, "error");
    if (result.kind === "error") {
      assert.equal(result.shortMessage, "Missing 'vercelGateway' API key");
      assert.equal(
        result.detailedMessage,
        "Missing 'vercelGateway' API key for model 'deepseek/deepseek-r1'",
      );
    }
  });

  it("resolves provider name, API key, and modelId successfully when direct provider API key is provided", () => {
    const result = tryResolveLanguageModel(
      { model: "openai/gpt-4o" },
      { openai: "sk-test-key" },
    );
    assert.equal(result.kind, "success");
    if (result.kind === "success") {
      assert.equal(result.provider, "openai");
      assert.equal(result.apiKey, "sk-test-key");
      assert.equal(result.modelId, "gpt-4o");
    }
  });

  it("resolves provider name, API key, and modelId successfully with vercelGateway API key", () => {
    const result = tryResolveLanguageModel(
      { model: "deepseek/deepseek-r1" },
      { vercelGateway: "v-gw-test-key" },
    );
    assert.equal(result.kind, "success");
    if (result.kind === "success") {
      assert.equal(result.provider, "vercelGateway");
      assert.equal(result.apiKey, "v-gw-test-key");
      assert.equal(result.modelId, "deepseek/deepseek-r1");
    }
  });
});
