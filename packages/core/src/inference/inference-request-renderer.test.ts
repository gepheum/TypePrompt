import { expect } from "buckwheat";
import { describe, it } from "mocha";
import type { ValidCompilationResult } from "../compiler/compiler-types.js";
import { compile } from "../compiler/compiler.js";
import { makeTemplates } from "../compiler/spec-maker.js";
import { renderInferenceRequest } from "./inference-request-renderer.js";
import type * as Inferences from "./inference-types.js";

function compileValid(files: Record<string, string>): ValidCompilationResult {
  const result = compile(files, { cache: null, patchBase: null });
  if (result.anyErrors) {
    throw new Error(
      `Compilation errors: ${JSON.stringify(result.finalErrors)}`,
    );
  }
  return result as ValidCompilationResult;
}

function renderFirstSample(
  compilation: ValidCompilationResult,
  templateId = "Main:T",
): Inferences.InferenceRequest {
  const spec = makeTemplates(compilation);
  const specTemplate = spec.templates[templateId]!;
  const validTemplate = compilation.templates[templateId]!;
  const playground = compilation.playgrounds[templateId]!;
  const sample = playground.samples[0]!;
  return renderInferenceRequest(
    sample,
    specTemplate,
    spec.tools,
    validTemplate,
  );
}

describe("inference-request-renderer", () => {
  it("renders a simple text prompt with system and user messages", () => {
    const compilation = compileValid({
      "prompts/t.tp": `<template name="T">
  <schema>
    type Input = { message: string; };
    type Output = string;
  </schema>
  <system>You are a helpful assistant.</system>
  <user>Message: <insert val="input.message"/></user>
</template>`,
      "prompts/t.play.tp": `<playground for="T">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - input:
        message: "Hello world!"
  </samples>
</playground>`,
    });

    const request = renderFirstSample(compilation);

    expect(request.systemMessage).toBe("You are a helpful assistant.");
    expect(request.outputFormat).toMatch({ format: "text" });
    expect(request.tools.length).toBe(0);
    expect(request.messages.length).toBe(1);
    expect(request.messages[0]).toMatch({
      role: "user",
      rendered: "Message: Hello world!",
      input: { message: "Hello world!" },
    });
  });

  it("renders structured JSON output format with schema", () => {
    const compilation = compileValid({
      "prompts/t.tp": `<template name="T">
  <schema>
    type Input = { query: string; };
    type Output = { answer: string; confidence: number; };
  </schema>
  <system>Provide JSON output.</system>
  <user><insert val="input.query"/></user>
</template>`,
      "prompts/t.play.tp": `<playground for="T">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - input:
        query: "What is 2+2?"
  </samples>
</playground>`,
    });

    const request = renderFirstSample(compilation);

    expect(request.outputFormat.format).toBe("json");
    if (request.outputFormat.format === "json") {
      expect(request.outputFormat.jsonSchema).toMatch({
        type: "object",
        properties: {
          answer: { type: "string" },
          confidence: { type: "number" },
        },
      });
    }
  });

  it("renders inserts with json, yaml, toon, csv, and tsv formatting", () => {
    const compilation = compileValid({
      "prompts/t.tp": `<template name="T">
  <schema>
    type Row = { id: integer; name: string; };
    type Input = {
      obj: { key: string; count: number; };
      rows: Row[];
    };
    type Output = string;
  </schema>
  <system>Format tester</system>
  <user>
JSON:
<insert val="input.obj" format="json"/>
YAML:
<insert val="input.obj" format="yaml"/>
TOON:
<insert val="input.obj" format="toon"/>
CSV:
<insert val="input.rows" format="csv"/>
TSV:
<insert val="input.rows" format="tsv"/>
  </user>
</template>`,
      "prompts/t.play.tp": `<playground for="T">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - input:
        obj:
          key: "test"
          count: 42
        rows:
          - id: 1
            name: "Alice"
          - id: 2
            name: "Bob"
  </samples>
</playground>`,
    });

    const request = renderFirstSample(compilation);
    const userMessage = request.messages[0]!;
    expect(userMessage.role).toBe("user");
    if (userMessage.role === "user") {
      expect(userMessage.rendered.includes('"key": "test"')).toBe(true);
      expect(userMessage.rendered.includes("key: test")).toBe(true);
      expect(userMessage.rendered.includes("count: 42")).toBe(true);
      expect(userMessage.rendered.includes("id,name\n1,Alice\n2,Bob")).toBe(
        true,
      );
      expect(userMessage.rendered.includes("id\tname\n1\tAlice\n2\tBob")).toBe(
        true,
      );
    }
  });

  it("evaluates if and switch branches inside snippets", () => {
    const compilation = compileValid({
      "prompts/t.tp": `<template name="T">
  <schema>
    type Input = {
      isAdmin: boolean;
      role: "admin" | "user";
    };
    type Output = string;
  </schema>
  <snippet name="adminCheck" if="input.isAdmin" is="true">
    <then>Admin Access Granted.</then>
    <else>Standard Access.</else>
  </snippet>
  <snippet name="roleGreeting" switch="input.role">
    <on case="admin">Welcome Admin!</on>
    <on case="user">Welcome User!</on>
  </snippet>
  <system>Branch tester</system>
  <user>
<insert snippet="adminCheck"/>
<insert snippet="roleGreeting"/>
  </user>
</template>`,
      "prompts/t.play.tp": `<playground for="T">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - input:
        isAdmin: true
        role: "admin"
  </samples>
</playground>`,
    });

    const request = renderFirstSample(compilation);
    const userMessage = request.messages[0]!;
    expect(userMessage.role).toBe("user");
    if (userMessage.role === "user") {
      expect(userMessage.rendered.includes("Admin Access Granted.")).toBe(true);
      expect(userMessage.rendered.includes("Welcome Admin!")).toBe(true);
      expect(userMessage.rendered.includes("Standard Access.")).toBe(false);
      expect(userMessage.rendered.includes("Welcome User!")).toBe(false);
    }
  });

  it("renders variants correctly based on input.variant", () => {
    const compilation = compileValid({
      "prompts/t.tp": `<template name="T">
  <schema>
    interface Input {
      variant: "friendly" | "concise";
      name: string;
    }
    type Output = string;
  </schema>
  <variant case="friendly">
    <system>Be friendly!</system>
    <user>Hello dear <insert val="input.name"/>, how are you today?</user>
  </variant>
  <variant case="concise">
    <system>Be concise!</system>
    <user>Hi <insert val="input.name"/>.</user>
  </variant>
</template>`,
      "prompts/t.play.tp": `<playground for="T">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - input:
        variant: "friendly"
        name: "Alice"
  </samples>
</playground>`,
    });

    const request = renderFirstSample(compilation);
    expect(request.systemMessage).toBe("Be friendly!");
    expect(request.messages[0]).toMatch({
      role: "user",
      rendered: "Hello dear Alice, how are you today?",
    });
  });

  it("renders tools with their schemas and normalizes tool inputs/outputs", () => {
    const compilation = compileValid({
      "prompts/calculator.tp": `<tool name="calculator">
  <description>Performs math calculations</description>
  <schema>
    type Input = { a: number; b: number; op: string; };
    type Output = { result: number; };
  </schema>
</tool>`,
      "prompts/t.tp": `<template name="T">
  <schema>
    type Input = { expression: string; };
    type Output = string;
  </schema>
  <tools>
    <tool name="calculator"/>
  </tools>
  <system>Math helper</system>
  <user>Calculate: <insert val="input.expression"/></user>
</template>`,
      "prompts/t.play.tp": `<playground for="T">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - input:
        expression: "2 + 2"
      steps:
        - toolCalls:
            - tool: calculator
              callId: "call_123"
              input:
                a: 2
                b: 2
                op: "+"
              output:
                result: 4
  </samples>
</playground>`,
    });

    const request = renderFirstSample(compilation);

    expect(request.tools.length).toBe(1);
    expect(request.tools[0]).toMatch({
      id: "Main:calculator",
      name: "calculator",
      description: "Performs math calculations",
    });

    expect(request.messages.length).toBe(3);
    // 1. User message
    expect(request.messages[0]).toMatch({
      role: "user",
      rendered: "Calculate: 2 + 2",
    });
    // 2. Assistant tool call
    expect(request.messages[1]).toMatch({
      role: "assistant",
      toolCalls: [
        {
          callId: "call_123",
          toolName: "calculator",
          input: { a: 2, b: 2, op: "+" },
        },
      ],
    });
    // 3. Tool result
    expect(request.messages[2]).toMatch({
      role: "tool",
      toolResults: [
        {
          callId: "call_123",
          toolName: "calculator",
          output: { result: 4 },
        },
      ],
    });
  });

  it("renders few-shot examples and conversation history before current user message", () => {
    const compilation = compileValid({
      "prompts/t.tp": `<template name="T">
  <schema>
    type Input = { text: string; };
    type Output = string;
  </schema>
  <system>Translator</system>
  <examples>
    - input:
        text: "hello"
      output: "bonjour"
  </examples>
  <user>Translate: <insert val="input.text"/></user>
</template>`,
      "prompts/t.play.tp": `<playground for="T">
  <model>
    model: openai/gpt-4o
  </model>
  <samples>
    - input:
        text: "good morning"
      history:
        - input:
            text: "thank you"
          output: "merci"
  </samples>
</playground>`,
    });

    const request = renderFirstSample(compilation);

    expect(request.messages.length).toBe(5);
    // 1. Example user
    expect(request.messages[0]).toMatch({
      role: "user",
      rendered: "Translate: hello",
    });
    // 2. Example assistant output
    expect(request.messages[1]).toMatch({
      role: "assistant",
      output: "bonjour",
    });
    // 3. History user
    expect(request.messages[2]).toMatch({
      role: "user",
      rendered: "Translate: thank you",
    });
    // 4. History assistant output
    expect(request.messages[3]).toMatch({
      role: "assistant",
      output: "merci",
    });
    // 5. Current turn user message
    expect(request.messages[4]).toMatch({
      role: "user",
      rendered: "Translate: good morning",
    });
  });
});
