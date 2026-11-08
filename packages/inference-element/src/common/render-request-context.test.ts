import type { Inferences } from "@typeprompt/core";
import { describe, it } from "mocha";
import assert from "node:assert";
import {
  renderChatMessage,
  renderRequestContext,
  renderToolCall,
} from "./render-request-context.js";

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
});
