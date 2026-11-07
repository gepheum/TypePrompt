import type { Inferences } from "@typeprompt/core";
import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { renderInferencesPageHtml } from "./render-inferences-page.js";

describe("renderInferencesPageHtml", () => {
  it("renders pending inferences with Pending status badge and pending output", () => {
    const data: Inferences.InferenceSet<Inferences.Pending> = {
      kind: "playground-inference-set",
      id: "test-inference-set-1",
      templateId: "Main:Greeting",
      isoTimestamp: "2026-11-06T12:00:00.000Z",
      model: { model: "openai/gpt-4o" },
      templateFiles: {
        "prompts/Greeting.tp": '<template name="Greeting"></template>',
      },
      inferences: [
        {
          sampleIndex: 0,
          name: "Sample 1",
          request: {
            systemMessage: "You are a helpful assistant.",
            tools: [],
            outputFormat: { format: "text" },
            messages: [
              {
                role: "user",
                input: { name: "Alice" },
                rendered: "Hello, my name is Alice.",
              },
            ],
          },
          result: { kind: "pending" },
        },
      ],
    };

    const html = renderInferencesPageHtml(data);
    expect(html.includes("Greeting · TypePrompt inferences")).toBe(true);
    expect(html.includes("status-badge pending")).toBe(true);
    expect(html.includes("Pending")).toBe(true);
    expect(html.includes("pending-output")).toBe(true);
    expect(html.includes("Inference pending...")).toBe(true);
  });

  it("renders completed successful and error inferences", () => {
    const data: Inferences.InferenceSet<Inferences.Pending> = {
      kind: "playground-inference-set",
      id: "test-inference-set-2",
      templateId: "Main:Greeting",
      isoTimestamp: "2026-11-06T12:00:00.000Z",
      model: { model: "openai/gpt-4o" },
      templateFiles: {},
      inferences: [
        {
          sampleIndex: 0,
          name: "Success Sample",
          request: {
            systemMessage: "System prompt",
            tools: [],
            outputFormat: { format: "text" },
            messages: [
              {
                role: "user",
                input: { name: "Bob" },
                rendered: "Hello, Bob.",
              },
            ],
          },
          result: {
            kind: "success",
            response: {
              kind: "output",
              rawText: "Hi Bob, nice to meet you!",
              output: "Hi Bob, nice to meet you!",
            },
            telemetry: {
              latencyMs: 450,
              usage: {
                inputTokens: 10,
                outputTokens: 8,
                totalTokens: 18,
              },
            },
          },
        },
        {
          sampleIndex: 1,
          name: "Error Sample",
          request: {
            systemMessage: "System prompt",
            tools: [],
            outputFormat: { format: "text" },
            messages: [],
          },
          result: {
            kind: "error",
            error: {
              kind: "api-error",
              message: "Rate limit exceeded",
            },
          },
        },
      ],
    };

    const html = renderInferencesPageHtml(data);
    expect(html.includes("status-badge success")).toBe(true);
    expect(html.includes("Success")).toBe(true);
    expect(html.includes("Hi Bob, nice to meet you!")).toBe(true);
    expect(html.includes("status-badge error")).toBe(true);
    expect(html.includes("Rate limit exceeded")).toBe(true);
  });

  it("renders sample details including name, note, and conversation", () => {
    const data: Inferences.InferenceSet<Inferences.Pending> = {
      kind: "playground-inference-set",
      id: "test-inference-set-samples",
      templateId: "Main:Greeting",
      isoTimestamp: "2026-11-06T12:00:00.000Z",
      model: { model: "openai/gpt-4o" },
      templateFiles: {},
      inferences: [
        {
          sampleIndex: 0,
          name: "Bob Sample",
          note: "This is a test note for Bob",
          request: {
            systemMessage: "System prompt",
            tools: [],
            outputFormat: { format: "text" },
            messages: [
              {
                role: "user",
                input: { name: "Bob", tone: "casual" },
                rendered: "Hi Bob",
              },
            ],
          },
          result: { kind: "pending" },
        },
      ],
    };
    const html = renderInferencesPageHtml(data);
    expect(html.includes("Bob Sample")).toBe(true);
    expect(html.includes("This is a test note for Bob")).toBe(true);
    expect(html.includes("Hi Bob")).toBe(true);
  });
});
