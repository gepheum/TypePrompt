import type { Inferences } from "@typeprompt/core";
import { describe, it } from "mocha";
import assert from "node:assert";
import { inferenceRunStyles } from "../inference-run/styles.js";
import {
  renderChatMessage,
  renderRequestContext,
  renderToolCall,
} from "./render-request-context.js";
import { commonStyles } from "./styles.js";

function flattenTemplate(t: unknown): string {
  if (!t || typeof t !== "object") return String(t ?? "");
  if ("strings" in t && Array.isArray((t as { strings: unknown }).strings)) {
    const values = (t as { values?: unknown[] }).values ?? [];
    return (t as { strings: string[] }).strings
      .map(
        (str: string, i: number) =>
          str + (i < values.length ? flattenTemplate(values[i]) : ""),
      )
      .join("");
  }
  if ("values" in t && Array.isArray((t as { values: unknown[] }).values)) {
    return (t as { values: unknown[] }).values.map(flattenTemplate).join("");
  }
  if (Array.isArray(t)) {
    return t.map(flattenTemplate).join("");
  }
  return "";
}

describe("render-request-context", () => {
  it("renders a tool call with toolName and arguments", () => {
    const tc: Inferences.ToolCall = {
      toolName: "getWeather",
      callId: "call-1",
      input: { location: "Paris" },
    };
    const result = renderToolCall(tc);
    assert.ok(result);
  });

  it("renders request context including system message, tools, and messages", () => {
    const req: Inferences.InferenceRequest = {
      systemMessage: "You are a test assistant.",
      outputFormat: { format: "text" },
      tools: [
        {
          id: "search",
          name: "search",
          description: "Search the web",
          inputJsonSchema: {},
        },
      ],
      messages: [
        {
          role: "user",
          input: {},
          rendered: "Hello!",
        },
      ],
    };
    const result = renderRequestContext(req);
    assert.ok(result);

    const rendered = flattenTemplate(result);
    assert.ok(rendered.includes("Tools (1)"));
    assert.ok(rendered.includes("tool-card"));
    assert.ok(rendered.includes("search"));
    assert.ok(
      rendered.includes(
        '<div class="tool-card-description">Search the web</div>',
      ),
    );
  });

  it("renders tool card without indentation whitespace in tool description", () => {
    const req: Inferences.InferenceRequest = {
      systemMessage: "",
      outputFormat: { format: "text" },
      tools: [
        {
          id: "weather",
          name: "weather",
          description: "Get the weather forecast.",
          inputJsonSchema: {},
        },
      ],
      messages: [],
    };
    const result = renderRequestContext(req);
    const rendered = flattenTemplate(result);
    assert.ok(
      rendered.includes(
        '<div class="tool-card-description">Get the weather forecast.</div>',
      ),
    );
  });

  it("styles tool cards with monospace typography and message margin", () => {
    const cssText = commonStyles.cssText;
    assert.ok(cssText.includes(".tool-card {"));
    assert.ok(cssText.includes(".tool-card-description {"));
    assert.ok(cssText.includes("font-family: var(--font-mono)"));
    assert.ok(cssText.includes("margin-right: var(--message-margin"));
  });

  it("renders chat message for user role", () => {
    const msg: Inferences.Message = {
      role: "user",
      input: {},
      rendered: "Help me write code",
    };
    const result = renderChatMessage(msg);
    assert.ok(result);
  });

  it("renders chat message for tool role with 'tool result' title", () => {
    const msg: Inferences.Message = {
      role: "tool",
      toolResults: [
        {
          toolName: "getWeather",
          callId: "call_1",
          output: { temp: 20 },
        },
      ],
    };
    const result = renderChatMessage(msg);
    const rendered = flattenTemplate(result);
    assert.ok(rendered.includes("tool result"));
    assert.ok(rendered.includes("getWeather"));
  });

  it("applies messaging margins to distinguish user and assistant messages", () => {
    const cssText = commonStyles.cssText;
    // User messages and tool responses float to the left (have right margin)
    assert.ok(cssText.includes(".chat-bubble-wrap.role-user"));
    assert.ok(cssText.includes(".chat-bubble-wrap.role-tool"));
    assert.ok(cssText.includes("margin-right: var(--message-margin"));

    // Assistant messages float to the right (have left margin)
    assert.ok(cssText.includes(".chat-bubble-wrap.role-assistant"));
    assert.ok(cssText.includes("margin-left: var(--message-margin"));

    // System prompt floats to the left (user side)
    assert.ok(cssText.includes(".system-message-wrap"));

    // Inference set output and reasoning are full-width without messaging margins
    const infCssText = inferenceRunStyles.cssText;
    assert.ok(infCssText.includes(".output-card"));
    assert.ok(infCssText.includes(".reasoning-details"));
    assert.ok(!infCssText.includes(".output-card {\n    margin-left"));
  });
});
