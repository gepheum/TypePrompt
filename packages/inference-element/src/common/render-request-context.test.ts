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
