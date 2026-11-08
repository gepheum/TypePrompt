import type { Inferences } from "@typeprompt/core";
import { describe, it } from "mocha";
import assert from "node:assert";
import { InferenceSetElement, inferenceSetEvents } from "./inference-set.js";

describe("InferenceSetElement", () => {
  it("initializes component instance", () => {
    const el = new InferenceSetElement();
    assert.ok(el);
    assert.strictEqual(el.tagName.toLowerCase(), "inference-set");
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
});
