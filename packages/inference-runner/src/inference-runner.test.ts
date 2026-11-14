import type { Inferences } from "@typeprompt/core";
import { compile, type ValidCompilationResult } from "@typeprompt/core";
import { MockLanguageModelV4 } from "ai/test";
import { describe, it } from "mocha";
import assert from "node:assert/strict";
import { runPlaygroundInferences } from "./inference-runner.js";

type MockDoGenerateResult = Awaited<
  ReturnType<MockLanguageModelV4["doGenerate"]>
>;

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
  describe("API key resolution", () => {
    it("throws when apiKeys is not specified, instructing to create .typeprompt.secrets.yaml", async () => {
      const compilation = compileValid([
        {
          path: "prompts/t.tp",
          content: `<template name="T">
  <schema>
    type Input = string;
    type Output = string;
  </schema>
  <system>Sys</system>
  <user><insert val="input"/></user>
</template>`,
        },
        {
          path: "prompts/t.play.tp",
          content: `<playground for="T">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - input: "hi"
  </samples>
</playground>`,
        },
      ]);

      await assert.rejects(
        () => runPlaygroundInferences(compilation, "Main:T", {}),
        /create a \.typeprompt\.secrets\.yaml file in your project directory/i,
      );
    });

    it("throws when model is openai/* and neither openaiApiKey nor vercelGatewayApiKey is provided", async () => {
      const compilation = compileValid([
        {
          path: "prompts/t.tp",
          content: `<template name="T">
  <schema>
    type Input = string;
    type Output = string;
  </schema>
  <system>Sys</system>
  <user><insert val="input"/></user>
</template>`,
        },
        {
          path: "prompts/t.play.tp",
          content: `<playground for="T">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - input: "hi"
  </samples>
</playground>`,
        },
      ]);

      await assert.rejects(
        () => runPlaygroundInferences(compilation, "Main:T", { apiKeys: {} }),
        /Missing API key for model 'openai\/gpt-4o'/,
      );
    });

    it("throws when model is an unsupported direct provider and vercelGatewayApiKey is missing", async () => {
      const compilation = compileValid([
        {
          path: "prompts/t.tp",
          content: `<template name="T">
  <schema>
    type Input = string;
    type Output = string;
  </schema>
  <system>Sys</system>
  <user><insert val="input"/></user>
</template>`,
        },
        {
          path: "prompts/t.play.tp",
          content: `<playground for="T">
  <model>
    model: deepseek/deepseek-r1
  </model>
  <samples>
    - input: "hi"
  </samples>
</playground>`,
        },
      ]);

      await assert.rejects(
        () =>
          runPlaygroundInferences(compilation, "Main:T", {
            apiKeys: { openai: "sk-openai-test" },
          }),
        /Missing 'vercelGateway' API key for model 'deepseek\/deepseek-r1'/,
      );
    });
  });

  describe("sourceFiles filtering", () => {
    it("includes only the template, its tools, namespace, meta, and playground files with kinds", async () => {
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

      const mockModel = new MockLanguageModelV4({
        doGenerate: async (): Promise<MockDoGenerateResult> => ({
          content: [{ type: "text", text: JSON.stringify({ approved: true }) }],
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
        }),
      });

      const inferenceRun = await runPlaygroundInferences(
        compilation,
        "Billing:Refund",
        { languageModel: mockModel },
      );
      const paths = Object.keys(inferenceRun.sourceFiles).sort();
      assert.deepEqual(paths, [
        "prompts/_meta.tp",
        "prompts/billing/_namespace.tp",
        "prompts/billing/lookup.tp",
        "prompts/billing/refund.play.tp",
        "prompts/billing/refund.tp",
      ]);
      assert.strictEqual(
        inferenceRun.sourceFiles["prompts/_meta.tp"]?.kind,
        "meta",
      );
      assert.strictEqual(
        inferenceRun.sourceFiles["prompts/billing/_namespace.tp"]?.kind,
        "namespace",
      );
      assert.strictEqual(
        inferenceRun.sourceFiles["prompts/billing/lookup.tp"]?.kind,
        "tool",
      );
      assert.strictEqual(
        inferenceRun.sourceFiles["prompts/billing/refund.play.tp"]?.kind,
        "playground",
      );
      assert.strictEqual(
        inferenceRun.sourceFiles["prompts/billing/refund.tp"]?.kind,
        "template",
      );
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
      note: "Test note for London"
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
        doGenerate: async (): Promise<MockDoGenerateResult> => ({
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

      const inferenceRun = await runPlaygroundInferences(
        compilation,
        "Main:Assist",
        { languageModel: mockModel },
      );

      assert.match(inferenceRun.id, /^[0-9a-zA-Z]{8}$/);
      assert.equal(inferenceRun.templateId, "Main:Assist");
      assert.equal(inferenceRun.model.model, "openai/gpt-4o");
      assert.equal(inferenceRun.model.temperature, 0.2);
      assert.equal(inferenceRun.samples.length, 1);

      const inf = inferenceRun.samples[0]!;
      assert.equal(inf.sample.name, "london-with-step");
      assert.equal(inf.sample.note, "Test note for London");
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
        doGenerate: async (): Promise<MockDoGenerateResult> => ({
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

      const inferenceRun = await runPlaygroundInferences(
        compilation,
        "Main:Assist",
        { languageModel: mockModel },
      );

      const inf = inferenceRun.samples[0]!;
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
        doGenerate: async (): Promise<MockDoGenerateResult> => {
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

      const inferenceRun = await runPlaygroundInferences(
        compilation,
        "Main:Check",
        {
          languageModel: mockModel,
        },
      );

      const [badJson, badSchema, apiFail] = inferenceRun.samples;
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
        doGenerate: async (): Promise<MockDoGenerateResult> => {
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

      const inferenceRun = await runPlaygroundInferences(
        compilation,
        "Main:Echo",
        {
          languageModel: mockModel,
          maxConcurrency: 2,
        },
      );

      assert.equal(maxObservedActive, 2);
      assert.deepEqual(
        inferenceRun.samples.map((inf) => inf.sample.name),
        ["s0", "s1", "s2", "s3", "s4"],
      );
      assert.deepEqual(
        inferenceRun.samples.map((inf) => inf.sampleIndex),
        [0, 1, 2, 3, 4],
      );
    });

    it("normalizes interface field order to match schema declaration order when rendering json, csv, and toon", async () => {
      const compilation = compileValid([
        {
          path: "prompts/report.tp",
          content: `<template name="Report">
  <schema>
    type Row = {
      firstCol: string;
      secondCol: integer;
      thirdCol: string;
    };
    type Event =
      | { kind: "click"; x: integer; y: integer }
      | { kind: "keypress"; key: string; code: integer };
    type Input = {
      rows: Row[];
      event: Event;
    };
    type Output = string;
  </schema>
  <system>Sys</system>
  <user>CSV:
<insert val="input.rows" format="csv"/>
JSON:
<insert val="input.event" format="json"/>
TOON:
<insert val="input.rows" format="toon"/>
</user>
</template>`,
        },
        {
          path: "prompts/report.play.tp",
          content: `<playground for="Report">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - name: "out-of-order-yaml"
      input:
        event:
          y: 20
          x: 10
          kind: "click"
        rows:
          - thirdCol: "c1"
            firstCol: "a1"
            secondCol: 1
          - secondCol: 2
            thirdCol: "c2"
            firstCol: "a2"
  </samples>
</playground>`,
        },
      ]);

      const mockModel = new MockLanguageModelV4({
        doGenerate: async (): Promise<MockDoGenerateResult> => ({
          content: [{ type: "text", text: "done" }],
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
        }),
      });

      const inferenceRun = await runPlaygroundInferences(
        compilation,
        "Main:Report",
        { languageModel: mockModel },
      );

      const userMsg = inferenceRun.samples[0]!.request.messages[0]!;
      assert.equal(userMsg.role, "user");
      if (userMsg.role === "user") {
        // Verify CSV header and row columns follow schema order (firstCol, secondCol, thirdCol)
        assert.match(
          userMsg.rendered,
          /CSV:\nfirstCol,secondCol,thirdCol\na1,1,c1\na2,2,c2/,
        );
        // Verify JSON keys follow discriminated union member schema order (kind, x, y)
        assert.match(
          userMsg.rendered,
          /JSON:\n\{\n {2}"kind": "click",\n {2}"x": 10,\n {2}"y": 20\n\}/,
        );
        // Verify normalized input object keys follow schema order (rows, event)
        assert.deepEqual(
          Object.keys(userMsg.input as Record<string, unknown>),
          ["rows", "event"],
        );
      }
    });

    it("invokes callback immediately with pending inferences, progressively as results arrive, and upon completion", async () => {
      const compilation = compileValid([
        {
          path: "prompts/test.tp",
          content: `<template name="Test">
  <schema>
    type Input = { message: string; };
    type Output = string;
  </schema>
  <system>Echo</system>
  <user><insert val="input.message"/></user>
</template>`,
        },
        {
          path: "prompts/test.play.tp",
          content: `<playground for="Test">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - name: "first"
      input:
        message: "hello 1"
    - name: "second"
      input:
        message: "hello 2"
  </samples>
</playground>`,
        },
      ]);

      const mockModel = new MockLanguageModelV4({
        doGenerate: async (): Promise<MockDoGenerateResult> => ({
          content: [
            {
              type: "text",
              text: JSON.stringify("output text"),
            },
          ],
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 5, text: 5, reasoning: 0 },
          },
          warnings: [],
        }),
      });

      const snapshots: Inferences.InferenceRun<Inferences.Pending>[] = [];
      const inferenceRun = await runPlaygroundInferences(
        compilation,
        "Main:Test",
        {
          languageModel: mockModel,
          maxConcurrency: 1,
          callback: (snapshot) => {
            snapshots.push(snapshot);
          },
        },
      );

      // Snapshots:
      // 0: Initial call (both pending)
      // 1: After sample 0 completes (sample 0 computed, sample 1 pending)
      // 2: After sample 1 completes (both computed)
      assert.equal(snapshots.length, 3);

      // Snapshot 0: all pending
      assert.equal(snapshots[0]!.samples.length, 2);
      assert.equal(snapshots[0]!.samples[0]!.sample.name, "first");
      assert.equal(snapshots[0]!.samples[0]!.result.kind, "pending");
      assert.equal(snapshots[0]!.samples[1]!.sample.name, "second");
      assert.equal(snapshots[0]!.samples[1]!.result.kind, "pending");

      // Snapshot 1: first computed, second pending
      assert.equal(snapshots[1]!.samples[0]!.result.kind, "success");
      assert.equal(snapshots[1]!.samples[1]!.result.kind, "pending");

      // Snapshot 2: all computed
      assert.equal(snapshots[2]!.samples[0]!.result.kind, "success");
      assert.equal(snapshots[2]!.samples[1]!.result.kind, "success");

      // ID and metadata match throughout
      assert.equal(snapshots[0]!.id, inferenceRun.id);
      assert.equal(snapshots[1]!.id, inferenceRun.id);
      assert.equal(snapshots[2]!.id, inferenceRun.id);
      assert.deepEqual(snapshots[2], inferenceRun);
    });

    it("invokes callback immediately and once completed when samples list is empty", async () => {
      const compilation = compileValid([
        {
          path: "prompts/test.tp",
          content: `<template name="Test">
  <schema>
    type Input = { message: string; };
    type Output = string;
  </schema>
  <system>Echo</system>
  <user><insert val="input.message"/></user>
</template>`,
        },
        {
          path: "prompts/test.play.tp",
          content: `<playground for="Test">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>[]</samples>
</playground>`,
        },
      ]);

      const mockModel = new MockLanguageModelV4({
        doGenerate: async (): Promise<MockDoGenerateResult> =>
          ({
            text: JSON.stringify("output text"),
            finishReason: { unified: "stop", raw: undefined },
            usage: { inputTokens: { total: 0 }, outputTokens: { total: 0 } },
          }) as unknown as MockDoGenerateResult,
      });

      const snapshots: Inferences.InferenceRun<Inferences.Pending>[] = [];
      const inferenceRun = await runPlaygroundInferences(
        compilation,
        "Main:Test",
        {
          languageModel: mockModel,
          callback: (snapshot) => {
            snapshots.push(snapshot);
          },
        },
      );

      // Called immediately and once completed
      assert.equal(snapshots.length, 2);
      assert.equal(snapshots[0]!.samples.length, 0);
      assert.equal(snapshots[1]!.samples.length, 0);
      assert.equal(snapshots[0]!.id, inferenceRun.id);
      assert.equal(snapshots[1]!.id, inferenceRun.id);
      assert.deepEqual(snapshots[1], inferenceRun);
    });
  });
});
