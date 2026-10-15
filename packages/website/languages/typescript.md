---
title: TypeScript
description: How to use TypePrompt-generated TypeScript code in your application.
---

# TypeScript integration guide

This guide explains how to use TypePrompt-generated TypeScript code in your application.

---

## Installation & setup

TypePrompt generates clean, standalone TypeScript code that relies on these lightweight runtime dependencies:

```bash
npm install @toon-format/toon yaml zod
```

In your `typeprompt.json` configuration file, specify your TypeScript output path:

```json
{
  "gen": {
    "typescript": {
      "file": "src/gen/prompts.ts"
    }
  }
}
```

Generate the TypeScript code:

```bash
npx typeprompt gen
```

---

## Quick start

Import the `prompts` object and call `.render()` on any template with your typed input:

```ts
import { prompts } from "./gen/prompts.js";

const prompt = prompts.translate.render({
  text: "Hello world",
  targetLanguage: "French",
});

console.log(prompt.systemMessage);
console.log(prompt.userMessage);
```

---

## The `Prompt` object

Calling `.render()` returns a `prompt` object with everything needed to interact with an LLM:

| Property / Method | Description |
|---|---|
| `prompt.systemMessage` | Rendered system prompt string. |
| `prompt.userMessage` | Rendered user prompt string. |
| `prompt.meta` | Typed metadata defined in the template (e.g., `model`, `temperature`). |
| `prompt.examples` | Array of few-shot examples (`{ userMessage, response }`), if defined. |
| `prompt.tools` | Dictionary of available tool definitions and their JSON schemas. |
| `prompt.outputFormat` | Output descriptor (`kind: "json" | "text"`, plus `jsonSchema` if structured JSON). |
| `prompt.parseResponse(content)` | Parses and validates raw LLM response text into the typed `Output`. |
| `prompt.executeTools(calls, executor)` | Concurrently executes tool calls using your tool executor implementation. |

---

## Parsing LLM responses

Pass the LLM's response string to `prompt.parseResponse()` to validate and parse it into your typed output:

```ts
const rawModelOutput = response.choices[0]?.message.content ?? "";

const result = prompt.parseResponse(rawModelOutput);
// result is fully typed according to the template's output schema
```

- **JSON Outputs**: Automatically strips markdown code fences (`` ```json ... ``` ``) and validates the JSON against the template schema with Zod.
- **Text Outputs**: Returns the raw text string directly as a typed `string`.

---

## Executing tools

When a template defines `<tools>`, implement the `ToolExecutor` and dispatch tool calls with `prompt.executeTools()`.

### 1. Implement the tool executor

Define an object with methods matching your tool names:

```ts
import { type ToolExecutor, type Schema } from "./gen/prompts.js";

const executor: ToolExecutor<"Main:ResearchQuestion"> = {
  webSearch: async (input: Schema.WebSearch.Input): Promise<Schema.WebSearch.Output> => {
    const results = await searchService(input.query);
    return {
      results: results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
      })),
    };
  },
};
```

### 2. Dispatch tool calls

Pass tool calls returned by the LLM to `prompt.executeTools()`:

```ts
const toolCalls = [
  {
    callId: "call_123",
    toolName: "webSearch",
    stringifiedInput: JSON.stringify({ query: "TypePrompt" }),
  },
] as const;

const responses = await prompt.executeTools(toolCalls, executor);

for (const resp of responses) {
  console.log(resp.callId);             // "call_123"
  console.log(resp.stringifiedOutput);  // JSON output string
}
```

`executeTools` executes matching tool functions concurrently without throwing unhandled exceptions. If a tool implementation throws an error, it captures the error and returns a `ToolCallResponse`:

