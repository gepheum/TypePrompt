import type { Inferences } from "@typeprompt/core";
import { expect } from "buckwheat";
import { describe, it } from "mocha";
import {
  renderChatMessage,
  renderRequestContext,
  renderToolCall,
} from "./render-request-context.js";

describe("render-request-context", () => {
  it("renders a tool call with toolName and arguments", () => {
    const tc: Inferences.ToolCall = {
      callId: "call_123",
      toolName: "getWeather",
      input: { city: "London" },
    };
    const html = renderToolCall(tc).value;
    expect(html.includes("getWeather")).toBe(true);
    expect(html.includes("call_123")).toBe(true);
    expect(html.includes("London")).toBe(true);
  });

  it("renders request context including system message, tools, and messages", () => {
    const req: Inferences.InferenceRequest = {
      systemMessage: "You are a test assistant.",
      tools: [
        {
          id: "Main:search",
          name: "search",
          description: "Search web",
          inputJsonSchema: {},
        },
      ],
      outputFormat: { format: "text" },
      messages: [
        {
          role: "user",
          input: { query: "hello" },
          rendered: "Search for hello",
        },
      ],
    };
    const html = renderRequestContext(req).value;
    expect(html.includes("You are a test assistant.")).toBe(true);
    expect(html.includes("search")).toBe(true);
    expect(html.includes("Search for hello")).toBe(true);
  });

  it("renders chat message for user role", () => {
    const msg: Inferences.Message = {
      role: "user",
      input: { q: "test" },
      rendered: "Rendered text",
    };
    const html = renderChatMessage(msg).value;
    expect(html.includes("role-user")).toBe(true);
    expect(html.includes("Rendered text")).toBe(true);
  });
});
