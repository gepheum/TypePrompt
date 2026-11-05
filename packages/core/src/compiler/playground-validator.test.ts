import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { EMPTY_SCHEMA } from "../schema/empty-schema.js";
import { parseSchema } from "../schema/schema-parser.js";
import type { Schema } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import type { MappedText } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import type {
  Tool,
  ToolValidationResult,
  ValidatedTemplate,
} from "./compiler-types.js";
import { parsePlayground } from "./playground-parser.js";
import { validatePlayground } from "./playground-validator.js";
import { parseTemplate } from "./template-parser.js";
import { validateTemplate } from "./template-validator.js";

function parseElement(xml: string, path = "prompts/Translate.tp"): ElementNode {
  const result = parseXmlDocument(xml, path);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

function parseSchemaOrThrow(
  source: string,
  kind: "namespace" | "meta" = "namespace",
  path = "schema.ts",
): Schema {
  const node: MappedText = {
    path,
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const parsed = parseSchema(node, kind);
  if (parsed.kind !== "success") throw new Error("parseSchema failed");
  const validated = validateSchema(parsed, null);
  if (validated.kind !== "success") {
    throw new Error(
      `validateSchema failed: ${validated.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return validated;
}

function makeTool(name: string, schemaSource: string): ToolValidationResult {
  const schema = parseSchemaOrThrow(schemaSource, "namespace");
  const tool: Tool = {
    kind: "tool",
    name: { text: name, start: 0, end: name.length, path: "" },
    namespace: null,
    description: [],
    schema: {
      kind: "success",
      context: "tool",
      typeDeclarations: {},
      source: {
        text: "",
        start: 0,
        end: 0,
      },
      path: "",
      warnings: [],
    },
    warnings: [],
  };
  return {
    kind: "tool",
    tool,
    schema,
    definitionLinks: [],
  };
}

function makeTemplate(
  templateXml: string,
  namespaceTools: { readonly [name: string]: ToolValidationResult } = {},
): ValidatedTemplate {
  const root = parseElement(templateXml, "prompts/Translate.tp");
  const parsedTemplate = parseTemplate(root);
  if (parsedTemplate.kind !== "template") {
    throw new Error("parseTemplate failed");
  }
  const validated = validateTemplate({
    template: parsedTemplate,
    metaSchema: EMPTY_SCHEMA,
    namespaceSchema: EMPTY_SCHEMA,
    namespaceTools,
  });
  if (validated.kind !== "template") {
    throw new Error("validateTemplate failed");
  }
  return validated;
}

describe("validatePlayground", () => {
  const template = makeTemplate(`
    <template name="Translate">
      <schema>
        type Input = { text: string; targetLanguage?: string; };
        type Output = { translated: string; };
      </schema>
      <system>Translator</system>
      <user><insert val="input.text"/></user>
    </template>
  `);

  it("validates a playground matching template input schema", () => {
    const node = parseElement(
      `
      <playground for="Translate">
        <model>
          model: openai/gpt-4o
        </model>
        <samples>
        - name: "Spanish greeting"
          input:
            text: "Hello"
            targetLanguage: "es"
        </samples>
      </playground>
    `,
      "prompts/Translate.play.tp",
    );

    const parsed = parsePlayground(node);
    if (parsed.kind === "error") throw new Error("parsePlayground failed");

    const result = validatePlayground(parsed, template);
    expect(result).toMatch({
      kind: "playground",
      templateId: "Main:Translate",
      samples: [
        {
          name: "Spanish greeting",
          input: {
            text: "Hello",
            targetLanguage: "es",
          },
        },
      ],
    });
  });

  it("validates a playground with optional note field", () => {
    const node = parseElement(
      `
      <playground for="Translate">
        <model>
          model: openai/gpt-4o
        </model>
        <samples>
        - name: "Spanish greeting"
          note: "Important test case for greeting"
          input:
            text: "Hello"
            targetLanguage: "es"
        </samples>
      </playground>
    `,
      "prompts/Translate.play.tp",
    );

    const parsed = parsePlayground(node);
    if (parsed.kind === "error") throw new Error("parsePlayground failed");

    const result = validatePlayground(parsed, template);
    expect(result).toMatch({
      kind: "playground",
      templateId: "Main:Translate",
      samples: [
        {
          name: "Spanish greeting",
          note: "Important test case for greeting",
          input: {
            text: "Hello",
            targetLanguage: "es",
          },
        },
      ],
    });
  });

  it("validates a playground where name is omitted", () => {
    const node = parseElement(
      `
      <playground for="Translate">
        <model>
          model: openai/gpt-4o
        </model>
        <samples>
        - input:
            text: "What time is it?"
        </samples>
      </playground>
    `,
      "prompts/Translate.play.tp",
    );

    const parsed = parsePlayground(node);
    if (parsed.kind === "error") throw new Error("parsePlayground failed");

    const result = validatePlayground(parsed, template);
    expect(result).toMatch({
      kind: "playground",
      samples: [
        {
          name: undefined,
          input: {
            text: "What time is it?",
          },
        },
      ],
    });
  });

  it("validates a playground sample with history", () => {
    const node = parseElement(
      `
      <playground for="Translate">
        <model>
          model: openai/gpt-4o
        </model>
        <samples>
        - name: "Multi-turn conversation"
          history:
            - input:
                text: "Hello"
              output:
                translated: "Hola"
            - input:
                text: "How are you?"
              output:
                translated: "Cómo estás?"
          input:
            text: "Goodbye"
        </samples>
      </playground>
    `,
      "prompts/Translate.play.tp",
    );

    const parsed = parsePlayground(node);
    if (parsed.kind === "error") throw new Error("parsePlayground failed");

    const result = validatePlayground(parsed, template);
    expect(result).toMatch({
      kind: "playground",
      samples: [
        {
          name: "Multi-turn conversation",
          history: [
            {
              input: { text: "Hello" },
              output: { translated: "Hola" },
            },
            {
              input: { text: "How are you?" },
              output: { translated: "Cómo estás?" },
            },
          ],
          input: {
            text: "Goodbye",
          },
        },
      ],
    });
  });

  it("reports an error when history input violates Input schema", () => {
    const node = parseElement(
      `
      <playground for="Translate">
        <model>
          model: openai/gpt-4o
        </model>
        <samples>
        - history:
            - input:
                text: 123
              output:
                translated: "123"
          input:
            text: "Valid"
        </samples>
      </playground>
    `,
      "prompts/Translate.play.tp",
    );

    const parsed = parsePlayground(node);
    if (parsed.kind === "error") throw new Error("parsePlayground failed");

    const result = validatePlayground(parsed, template);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected string but got number",
        },
      ],
    });
  });

  it("reports an error when history output violates Output schema", () => {
    const node = parseElement(
      `
      <playground for="Translate">
        <model>
          model: openai/gpt-4o
        </model>
        <samples>
        - history:
            - input:
                text: "Hello"
              output:
                translated: 123
          input:
            text: "Valid"
        </samples>
      </playground>
    `,
      "prompts/Translate.play.tp",
    );

    const parsed = parsePlayground(node);
    if (parsed.kind === "error") throw new Error("parsePlayground failed");

    const result = validatePlayground(parsed, template);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected string but got number",
        },
      ],
    });
  });

  it("reports an error when an unknown field is present", () => {
    const node = parseElement(
      `
      <playground for="Translate">
        <model>
          model: openai/gpt-4o
        </model>
        <samples>
        - input:
            text: "Bonjour"
          goldenOutput:
            translated: "Hello"
        </samples>
      </playground>
    `,
      "prompts/Translate.play.tp",
    );

    const parsed = parsePlayground(node);
    if (parsed.kind === "error") throw new Error("parsePlayground failed");

    const result = validatePlayground(parsed, template);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unknown field 'goldenOutput'",
        },
      ],
    });
  });

  it("reports an error when input has mismatched schema", () => {
    const node = parseElement(
      `
      <playground for="Translate">
        <model>
          model: openai/gpt-4o
        </model>
        <samples>
        - input:
            text: 12345
        </samples>
      </playground>
    `,
      "prompts/Translate.play.tp",
    );

    const parsed = parsePlayground(node);
    if (parsed.kind === "error") throw new Error("parsePlayground failed");

    const result = validatePlayground(parsed, template);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected string but got number",
        },
      ],
    });
  });

  it("reports an error when output or weight is provided on a sample", () => {
    const node = parseElement(
      `
      <playground for="Translate">
        <model>
          model: openai/gpt-4o
        </model>
        <samples>
        - input:
            text: "Hello"
          output:
            translated: "Bonjour"
          weight: 2
        </samples>
      </playground>
    `,
      "prompts/Translate.play.tp",
    );

    const parsed = parsePlayground(node);
    if (parsed.kind === "error") throw new Error("parsePlayground failed");

    const result = validatePlayground(parsed, template);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unknown field 'output'",
        },
        {
          message: "Unknown field 'weight'",
        },
      ],
    });
  });

  it("creates a definition link from 'for' attribute to template declaration", () => {
    const node = parseElement(
      `
      <playground for="Translate">
        <model>
          model: openai/gpt-4o
        </model>
        <samples>
        - input:
            text: "Hello"
        </samples>
      </playground>
    `,
      "prompts/Translate.play.tp",
    );

    const parsed = parsePlayground(node);
    if (parsed.kind === "error") throw new Error("parsePlayground failed");

    const result = validatePlayground(parsed, template);
    expect(result.definitionLinks[0]).toMatch({
      reference: parsed.for,
      definition: template.template.name,
    });
  });

  describe("steps and tool calls", () => {
    const calcTool = makeTool(
      "calc",
      "type Input = { expr: string; }; type Output = { result: number; };",
    );
    const searchTool = makeTool(
      "search",
      "type Input = { query: string; }; type Output = { hits: string[]; };",
    );

    const mathTemplate = makeTemplate(
      `
      <template name="MathAssistant">
        <schema>
          type Input = { question: string; };
          type Output = { answer: string; };
        </schema>
        <tools>
          <tool name="calc" />
          <tool name="search" />
        </tools>
        <system>You are a math assistant.</system>
        <user><insert val="input.question"/></user>
      </template>
    `,
      { calc: calcTool, search: searchTool },
    );

    it("validates steps with valid tool calls and extracts them", () => {
      const node = parseElement(
        `
        <playground for="MathAssistant">
          <model>
            model: openai/gpt-4o
          </model>
          <samples>
          - name: "Arithmetic step"
            input:
              question: "What is 2+2?"
            steps:
              - toolCalls:
                  - tool: calc
                    callId: "call-1"
                    input:
                      expr: "2+2"
                    output:
                      result: 4
          </samples>
        </playground>
      `,
        "prompts/MathAssistant.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, mathTemplate);
      expect(result.kind).toBe("playground");
      if (result.kind !== "playground") return;

      expect(result.templateId).toBe("Main:MathAssistant");
      expect(result.samples).toMatch([
        {
          name: "Arithmetic step",
          input: {
            question: "What is 2+2?",
          },
        },
      ]);
      const toolCall = result.samples[0]!.steps![0]!.toolCalls[0]!;
      expect(toolCall.callId).toBe("call-1");
      expect(toolCall.tool).toBe("calc");
      expect(toolCall.input).toMatch({ expr: "2+2" });
      expect(toolCall.output).toMatch({ result: 4 });
    });

    it("validates steps inside history entries", () => {
      const node = parseElement(
        `
        <playground for="MathAssistant">
          <model>
            model: openai/gpt-4o
          </model>
          <samples>
          - history:
              - input:
                  question: "What is 1+1?"
                steps:
                  - toolCalls:
                      - tool: calc
                        callId: "c1"
                        input:
                          expr: "1+1"
                        output:
                          result: 2
                output:
                  answer: "2"
            input:
              question: "Now multiply by 3"
            steps:
              - toolCalls:
                  - tool: calc
                    callId: "c2"
                    input:
                      expr: "2*3"
                    output:
                      result: 6
          </samples>
        </playground>
      `,
        "prompts/MathAssistant.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, mathTemplate);
      expect(result.kind).toBe("playground");
      if (result.kind !== "playground") return;

      const sample = result.samples[0]!;
      expect(sample.history?.length).toBe(1);
      const histStep = sample.history![0]!.steps![0]!.toolCalls[0]!;
      expect(histStep.callId).toBe("c1");
      expect(histStep.tool).toBe("calc");
      expect(histStep.input).toMatch({ expr: "1+1" });

      const currentStep = sample.steps![0]!.toolCalls[0]!;
      expect(currentStep.callId).toBe("c2");
      expect(currentStep.tool).toBe("calc");
      expect(currentStep.input).toMatch({ expr: "2*3" });
    });

    it("allows omitting tool call output (callId is required)", () => {
      const node = parseElement(
        `
        <playground for="MathAssistant">
          <model>
            model: openai/gpt-4o
          </model>
          <samples>
          - input:
              question: "Calculate"
            steps:
              - toolCalls:
                  - tool: calc
                    callId: "call-2"
                    input:
                      expr: "10 * 10"
          </samples>
        </playground>
      `,
        "prompts/MathAssistant.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, mathTemplate);
      expect(result.kind).toBe("playground");
      if (result.kind !== "playground") return;

      const toolCall = result.samples[0]!.steps![0]!.toolCalls[0]!;
      expect(toolCall.callId).toBe("call-2");
      expect(toolCall.tool).toBe("calc");
      expect(toolCall.output).toBe(undefined);
      expect(toolCall.input).toMatch({ expr: "10 * 10" });
    });

    it("reports an error when tool call callId is missing", () => {
      const node = parseElement(
        `
        <playground for="MathAssistant">
          <model>
            model: openai/gpt-4o
          </model>
          <samples>
          - input:
              question: "Calculate"
            steps:
              - toolCalls:
                  - tool: calc
                    input:
                      expr: "10 * 10"
          </samples>
        </playground>
      `,
        "prompts/MathAssistant.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, mathTemplate);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message: "Missing required field 'callId'",
          },
        ],
      });
    });

    it("reports an error when tool is not registered on the template", () => {
      const node = parseElement(
        `
        <playground for="MathAssistant">
          <model>
            model: openai/gpt-4o
          </model>
          <samples>
          - input:
              question: "Look up"
            steps:
              - toolCalls:
                  - tool: unknownTool
                    callId: "call-1"
                    input: {}
                    output: {}
          </samples>
        </playground>
      `,
        "prompts/MathAssistant.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, mathTemplate);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message: 'Expected one of ["calc","search"]',
          },
        ],
      });
    });

    it("reports an error when tool call input violates tool Input schema", () => {
      const node = parseElement(
        `
        <playground for="MathAssistant">
          <model>
            model: openai/gpt-4o
          </model>
          <samples>
          - input:
              question: "Calculate"
            steps:
              - toolCalls:
                  - tool: calc
                    callId: "call-1"
                    input:
                      expr: 12345
                    output:
                      result: 12345
          </samples>
        </playground>
      `,
        "prompts/MathAssistant.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, mathTemplate);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message: "Expected string but got number",
          },
        ],
      });
    });

    it("reports an error when tool call output violates tool Output schema", () => {
      const node = parseElement(
        `
        <playground for="MathAssistant">
          <model>
            model: openai/gpt-4o
          </model>
          <samples>
          - input:
              question: "Calculate"
            steps:
              - toolCalls:
                  - tool: calc
                    callId: "call-1"
                    input:
                      expr: "5+5"
                    output:
                      result: "not a number"
          </samples>
        </playground>
      `,
        "prompts/MathAssistant.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, mathTemplate);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message: "Expected number but got string",
          },
        ],
      });
    });

    it("reports an error when tool call output inside history violates tool Output schema", () => {
      const node = parseElement(
        `
        <playground for="MathAssistant">
          <model>
            model: openai/gpt-4o
          </model>
          <samples>
          - history:
              - input:
                  question: "Calculate"
                steps:
                  - toolCalls:
                      - tool: calc
                        callId: "call-1"
                        input:
                          expr: "5+5"
                        output:
                          result: "not a number"
                output:
                  answer: "10"
            input:
              question: "Calculate"
          </samples>
        </playground>
      `,
        "prompts/MathAssistant.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, mathTemplate);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message: "Expected number but got string",
          },
        ],
      });
    });

    it("creates a definition link from tool call tool name to the tool declaration", () => {
      const node = parseElement(
        `
        <playground for="MathAssistant">
          <model>
            model: openai/gpt-4o
          </model>
          <samples>
          - input:
              question: "What is 1+1?"
            steps:
              - toolCalls:
                  - tool: calc
                    callId: "call-1"
                    input:
                      expr: "1+1"
                    output:
                      result: 2
          </samples>
        </playground>
      `,
        "prompts/MathAssistant.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, mathTemplate);
      if (result.kind !== "playground")
        throw new Error("Expected playground result");

      const toolLink = result.definitionLinks.find(
        (link) => link.definition.text === "calc",
      );
      if (!toolLink) throw new Error("Expected tool definition link");
      expect(toolLink.definition).toMatch({
        text: "calc",
      });
    });
  });

  describe("model validation", () => {
    it("validates and unwraps model options into result.model", () => {
      const node = parseElement(
        `
        <playground for="Translate">
          <model>
            model: openai/gpt-4o
            temperature: 0.7
            maxTokens: 1000
            topP: 0.9
            topK: 40
            presencePenalty: 0.5
            frequencyPenalty: 0.5
            stopSequences:
              - "END"
              - "STOP"
            seed: 42
            reasoning: medium
            providerOptions:
              openai:
                reasoningEffort: high
                maxCompletionTokens: 500
                strictJsonSchema: true
                logprobs: 5
          </model>
          <samples>
          - input:
              text: "Hello"
          </samples>
        </playground>
      `,
        "prompts/Translate.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, template);
      expect(result.kind).toBe("playground");
      if (result.kind !== "playground") return;

      expect(result.model).toMatch({
        model: "openai/gpt-4o",
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.9,
        topK: 40,
        presencePenalty: 0.5,
        frequencyPenalty: 0.5,
        stopSequences: ["END", "STOP"],
        seed: 42,
        reasoning: "medium",
        providerOptions: {
          openai: {
            reasoningEffort: "high",
            maxCompletionTokens: 500,
            strictJsonSchema: true,
            logprobs: 5,
          },
        },
      });
    });

    it("validates all supported provider options", () => {
      const node = parseElement(
        `
        <playground for="Translate">
          <model>
            model: anthropic/claude-sonnet-4.5
            providerOptions:
              anthropic:
                effort: high
                sendReasoning: true
                structuredOutputMode: auto
                thinking:
                  type: adaptive
                  display: summarized
              google:
                structuredOutputs: true
                threshold: BLOCK_NONE
                thinkingConfig:
                  thinkingBudget: 2048
                  includeThoughts: true
                  thinkingLevel: high
                safetySettings:
                  - category: HARM_CATEGORY_HATE_SPEECH
                    threshold: BLOCK_LOW_AND_ABOVE
              xai:
                reasoningEffort: low
                searchRecencyFilter: week
                includeSearchInformation: true
                sources: true
              mistral:
                safePrompt: true
                structuredOutputs: true
                reasoningEffort: medium
          </model>
          <samples>
          - input:
              text: "Hello"
          </samples>
        </playground>
      `,
        "prompts/Translate.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, template);
      expect(result.kind).toBe("playground");
      if (result.kind !== "playground") return;

      expect(result.model.providerOptions?.anthropic).toMatch({
        effort: "high",
        sendReasoning: true,
        structuredOutputMode: "auto",
        thinking: {
          type: "adaptive",
          display: "summarized",
        },
      });
      expect(result.model.providerOptions?.google?.safetySettings).toMatch([
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_LOW_AND_ABOVE",
        },
      ]);
      expect(result.model.providerOptions?.xai).toMatch({
        reasoningEffort: "low",
        searchRecencyFilter: "week",
        includeSearchInformation: true,
        sources: true,
      });
      expect(result.model.providerOptions?.mistral).toMatch({
        safePrompt: true,
        structuredOutputs: true,
        reasoningEffort: "medium",
      });
    });

    it("reports an error when required 'model' field is missing in <model>", () => {
      const node = parseElement(
        `
        <playground for="Translate">
          <model>
            temperature: 0.7
          </model>
          <samples>
          - input:
              text: "Hello"
          </samples>
        </playground>
      `,
        "prompts/Translate.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, template);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message: "Missing required field 'model'",
          },
        ],
      });
    });

    it("reports an error when unknown field is passed in <model>", () => {
      const node = parseElement(
        `
        <playground for="Translate">
          <model>
            model: openai/gpt-4o
            invalidOption: true
          </model>
          <samples>
          - input:
              text: "Hello"
          </samples>
        </playground>
      `,
        "prompts/Translate.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, template);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message: "Unknown field 'invalidOption'",
          },
        ],
      });
    });

    it("reports an error when property has wrong type", () => {
      const node = parseElement(
        `
        <playground for="Translate">
          <model>
            model: openai/gpt-4o
            temperature: "very hot"
          </model>
          <samples>
          - input:
              text: "Hello"
          </samples>
        </playground>
      `,
        "prompts/Translate.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, template);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message: "Expected number but got string",
          },
        ],
      });
    });

    it("reports an error when enum property has invalid value", () => {
      const node = parseElement(
        `
        <playground for="Translate">
          <model>
            model: openai/gpt-4o
            reasoning: ultra
          </model>
          <samples>
          - input:
              text: "Hello"
          </samples>
        </playground>
      `,
        "prompts/Translate.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, template);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message:
              'Expected one of ["provider-default","none","minimal","low","medium","high","xhigh"]',
          },
        ],
      });
    });

    it("reports an error when anthropic thinking has invalid type discriminator", () => {
      const node = parseElement(
        `
        <playground for="Translate">
          <model>
            model: anthropic/claude-sonnet-4.5
            providerOptions:
              anthropic:
                thinking:
                  type: unknownType
          </model>
          <samples>
          - input:
              text: "Hello"
          </samples>
        </playground>
      `,
        "prompts/Translate.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, template);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message: 'Expected one of ["adaptive","enabled","disabled"]',
          },
        ],
      });
    });

    it("reports an error when model ID is not in the allowed list", () => {
      const node = parseElement(
        `
        <playground for="Translate">
          <model>
            model: unsupported/model-xyz
          </model>
          <samples>
          - input:
              text: "Hello"
          </samples>
        </playground>
      `,
        "prompts/Translate.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, template);
      expect(result.kind).toBe("error");
      if (result.kind !== "error") return;
      expect(result.errors.length > 0).toBe(true);
      expect(result.errors[0]!.message.startsWith("Expected one of")).toBe(
        true,
      );
    });

    it("reports an error when custom provider options are specified", () => {
      const node = parseElement(
        `
        <playground for="Translate">
          <model>
            model: openai/gpt-4o
            providerOptions:
              customProvider:
                someOption: true
          </model>
          <samples>
          - input:
              text: "Hello"
          </samples>
        </playground>
      `,
        "prompts/Translate.play.tp",
      );

      const parsed = parsePlayground(node);
      if (parsed.kind === "error") throw new Error("parsePlayground failed");

      const result = validatePlayground(parsed, template);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message: "Unknown field 'customProvider'",
          },
        ],
      });
    });
  });
});
