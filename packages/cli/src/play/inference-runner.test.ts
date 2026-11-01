import { compile, type ValidCompilationResult } from "@typeprompt/core";
import { MockLanguageModelV4 } from "ai/test";
import { describe, it } from "mocha";
import assert from "node:assert/strict";
import {
  collectTemplateFilesForTemplate,
  resolveLanguageModel,
  runPlaygroundInferences,
} from "./inference-runner.js";

function compileValid(
  files: ReadonlyArray<{ readonly path: string; readonly content: string }>,
): ValidCompilationResult {
  const pathToContent: Record<string, string> = {};
  for (const f of files) {
    pathToContent[f.path] = f.content;
  }
  const result = compile(pathToContent, { cache: null, patchBase: null });
  if (result.anyErrors) {
    throw new Error(
      `Expected valid compilation result, got errors: ${JSON.stringify(result.finalErrors)}`,
    );
  }
  return result as ValidCompilationResult;
}

describe("inference-runner", () => {
  describe("resolveLanguageModel", () => {
    it("uses openaiApiKey when model is openai/* and openaiApiKey is present", () => {
      const model = resolveLanguageModel("openai/gpt-4o", {
        openaiApiKey: "sk-openai-test",
        vercelGatewayApiKey: "vg-test",
      });
      assert.equal(typeof model, "object");
      assert.equal((model as { modelId: string }).modelId, "gpt-4o");
      assert.ok((model as { provider: string }).provider.startsWith("openai"));
    });

    it("falls back to vercelGatewayApiKey when model is openai/* and openaiApiKey is absent", () => {
      const model = resolveLanguageModel("openai/gpt-4o", {
        vercelGatewayApiKey: "vg-test",
      });
      assert.equal(typeof model, "object");
      assert.equal((model as { modelId: string }).modelId, "openai/gpt-4o");
      assert.ok((model as { provider: string }).provider.includes("gateway"));
    });

    it("throws when model is openai/* and neither openaiApiKey nor vercelGatewayApiKey is provided", () => {
      assert.throws(
        () => resolveLanguageModel("openai/gpt-4o", {}),
        /Missing API key for model 'openai\/gpt-4o'/,
      );
    });

    it("uses anthropicApiKey when model is anthropic/* and anthropicApiKey is present", () => {
      const model = resolveLanguageModel("anthropic/claude-sonnet-4.5", {
        anthropicApiKey: "sk-ant-test",
      });
      assert.equal(typeof model, "object");
      assert.equal((model as { modelId: string }).modelId, "claude-sonnet-4.5");
      assert.ok(
        (model as { provider: string }).provider.startsWith("anthropic"),
      );
    });

    it("uses googleApiKey when model is google/* and googleApiKey is present", () => {
      const model = resolveLanguageModel("google/gemini-2.5-pro", {
        googleApiKey: "goog-test",
      });
      assert.equal(typeof model, "object");
      assert.equal((model as { modelId: string }).modelId, "gemini-2.5-pro");
      assert.ok((model as { provider: string }).provider.startsWith("google"));
    });

    it("uses xaiApiKey when model is spacexai/* and xaiApiKey is present", () => {
      const model = resolveLanguageModel("spacexai/grok-4.5", {
        xaiApiKey: "xai-test",
      });
      assert.equal(typeof model, "object");
      assert.equal((model as { modelId: string }).modelId, "grok-4.5");
      assert.ok((model as { provider: string }).provider.startsWith("xai"));
    });

    it("uses mistralApiKey when model is mistral/* and mistralApiKey is present", () => {
      const model = resolveLanguageModel("mistral/mistral-large-4", {
        mistralApiKey: "mistral-test",
      });
      assert.equal(typeof model, "object");
      assert.equal((model as { modelId: string }).modelId, "mistral-large-4");
      assert.ok((model as { provider: string }).provider.startsWith("mistral"));
    });

    it("always uses vercelGatewayApiKey for unsupported direct providers and errors if missing", () => {
      const model = resolveLanguageModel("deepseek/deepseek-r1", {
        openaiApiKey: "sk-openai-test",
        vercelGatewayApiKey: "vg-test",
      });
      assert.equal(
        (model as { modelId: string }).modelId,
        "deepseek/deepseek-r1",
      );

      assert.throws(
        () =>
          resolveLanguageModel("deepseek/deepseek-r1", {
            openaiApiKey: "sk-openai-test",
          }),
        /Missing 'vercelGatewayApiKey' for model 'deepseek\/deepseek-r1'/,
      );
    });
  });

  describe("collectTemplateFilesForTemplate", () => {
    it("includes only the template, its tools, namespace, meta, and playground files", () => {
      const compilation = compileValid([
        {
          path: "prompts/_meta.tp",
          content: "<meta>type Meta = { owner: string; };</meta>",
        },
        {
          path: "prompts/billing/_namespace.tp",
          content: '<namespace name="Billing"></namespace>',
        },
        {
          path: "prompts/billing/lookup.tp",
          content: `<tool name="lookupInvoice" namespace="Billing">
  <description>Looks up an invoice</description>
  <schema>
    type Input = { invoiceId: string; };
    type Output = { amount: number; };
  </schema>
</tool>`,
        },
        {
          path: "prompts/billing/unused-tool.tp",
          content: `<tool name="unusedTool" namespace="Billing">
  <description>Not used by Refund</description>
  <schema>
    type Input = { x: string; };
    type Output = string;
  </schema>
</tool>`,
        },
        {
          path: "prompts/billing/refund.tp",
          content: `<template name="Refund" namespace="Billing">
  <meta>
    owner: "billing-team"
  </meta>
  <tools>
    <tool name="lookupInvoice" />
  </tools>
  <schema>
    type Input = { customer: string; };
    type Output = { approved: boolean; };
  </schema>
  <system>You handle refunds with <c>lookupInvoice</c>.</system>
  <user>Customer: <insert val="input.customer"/></user>
</template>`,
        },
        {
          path: "prompts/billing/refund.play.tp",
          content: `<playground for="Refund" namespace="Billing">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - name: "basic"
      input:
        customer: "Alice"
  </samples>
</playground>`,
        },
        {
          path: "prompts/other/unrelated.tp",
          content: `<template name="Unrelated" namespace="Billing">
  <meta>
    owner: "other-team"
  </meta>
  <schema>
    type Input = { q: string; };
    type Output = string;
  </schema>
  <system>Sys</system>
  <user><insert val="input.q"/></user>
</template>`,
        },
      ]);

      const files = collectTemplateFilesForTemplate(
        compilation,
        "Billing:Refund",
      );
      const paths = Object.keys(files).sort();
      assert.deepEqual(paths, [
        "prompts/_meta.tp",
        "prompts/billing/_namespace.tp",
        "prompts/billing/lookup.tp",
        "prompts/billing/refund.play.tp",
        "prompts/billing/refund.tp",
      ]);
    });
  });

  describe("runPlaygroundInferences", () => {
    it("renders messages (examples, history, input, steps) and parses structured JSON output", async () => {
      const compilation = compileValid([
        {
          path: "prompts/assist.tp",
          content: `<template name="Assist">
  <tools>
    <tool name="getWeather" />
  </tools>
  <schema>
    type Input = { city: string; };
    type Output = { summary: string; tempC: integer; };
  </schema>
  <system>You are a weather assistant using <c>getWeather</c>.</system>
  <user>Weather in <insert val="input.city"/>?</user>
  <examples>
    - input:
        city: "Paris"
      output:
        summary: "Sunny"
        tempC: 22
  </examples>
</template>`,
        },
        {
          path: "prompts/weather-tool.tp",
          content: `<tool name="getWeather">
  <description>Fetches current weather</description>
  <schema>
    type Input = { city: string; };
    type Output = { tempC: integer; };
  </schema>
</tool>`,
        },
        {
          path: "prompts/assist.play.tp",
          content: `<playground for="Assist">
  <model>
    model: openai/gpt-4o
    temperature: 0.2
  </model>
  <samples>
    - name: "london-with-step"
      history:
        - input:
            city: "Berlin"
          output:
            summary: "Cloudy"
            tempC: 16
      input:
        city: "London"
      steps:
        - toolCalls:
            - tool: getWeather
              callId: "call_1"
              input:
                city: "London"
              output:
                tempC: 14
  </samples>
</playground>`,
        },
      ]);

      const mockModel = new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [
            { type: "reasoning", text: "Checking tool result for London." },
            {
              type: "text",
              text: JSON.stringify({ summary: "Rainy", tempC: 14 }),
            },
          ],
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: {
              total: 100,
              noCache: 80,
              cacheRead: 20,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 30,
              text: 20,
              reasoning: 10,
            },
          },
          warnings: [],
        }),
      });

      const inferenceSet = await runPlaygroundInferences(
        compilation,
        "Main:Assist",
        { languageModel: mockModel },
      );

      assert.equal(inferenceSet.templateId, "Main:Assist");
      assert.equal(inferenceSet.model.model, "openai/gpt-4o");
      assert.equal(inferenceSet.model.temperature, 0.2);
      assert.equal(inferenceSet.inferences.length, 1);

      const inf = inferenceSet.inferences[0]!;
      assert.equal(inf.name, "london-with-step");
      assert.equal(
        inf.request.systemMessage,
        "You are a weather assistant using getWeather.",
      );
      assert.equal(inf.request.outputFormat.format, "json");
      assert.equal(inf.request.tools.length, 1);
      assert.equal(inf.request.tools[0]!.name, "getWeather");

      // Messages: 2 (example user/assistant) + 2 (history user/assistant) + 1 (sample input user) + 2 (step tool-calls/tool-results) = 7
      assert.equal(inf.request.messages.length, 7);
      assert.deepEqual(inf.request.messages[0], {
        role: "user",
        input: { city: "Paris" },
        rendered: "Weather in Paris?",
      });
      assert.deepEqual(inf.request.messages[4], {
        role: "user",
        input: { city: "London" },
        rendered: "Weather in London?",
      });
      assert.equal(inf.request.messages[5]!.role, "assistant");
      assert.ok("toolCalls" in inf.request.messages[5]!);
      assert.equal(inf.request.messages[6]!.role, "tool");

      assert.equal(inf.result.kind, "success");
      if (inf.result.kind === "success") {
        assert.equal(inf.result.reasoning, "Checking tool result for London.");
        assert.deepEqual(inf.result.response, {
          kind: "output",
          rawText: '{"summary":"Rainy","tempC":14}',
          output: { summary: "Rainy", tempC: 14 },
        });
        assert.equal(inf.result.telemetry.usage?.inputTokens, 100);
        assert.equal(inf.result.telemetry.usage?.cachedInputTokens, 20);
        assert.equal(inf.result.telemetry.usage?.outputTokens, 30);
        assert.equal(inf.result.telemetry.usage?.reasoningTokens, 10);
        assert.equal(inf.result.telemetry.usage?.totalTokens, 130);
      }
    });

    it("returns tool-calls response when model emits tool calls", async () => {
      const compilation = compileValid([
        {
          path: "prompts/assist.tp",
          content: `<template name="Assist">
  <tools>
    <tool name="getWeather" />
  </tools>
  <schema>
    type Input = { city: string; };
    type Output = string;
  </schema>
  <system>Use <c>getWeather</c>.</system>
  <user>Weather in <insert val="input.city"/>?</user>
</template>`,
        },
        {
          path: "prompts/weather-tool.tp",
          content: `<tool name="getWeather">
  <description>Fetches current weather</description>
  <schema>
    type Input = { city: string; };
    type Output = { tempC: integer; };
  </schema>
</tool>`,
        },
        {
          path: "prompts/assist.play.tp",
          content: `<playground for="Assist">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - name: "call-tool"
      input:
        city: "Tokyo"
  </samples>
</playground>`,
        },
      ]);

      const mockModel = new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [
            {
              type: "tool-call",
              toolCallId: "tc_123",
              toolName: "getWeather",
              input: JSON.stringify({ city: "Tokyo" }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage: {
            inputTokens: {
              total: 20,
              noCache: 20,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 10,
              text: 0,
              reasoning: undefined,
            },
          },
          warnings: [],
        }),
      });

      const inferenceSet = await runPlaygroundInferences(
        compilation,
        "Main:Assist",
        { languageModel: mockModel },
      );

      const inf = inferenceSet.inferences[0]!;
      assert.equal(inf.result.kind, "success");
      if (inf.result.kind === "success") {
        assert.deepEqual(inf.result.response, {
          kind: "tool-calls",
          toolCalls: [
            {
              callId: "tc_123",
              toolName: "getWeather",
              input: { city: "Tokyo" },
            },
          ],
        });
      }
    });

    it("distinguishes parse-error, validation-error, and api-error", async () => {
      const compilation = compileValid([
        {
          path: "prompts/check.tp",
          content: `<template name="Check">
  <schema>
    type Input = { x: integer; };
    type Output = { count: integer; };
  </schema>
  <system>Sys</system>
  <user><insert val="input.x"/></user>
</template>`,
        },
        {
          path: "prompts/check.play.tp",
          content: `<playground for="Check">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - name: "bad-json"
      input:
        x: 1
    - name: "bad-schema"
      input:
        x: 2
    - name: "api-fail"
      input:
        x: 3
  </samples>
</playground>`,
        },
      ]);

      let callCount = 0;
      const mockModel = new MockLanguageModelV4({
        doGenerate: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              content: [{ type: "text", text: "{ not valid json" }],
              finishReason: { unified: "stop", raw: undefined },
              usage: {
                inputTokens: {
                  total: 10,
                  noCache: 10,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 5,
                  text: 5,
                  reasoning: undefined,
                },
              },
              warnings: [],
            };
          }
          if (callCount === 2) {
            return {
              content: [
                { type: "text", text: JSON.stringify({ count: "wrong-type" }) },
              ],
              finishReason: { unified: "stop", raw: undefined },
              usage: {
                inputTokens: {
                  total: 10,
                  noCache: 10,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 5,
                  text: 5,
                  reasoning: undefined,
                },
              },
              warnings: [],
            };
          }
          throw new Error("Rate limit exceeded");
        },
      });

      const inferenceSet = await runPlaygroundInferences(
        compilation,
        "Main:Check",
        {
          languageModel: mockModel,
        },
      );

      const [badJson, badSchema, apiFail] = inferenceSet.inferences;
      assert.equal(badJson!.result.kind, "error");
      if (badJson!.result.kind === "error") {
        assert.equal(badJson!.result.error.kind, "parse-error");
        assert.equal(badJson!.result.error.rawText, "{ not valid json");
      }

      assert.equal(badSchema!.result.kind, "error");
      if (badSchema!.result.kind === "error") {
        assert.equal(badSchema!.result.error.kind, "validation-error");
        assert.equal(badSchema!.result.error.rawText, '{"count":"wrong-type"}');
      }

      assert.equal(apiFail!.result.kind, "error");
      if (apiFail!.result.kind === "error") {
        assert.equal(apiFail!.result.error.kind, "api-error");
        assert.match(apiFail!.result.error.message, /Rate limit exceeded/);
      }
    });

    it("enforces maxConcurrency while preserving sample order", async () => {
      const compilation = compileValid([
        {
          path: "prompts/echo.tp",
          content: `<template name="Echo">
  <schema>
    type Input = { index: integer; };
    type Output = string;
  </schema>
  <system>Sys</system>
  <user><insert val="input.index"/></user>
</template>`,
        },
        {
          path: "prompts/echo.play.tp",
          content: `<playground for="Echo">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - name: "s0"
      input: { index: 0 }
    - name: "s1"
      input: { index: 1 }
    - name: "s2"
      input: { index: 2 }
    - name: "s3"
      input: { index: 3 }
    - name: "s4"
      input: { index: 4 }
  </samples>
</playground>`,
        },
      ]);

      let active = 0;
      let maxObservedActive = 0;

      const mockModel = new MockLanguageModelV4({
        doGenerate: async () => {
          active++;
          maxObservedActive = Math.max(maxObservedActive, active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active--;
          return {
            content: [{ type: "text", text: "ok" }],
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: {
                total: 5,
                noCache: 5,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 2,
                text: 2,
                reasoning: undefined,
              },
            },
            warnings: [],
          };
        },
      });

      const inferenceSet = await runPlaygroundInferences(
        compilation,
        "Main:Echo",
        {
          languageModel: mockModel,
          maxConcurrency: 2,
        },
      );

      assert.equal(maxObservedActive, 2);
      assert.deepEqual(
        inferenceSet.inferences.map((inf) => inf.name),
        ["s0", "s1", "s2", "s3", "s4"],
      );
      assert.deepEqual(
        inferenceSet.inferences.map((inf) => inf.sampleIndex),
        [0, 1, 2, 3, 4],
      );
    });
  });
});
