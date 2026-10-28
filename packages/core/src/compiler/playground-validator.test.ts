import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { unwrapJsonValue } from "../json/unwrapper.js";
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
import { parseDataset } from "./dataset-parser.js";
import { validateDataset } from "./dataset-validator.js";
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

describe("validateDataset", () => {
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

  it("validates a dataset matching template input schema", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - name: "Spanish greeting"
          input:
            text: "Hello"
            targetLanguage: "es"
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
    expect(result).toMatch({
      kind: "dataset",
      templateId: "Main:Translate",
      samples: [
        {
          name: { text: "Spanish greeting" },
          input: {
            text: "Hello",
            targetLanguage: "es",
          },
        },
      ],
    });
  });

  it("validates a dataset where name is omitted", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - input:
            text: "What time is it?"
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
    expect(result).toMatch({
      kind: "dataset",
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

  it("reports an error when an unknown field is present", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - input:
            text: "Bonjour"
          goldenOutput:
            translated: "Hello"
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
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
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - input:
            text: 12345
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
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
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - input:
            text: "Hello"
          output:
            translated: "Bonjour"
          weight: 2
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
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

  it("reports an error when dataset content is not a YAML array", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        input:
          text: "Hello"
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected array but got object",
        },
      ],
    });
  });

  it("links dataset 'for' attribute to template name span", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - input:
            text: "Hello"
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
    if (result.kind !== "dataset") throw new Error("Expected dataset result");

    expect(result.definitionLinks[0]).toMatch({
      reference: parsed.for,
      definition: template.template.name,
    });
  });

  describe("intermediateSteps and tool calls", () => {
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
          - tool: calc
          - tool: search
        </tools>
        <system>You are a math assistant.</system>
        <user><insert val="input.question"/></user>
      </template>
    `,
      { calc: calcTool, search: searchTool },
    );

    it("validates intermediateSteps with valid tool calls and extracts them", () => {
      const datasetNode = parseElement(
        `
        <dataset for="MathAssistant">
          - name: "Arithmetic step"
            input:
              question: "What is 2+2?"
            intermediateSteps:
              - toolCalls:
                  - tool: calc
                    callId: "call-1"
                    input:
                      expr: "2+2"
                    output:
                      result: 4
        </dataset>
      `,
        "prompts/MathAssistant.dataset.tp",
      );

      const parsed = parseDataset(datasetNode);
      if (parsed.kind === "error") throw new Error("parseDataset failed");

      const result = validateDataset(parsed, mathTemplate);
      expect(result.kind).toBe("dataset");
      if (result.kind !== "dataset") return;

      expect(result.templateId).toBe("Main:MathAssistant");
      expect(result.samples).toMatch([
        {
          name: { text: "Arithmetic step" },
          input: {
            question: "What is 2+2?",
          },
        },
      ]);
      const toolCall = result.samples[0]!.intermediateSteps![0]!.toolCalls[0]!;
      expect(toolCall.callId.text).toBe("call-1");
      expect(toolCall.toolId).toBe("Main:calc");
      expect(toolCall.toolName.text).toBe("calc");
      expect(toolCall.input.kind).toBe("object");
      expect(unwrapJsonValue(toolCall.input)).toMatch({ expr: "2+2" });
      expect(toolCall.output?.kind).toBe("object");
      expect(unwrapJsonValue(toolCall.output!)).toMatch({ result: 4 });
    });

    it("allows omitting tool call output (callId is required)", () => {
      const datasetNode = parseElement(
        `
        <dataset for="MathAssistant">
          - input:
              question: "Calculate"
            intermediateSteps:
              - toolCalls:
                  - tool: calc
                    callId: "call-2"
                    input:
                      expr: "10 * 10"
        </dataset>
      `,
        "prompts/MathAssistant.dataset.tp",
      );

      const parsed = parseDataset(datasetNode);
      if (parsed.kind === "error") throw new Error("parseDataset failed");

      const result = validateDataset(parsed, mathTemplate);
      expect(result.kind).toBe("dataset");
      if (result.kind !== "dataset") return;

      const toolCall = result.samples[0]!.intermediateSteps![0]!.toolCalls[0]!;
      expect(toolCall.callId.text).toBe("call-2");
      expect(toolCall.toolId).toBe("Main:calc");
      expect(toolCall.toolName.text).toBe("calc");
      expect(toolCall.output).toBe(undefined);
      expect(toolCall.input.kind).toBe("object");
      expect(unwrapJsonValue(toolCall.input)).toMatch({ expr: "10 * 10" });
    });

    it("reports an error when tool call callId is missing", () => {
      const datasetNode = parseElement(
        `
        <dataset for="MathAssistant">
          - input:
              question: "Calculate"
            intermediateSteps:
              - toolCalls:
                  - tool: calc
                    input:
                      expr: "10 * 10"
        </dataset>
      `,
        "prompts/MathAssistant.dataset.tp",
      );

      const parsed = parseDataset(datasetNode);
      if (parsed.kind === "error") throw new Error("parseDataset failed");

      const result = validateDataset(parsed, mathTemplate);
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
      const datasetNode = parseElement(
        `
        <dataset for="MathAssistant">
          - input:
              question: "Look up"
            intermediateSteps:
              - toolCalls:
                  - tool: unknownTool
                    callId: "call-1"
                    input: {}
                    output: {}
        </dataset>
      `,
        "prompts/MathAssistant.dataset.tp",
      );

      const parsed = parseDataset(datasetNode);
      if (parsed.kind === "error") throw new Error("parseDataset failed");

      const result = validateDataset(parsed, mathTemplate);
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
      const datasetNode = parseElement(
        `
        <dataset for="MathAssistant">
          - input:
              question: "Calculate"
            intermediateSteps:
              - toolCalls:
                  - tool: calc
                    callId: "call-1"
                    input:
                      expr: 12345
                    output:
                      result: 12345
        </dataset>
      `,
        "prompts/MathAssistant.dataset.tp",
      );

      const parsed = parseDataset(datasetNode);
      if (parsed.kind === "error") throw new Error("parseDataset failed");

      const result = validateDataset(parsed, mathTemplate);
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
      const datasetNode = parseElement(
        `
        <dataset for="MathAssistant">
          - input:
              question: "Calculate"
            intermediateSteps:
              - toolCalls:
                  - tool: calc
                    callId: "call-1"
                    input:
                      expr: "5+5"
                    output:
                      result: "not a number"
        </dataset>
      `,
        "prompts/MathAssistant.dataset.tp",
      );

      const parsed = parseDataset(datasetNode);
      if (parsed.kind === "error") throw new Error("parseDataset failed");

      const result = validateDataset(parsed, mathTemplate);
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
      const datasetNode = parseElement(
        `
        <dataset for="MathAssistant">
          - input:
              question: "What is 1+1?"
            intermediateSteps:
              - toolCalls:
                  - tool: calc
                    callId: "call-1"
                    input:
                      expr: "1+1"
                    output:
                      result: 2
        </dataset>
      `,
        "prompts/MathAssistant.dataset.tp",
      );

      const parsed = parseDataset(datasetNode);
      if (parsed.kind === "error") throw new Error("parseDataset failed");

      const result = validateDataset(parsed, mathTemplate);
      if (result.kind !== "dataset") throw new Error("Expected dataset result");

      const toolLink = result.definitionLinks.find(
        (link) => link.definition.text === "calc",
      );
      if (!toolLink) throw new Error("Expected tool definition link");
      expect(toolLink.definition).toMatch({
        text: "calc",
      });
    });
  });
});
