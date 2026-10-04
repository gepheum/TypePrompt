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
  SchemaOrError,
  TemplateValidationResult,
  Tool,
  ToolValidationResult,
} from "./compiler-types.js";
import { parseTemplate } from "./template-parser.js";
import { validateTemplate } from "./template-validator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseElement(xml: string): ElementNode {
  const result = parseXmlDocument(xml);
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
): Schema {
  const node: MappedText = {
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const parsed = parseSchema(node);
  if (parsed.kind !== "success") throw new Error("parseSchema failed");
  const validated = validateSchema(parsed, { kind });
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
    name: { text: name, start: 0, end: name.length },
    namespace: null,
    description: [],
    schema: { kind: "success", typeDeclarations: {}, sourcePosition: 0 },
    warnings: [],
  };
  return {
    kind: "tool",
    tool,
    schema,
  };
}

function testValidateTemplate(args: {
  readonly templateXml: string;
  readonly metaSchemaSource?: string;
  readonly metaSchemaOrError?: SchemaOrError;
  readonly namespaceSchemaSource?: string;
  readonly namespaceTools?: { readonly [name: string]: ToolValidationResult };
  readonly path?: string;
}): TemplateValidationResult {
  const path = args.path ?? "prompts/Translate.xml";
  const root = parseElement(args.templateXml);
  const parsedTemplate = parseTemplate(root, path);
  if (parsedTemplate.kind !== "template") {
    throw new Error(
      `parseTemplate failed: ${parsedTemplate.errors.map((e) => e.message).join(", ")}`,
    );
  }

  const metaSchema: SchemaOrError =
    args.metaSchemaOrError ??
    (args.metaSchemaSource
      ? parseSchemaOrThrow(args.metaSchemaSource, "meta")
      : EMPTY_SCHEMA);

  const namespaceSchema = args.namespaceSchemaSource
    ? parseSchemaOrThrow(args.namespaceSchemaSource, "namespace")
    : EMPTY_SCHEMA;

  return validateTemplate({
    template: parsedTemplate,
    metaSchema,
    namespaceSchema,
    namespaceTools: args.namespaceTools ?? {},
  });
}

// ---------------------------------------------------------------------------
// validateTemplate - minimal valid templates
// ---------------------------------------------------------------------------