- `resp.callId`: The matching call ID.
- `resp.stringifiedOutput`: Serialized JSON output on success, or `{"error": "<message>"}` on failure (ready to forward directly to OpenAI / Gemini).
- `resp.error`: Plain error message string if execution failed, or `undefined` on success (useful for Anthropic's `is_error` flag).

---

## Type definitions and `Schema`

All types declared in your TypePrompt schemas are exported under the `Schema` namespace:

```ts
import type { Schema } from "./gen/prompts.js";

// Template inputs & outputs
type TriageInput = Schema.TriageTicket.Input;
type TriageOutput = Schema.TriageTicket.Output;
type TicketCategory = Schema.TriageTicket.TicketCategory;

// Tool inputs & outputs
type SearchInput = Schema.WebSearch.Input;
type SearchOutput = Schema.WebSearch.Output;

// Metadata type
type Meta = Schema.Meta.Meta;
```

Generated types map directly to your TypePrompt schema definitions as standard TypeScript type aliases with `readonly` properties, string literal unions, and discriminated union types.

### Multi-namespace projects

When your project defines `<namespace>` blocks other than `Main`, templates and schemas are organized under their namespace:

```ts
import { prompts, type Schema } from "./gen/prompts.js";

// Render templates from specific namespaces
const financePrompt = prompts.finance.summarizeTransaction.render({
  description: "Server invoice",
  amount: { value: 120, currency: "USD" },
});

const legalPrompt = prompts.legal.draftNda.render({
  disclosingParty: "Acme Corp",
  receivingParty: "Beta LLC",
});

// Types are nested under their namespace
type FinanceInput = Schema.Finance.SummarizeTransaction.Input;
type LegalInput = Schema.Legal.DraftNda.Input;
```

---

## End-to-end OpenAI example

Here is a complete, production-ready example defining a generic `executePrompt` function that integrates TypePrompt with the official OpenAI Node.js SDK:

```ts
import OpenAI from "openai";
import {
  prompts,
  type Prompt,
  type TemplateId,
  type ToolExecutor,
  type Output,
  type Schema,
} from "./gen/prompts.js";

const openai = new OpenAI();

/**
 * Generic helper to execute any TypePrompt prompt with OpenAI.
 */
async function executePrompt<Id extends TemplateId>(
  prompt: Prompt<Id>,
  toolExecutor: ToolExecutor<Id>,
): Promise<Output<Id>> {
  // 1. Prepare tools for OpenAI from prompt.tools
  const tools: OpenAI.ChatCompletionTool[] = Object.values(prompt.tools).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputJsonSchema,
    },
  }));

  // 2. Format initial messages
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: prompt.systemMessage },
    // Include few-shot examples if defined
    ...prompt.examples.flatMap((ex) => [
      { role: "user" as const, content: ex.userMessage },
      { role: "assistant" as const, content: ex.response },
    ]),
    { role: "user", content: prompt.userMessage },
  ];

  // 3. Tool execution & completion loop
  while (true) {
    const response = await openai.chat.completions.create({
      model: prompt.meta.model ?? "gpt-4o",
      temperature: prompt.meta.temperature,
      messages,
      tools,
      response_format:
        prompt.outputFormat.kind === "json"
          ? {
              type: "json_schema",
              json_schema: {
                name: "output",
                strict: true,
                schema: prompt.outputFormat.jsonSchema,
              },
            }
          : undefined,
    });

    const message = response.choices[0]!.message;
    messages.push(message);

    // If the model requested tool calls, execute them with prompt.executeTools()
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCallsToExecute = message.tool_calls.map((tc) => ({
        callId: tc.id,
        toolName: tc.function.name,
        stringifiedInput: tc.function.arguments,
      }));

      const toolResults = await prompt.executeTools(toolCallsToExecute, toolExecutor);

      for (const result of toolResults) {
        messages.push({
          role: "tool",
          tool_call_id: result.callId,
          content: result.stringifiedOutput,
        });
      }
      continue;
    }

    // Final response: parse and validate into typed Output<Id>
    return prompt.parseResponse(message.content ?? "");
  }
}

// --- Usage ---

// 1. Define tool implementations
const executor: ToolExecutor<"Main:ResearchQuestion"> = {
  webSearch: async (input: Schema.WebSearch.Input) => {
    return {
      results: [
        {
          title: "TypePrompt Overview",
          url: "https://typeprompt.dev",
          snippet: "Type-safe prompt engineering and codegen framework.",
        },
      ],
    };
  },
};

// 2. Render the prompt
const prompt = prompts.researchQuestion.render({
  question: "What is TypePrompt?",
});

// 3. Execute the prompt — the return value is strongly typed
const result = await executePrompt(prompt, executor);
console.log("Answer:", result.answer);
console.log("Sources:", result.sources);
```
