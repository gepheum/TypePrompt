import type { Inferences } from "@typeprompt/core";
import { describe, it } from "mocha";
import assert from "node:assert";
import {
  InferenceSampleElement,
  InferenceSetElement,
  inferenceSetEvents,
} from "./inference-set.js";

describe("InferenceSetElement", () => {
  it("initializes component instance", () => {
    const el = new InferenceSetElement();
    assert.ok(el);
    assert.strictEqual(el.tagName.toLowerCase(), "tp-inference-set");
  });

  it("initializes sample component instance with default activeTab", () => {
    const sampleEl = new InferenceSampleElement();
    assert.ok(sampleEl);
    assert.strictEqual(sampleEl.tagName.toLowerCase(), "tp-inference-sample");
    assert.strictEqual(sampleEl.activeTab, "yaml");
  });

  it("exports events emitter", () => {
    assert.ok(inferenceSetEvents);
    assert.strictEqual(typeof inferenceSetEvents.emit, "function");
    assert.strictEqual(typeof inferenceSetEvents.on, "function");
  });

  it("renders with mock InferenceSet", () => {
    const el = new InferenceSetElement();
    const mockInferenceSet: Inferences.InferenceSet<Inferences.Pending> = {
      kind: "playground-inference-set",
      id: "abc12345",
      templateId: "Main:Greeting",
      isoTimestamp: new Date().toISOString(),
      model: { model: "google/gemini-2.5-flash" },
      templateFiles: {
        "prompts/greeting.tp": '<template name="Greeting">\nHello\n</template>',
      },
      inferences: [
        {
          sampleIndex: 0,
          name: "Test greeting",
          request: {
            systemMessage: "You are a greeter.",
            outputFormat: { format: "text" },
            tools: [],
            messages: [{ role: "user", input: {}, rendered: "Hi" }],
          },
          result: {
            kind: "success",
            response: {
              kind: "output",
              rawText: "Hello there!",
              output: "Hello there!",
            },
            telemetry: {
              latencyMs: 350,
              usage: {
                inputTokens: 10,
                outputTokens: 5,
                totalTokens: 15,
              },
            },
          },
        },
      ],
    };

    el.inferenceSet = mockInferenceSet;
    const template = el.render();
    assert.ok(template);
  });

  it("excludes meta.tp from source files and omits playground pill", () => {
    const el = new InferenceSetElement();
    const mockInferenceSet: Inferences.InferenceSet<Inferences.Pending> = {
      kind: "playground-inference-set",
      id: "abc12345",
      templateId: "Main:Greeting",
      isoTimestamp: new Date().toISOString(),
      model: { model: "google/gemini-2.5-flash" },
      templateFiles: {
        "prompts/greeting.tp": '<template name="Greeting">\nHello\n</template>',
        "meta.tp": "<meta>model: google/gemini-2.5-flash</meta>",
        "prompts/meta.tp": "<meta>model: google/gemini-2.5-flash</meta>",
      },
      inferences: [
        {
          sampleIndex: 0,
          name: "Test greeting",
          request: {
            systemMessage: "You are a greeter.",
            outputFormat: { format: "text" },
            tools: [],
            messages: [{ role: "user", input: {}, rendered: "Hi" }],
          },
          result: {
            kind: "success",
            response: {
              kind: "output",
              rawText: "Hello there!",
              output: "Hello there!",
            },
            telemetry: {
              latencyMs: 350,
              usage: {
                inputTokens: 10,
                outputTokens: 5,
                totalTokens: 15,
              },
            },
          },
        },
      ],
    };

    el.inferenceSet = mockInferenceSet;
    const template = el.render();

    // Recursively extract all strings from Lit TemplateResult
    function flattenTemplate(t: unknown): string {
      if (!t || typeof t !== "object") return String(t ?? "");
      if (
        "strings" in t &&
        Array.isArray((t as { strings: unknown }).strings)
      ) {
        const values = (t as { values?: unknown[] }).values ?? [];
        return (t as { strings: string[] }).strings
          .map(
            (str: string, i: number) =>
              str + (i < values.length ? flattenTemplate(values[i]) : ""),
          )
          .join("");
      }
      if (Array.isArray(t)) {
        return t.map(flattenTemplate).join("");
      }
      return "";
    }

    const renderedStr = flattenTemplate(template);
    assert.ok(renderedStr.includes("tp-inference-sample"));
    assert.ok(renderedStr.includes("prompts/greeting.tp"));
    assert.ok(!renderedStr.includes(">meta.tp<"));
    assert.ok(!renderedStr.includes(">prompts/meta.tp<"));
    assert.ok(!renderedStr.includes("badge-tag"));
    assert.ok(!renderedStr.includes(">playground<"));
    assert.ok(renderedStr.includes("btn-copy"));
  });
});