describe("validateTemplate - minimal valid templates", () => {
  it("validates a minimal valid template without variants", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = { text: string; };
            type Output = { translated: string; };
          </schema>
          <system>You are a translator.</system>
          <user>Translate: <insert val="input.text"/></user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "template",
      tools: {},
    });
  });

  it("validates a template using shared types from namespace schema", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = { user: shared.SharedUser; };
            type Output = string;
          </schema>
          <system>Translator</system>
          <user>User: <insert val="input.user.name"/></user>
        </template>
      `,
      namespaceSchemaSource: `
        type SharedUser = { name: string; };
      `,
    });

    expect(result).toMatch({
      kind: "template",
      tools: {},
    });
  });

  it("validates a template with tools", () => {
    const calcTool = makeTool(
      "calc",
      "type Input = { expr: string; }; type Output = { result: integer; };",
    );

    const result = testValidateTemplate({
      templateXml: `
        <template name="MathAssistant">
          <schema>
            type Input = { problem: string; };
            type Output = string;
          </schema>
          <tools>
            - tool: calc
          </tools>
          <system>You solve math problems with <c>calc</c>.</system>
          <user>Problem: <insert val="input.problem"/></user>
        </template>
      `,
      path: "prompts/MathAssistant.xml",
      namespaceTools: { calc: calcTool },
    });

    expect(result).toMatch({
      kind: "template",
      tools: {
        calc: {
          tool: {
            kind: "tool",
          },
        },
      },
    });
  });

  it("validates a template with variants and shared user prompt", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = {
              variant: "short" | "detailed";
              query: string;
            };
            type Output = string;
          </schema>
          <user>Query: <insert val="input.query"/></user>
          <variant case="short">
            <system>Give a brief classification.</system>
          </variant>
          <variant case="detailed">
            <system>Give a thorough, detailed classification.</system>
          </variant>
        </template>
      `,
      path: "prompts/Classify.xml",
    });

    expect(result).toMatch({
      kind: "template",
      tools: {},
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplate - schema validation errors
// ---------------------------------------------------------------------------

describe("validateTemplate - schema validation errors", () => {
  it("reports an error when Input type is missing from template schema", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Output = string;
          </schema>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing required type 'Input'",
        },
      ],
    });
  });

  it("reports an error when Output type is missing from template schema", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = string;
          </schema>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing required type 'Output'",
        },
      ],
    });
  });

  it("reports an error when a declared type is unused in the template schema", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = string;
            type Output = string;
            type UnusedType = { unusedField: string; };
          </schema>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Type 'UnusedType' is not used",
        },
      ],
    });
  });

  it("reports an error for cyclic type references in template schema", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = { self: Input; };
            type Output = string;
          </schema>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Type 'Input' circularly references itself",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplate - meta validation
// ---------------------------------------------------------------------------

describe("validateTemplate - meta validation", () => {
  it("validates template with matching <meta> when meta schema defines Meta", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = string;
            type Output = string;
          </schema>
          <meta>
            temperature: 0.8
            maxTokens: 500
          </meta>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
      metaSchemaSource: `
        type Meta = {
          temperature: number;
          maxTokens: integer;
        };
      `,
    });

    expect(result).toMatch({
      kind: "template",
    });
  });

  it("reports an error when required <meta> is missing in no-variants template", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = string;
            type Output = string;
          </schema>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
      metaSchemaSource: "type Meta = { temperature: number; };",
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <meta> element",
        },
      ],
    });
  });

  it("reports an error when <meta> JSON does not match Meta schema", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = string;
            type Output = string;
          </schema>
          <meta>
            temperature: "high"
          </meta>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
      metaSchemaSource: "type Meta = { temperature: number; };",
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected number but got string",
        },
      ],
    });
  });

  it("reports an error for extraneous <meta> when meta schema does not define Meta", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = string;
            type Output = string;
          </schema>
          <meta>
            extra: 123
          </meta>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
      metaSchemaOrError: EMPTY_SCHEMA,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Extraneous <meta> element",
          hint: "Remove this <meta> element or add a <meta> element at the top level",
        },
      ],
    });
  });

  it("validates variants template when defaultContent provides valid <meta>", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = { variant: "a" | "b"; };
            type Output = string;
          </schema>
          <meta>
            temperature: 0.5
          </meta>
          <user>Query</user>
          <variant case="a"><system>Sys A</system></variant>
          <variant case="b"><system>Sys B</system></variant>
        </template>
      `,
      path: "prompts/Classify.xml",
      metaSchemaSource: "type Meta = { temperature: number; };",
    });

    expect(result).toMatch({
      kind: "template",
    });
  });

  it("validates variants template when every variant provides valid <meta>", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = { variant: "a" | "b"; };
            type Output = string;
          </schema>
          <user>Query</user>
          <variant case="a">
            <meta>temperature: 0.2</meta>
            <system>Sys A</system>
          </variant>
          <variant case="b">
            <meta>temperature: 0.9</meta>
            <system>Sys B</system>
          </variant>
        </template>
      `,
      path: "prompts/Classify.xml",
      metaSchemaSource: "type Meta = { temperature: number; };",
    });

    expect(result).toMatch({
      kind: "template",
    });
  });

  it("reports missing <meta> on template tag when neither default nor variants have meta", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = { variant: "a" | "b"; };
            type Output = string;
          </schema>
          <user>Query</user>
          <variant case="a"><system>Sys A</system></variant>
          <variant case="b"><system>Sys B</system></variant>
        </template>
      `,
      path: "prompts/Classify.xml",
      metaSchemaSource: "type Meta = { temperature: number; };",
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <meta> element",
        },
      ],
    });
  });

  it("reports missing <meta> on specific variant tag when another variant has meta", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = { variant: "a" | "b"; };
            type Output = string;
          </schema>
          <user>Query</user>
          <variant case="a">
            <meta>temperature: 0.2</meta>
            <system>Sys A</system>
          </variant>
          <variant case="b">
            <system>Sys B</system>
          </variant>
        </template>
      `,
      path: "prompts/Classify.xml",
      metaSchemaSource: "type Meta = { temperature: number; };",
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <meta> element",
        },
      ],
    });
  });

  it("reports extraneous <meta> on variant tags when meta schema has no Meta", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = { variant: "a" | "b"; };
            type Output = string;
          </schema>
          <user>Query</user>
          <variant case="a">
            <meta>temperature: 0.2</meta>
            <system>Sys A</system>
          </variant>
          <variant case="b">
            <system>Sys B</system>
          </variant>
        </template>
      `,
      path: "prompts/Classify.xml",
      metaSchemaOrError: EMPTY_SCHEMA,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Extraneous <meta> element",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplate - variants validation
// ---------------------------------------------------------------------------

describe("validateTemplate - variants validation", () => {
  it("reports an error when Input is not an interface with variants", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = string;
            type Output = string;
          </schema>
          <user>Query</user>
          <variant case="a"><system>Sys A</system></variant>
        </template>
      `,
      path: "prompts/Classify.xml",
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "'Input' must be an interface when using <variant> elements",
        },
      ],
    });
  });

  it("reports an error when Input interface lacks a 'variant' field", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = { query: string; };
            type Output = string;
          </schema>
          <user>Query</user>
          <variant case="a"><system>Sys A</system></variant>
        </template>
      `,
      path: "prompts/Classify.xml",
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "'Input' must have a 'variant' field when using <variant> elements",
        },
      ],
    });
  });

  it("reports an error when 'variant' field type is not a union of string literals", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = { variant: string; };
            type Output = string;
          </schema>
          <user>Query</user>
          <variant case="a"><system>Sys A</system></variant>
        </template>
      `,
      path: "prompts/Classify.xml",
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Type of 'variant' field must be a union of string literals",
        },
      ],
    });
  });

  it("reports missing <variant case='...'> for unhandled union members", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = { variant: "a" | "b" | "c"; };
            type Output = string;
          </schema>
          <user>Query</user>
          <variant case="a"><system>Sys A</system></variant>
          <variant case="b"><system>Sys B</system></variant>
        </template>
      `,
      path: "prompts/Classify.xml",
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <variant case='c'> in the template",
        },
      ],
    });
  });

  it("reports an error for extraneous variant cases not in Input.variant union", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = { variant: "a" | "b"; };
            type Output = string;
          </schema>
          <user>Query</user>
          <variant case="a"><system>Sys A</system></variant>
          <variant case="b"><system>Sys B</system></variant>
          <variant case="c"><system>Sys C</system></variant>
        </template>
      `,
      path: "prompts/Classify.xml",
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "'Input.variant' can never be 'c'",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplate - tools validation
// ---------------------------------------------------------------------------

describe("validateTemplate - tools validation", () => {
  it("reports an error when template references an unknown tool", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Research">
          <schema>
            type Input = string;
            type Output = string;
          </schema>
          <tools>
            - tool: unknownTool
          </tools>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
      path: "prompts/Research.xml",
      namespaceTools: {},
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected: never",
        },
      ],
    });
  });

  it("reports an error for duplicate tools in <tools>", () => {
    const calcTool = makeTool(
      "calc",
      "type Input = { expr: string; }; type Output = { result: integer; };",
    );

    const result = testValidateTemplate({
      templateXml: `
        <template name="Research">
          <schema>
            type Input = string;
            type Output = string;
          </schema>
          <tools>
            - tool: calc
            - tool: calc
          </tools>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
      path: "prompts/Research.xml",
      namespaceTools: { calc: calcTool },
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Duplicate tool 'calc'",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplate - examples validation
// ---------------------------------------------------------------------------

describe("validateTemplate - examples validation", () => {
  it("validates few-shot examples matching Input and Output types", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = { text: string; };
            type Output = { result: string; };
          </schema>
          <system>Sys</system>
          <user>Usr: <insert val="input.text"/></user>
          <examples>
            - input:
                text: "hello"
              output:
                result: "bonjour"
          </examples>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "template",
    });
  });

  it("reports an error for examples with mismatched output schema", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = { text: string; };
            type Output = { result: string; };
          </schema>
          <system>Sys</system>
          <user>Usr</user>
          <examples>
            - input:
                text: "hello"
              output:
                result: 123
          </examples>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected string but got number",
        },
      ],
    });
  });

  it("validates examples with tool calls in intermediateSteps", () => {
    const calcTool = makeTool(
      "calc",
      "type Input = { expr: string; }; type Output = { result: integer; };",
    );

    const result = testValidateTemplate({
      templateXml: `
        <template name="MathAssistant">
          <schema>
            type Input = { query: string; };
            type Output = string;
          </schema>
          <tools>
            - tool: calc
          </tools>
          <system>Sys</system>
          <user>Usr</user>
          <examples>
            - input:
                query: "What is 2+2?"
              intermediateSteps:
                - toolCalls:
                    - tool: "calc"
                      callId: "call-1"
                      input:
                        expr: "2+2"
                      output:
                        result: 4
              output: "4"
          </examples>
        </template>
      `,
      path: "prompts/MathAssistant.xml",
      namespaceTools: { calc: calcTool },
    });

    expect(result).toMatch({
      kind: "template",
    });
  });

  it("reports an error when tool call input in examples mismatches tool Input schema", () => {
    const calcTool = makeTool(
      "calc",
      "type Input = { expr: string; }; type Output = { result: integer; };",
    );

    const result = testValidateTemplate({
      templateXml: `
        <template name="MathAssistant">
          <schema>
            type Input = { query: string; };
            type Output = string;
          </schema>
          <tools>
            - tool: calc
          </tools>
          <system>Sys</system>
          <user>Usr</user>
          <examples>
            - input:
                query: "What is 2+2?"
              intermediateSteps:
                - toolCalls:
                    - tool: "calc"
                      callId: "call-1"
                      input:
                        expr: 123
                      output:
                        result: 4
              output: "4"
          </examples>
        </template>
      `,
      path: "prompts/MathAssistant.xml",
      namespaceTools: { calc: calcTool },
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected string but got number",
        },
      ],
    });
  });

  it("reports an error when examples inside a <variant> specify the variant field", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = {
              variant: "a" | "b";
              query: string;
            };
            type Output = string;
          </schema>
          <user>Query</user>
          <variant case="a">
            <system>Sys A</system>
            <examples>
              - input:
                  variant: "a"
                  query: "test"
                output: "result"
            </examples>
          </variant>
          <variant case="b">
            <system>Sys B</system>
          </variant>
        </template>
      `,
      path: "prompts/Classify.xml",
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Examples must not specify 'variant' when within a <variant> element",
        },
      ],
    });
  });

  it("allows omitting the variant field in examples within a <variant>", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Classify">
          <schema>
            type Input = {
              variant: "a" | "b";
              query: string;
            };
            type Output = string;
          </schema>
          <user>Query</user>
          <variant case="a">
            <system>Sys A</system>
            <examples>
              - input:
                  query: "test"
                output: "result"
            </examples>
          </variant>
          <variant case="b">
            <system>Sys B</system>
          </variant>
        </template>
      `,
      path: "prompts/Classify.xml",
    });

    expect(result).toMatch({
      kind: "template",
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplate - snippets validation
// ---------------------------------------------------------------------------

describe("validateTemplate - snippets validation", () => {
  it("validates plain snippet and reports body validation errors in it", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = { text: string; score: number; };
            type Output = string;
          </schema>
          <snippet name="badSnippet">
            <insert val="input.score"/>
          </snippet>
          <system>Sys: <insert snippet="badSnippet"/></system>
          <user>Usr: <insert val="input.text"/></user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Must specify format when type is not string or integer",
        },
      ],
    });
  });

  it("validates snippet-if with narrowing and reports body errors in then/else", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = {
              ready: boolean;
              detail?: { id: string; };
              score: number;
            };
            type Output = string;
          </schema>
          <snippet name="condSnippet" if="input.ready">
            <then>
              Ready: <insert val="input.score"/>
            </then>
            <else>
              Not ready
            </else>
          </snippet>
          <system>Sys <insert snippet="condSnippet"/></system>
          <user>Usr</user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Must specify format when type is not string or integer",
        },
      ],
    });
  });

  it("reports if-expression resolution errors for invalid 'is' attribute", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = { ready: string; };
            type Output = string;
          </schema>
          <snippet name="condSnippet" if="input.ready" is="true">
            <then>Ready</then>
            <else>Not ready</else>
          </snippet>
          <system>Sys <insert snippet="condSnippet"/></system>
          <user>Usr</user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "must use 'is=\"notEmpty\"' with array or string type",
        },
      ],
    });
  });

  it("reports missing <on case='...'> for unhandled switch cases", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = { mode: "fast" | "accurate" | "balanced"; };
            type Output = string;
          </schema>
          <snippet name="modeSnippet" switch="input.mode">
            <on case="fast">Fast mode</on>
          </snippet>
          <system>Sys <insert snippet="modeSnippet"/></system>
          <user>Usr</user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <on case='accurate'>, <on case='balanced'>",
        },
      ],
    });
  });

  it("reports unreachable case branches in snippet-switch with suggestions", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = { mode: "fast" | "accurate"; };
            type Output = string;
          </schema>
          <snippet name="modeSnippet" switch="input.mode">
            <on case="fast">Fast</on>
            <on case="accurate">Accurate</on>
            <on case="unknown">Unknown</on>
          </snippet>
          <system>Sys <insert snippet="modeSnippet"/></system>
          <user>Usr</user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expression can never be 'unknown'",
          suggestions: [],
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplate - system and user body validation
// ---------------------------------------------------------------------------

describe("validateTemplate - system and user body validation", () => {
  it("reports unknown C-Tag errors in system body", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = { text: string; };
            type Output = string;
          </schema>
          <system>System with <c>invalidSymbol</c></system>
          <user>Usr: <insert val="input.text"/></user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Identifier 'invalidSymbol' not found in schema",
        },
      ],
    });
  });

  it("reports unformatted number insert errors in user body", () => {
    const result = testValidateTemplate({
      templateXml: `
        <template name="Translate">
          <schema>
            type Input = { score: number; };
            type Output = string;
          </schema>
          <system>Sys</system>
          <user>Score: <insert val="input.score"/></user>
        </template>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Must specify format when type is not string or integer",
        },
      ],
    });
  });
});
