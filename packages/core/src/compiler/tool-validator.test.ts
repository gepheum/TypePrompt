import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { EMPTY_SCHEMA } from "../schema/empty-schema.js";
import { parseSchema } from "../schema/schema-parser.js";
import type { Schema } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import type { MappedText } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { ToolValidationResult } from "./compiler-types.js";
import { parseTool } from "./tool-parser.js";
import { validateTool } from "./tool-validator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseElement(
  xml: string,
  path = "prompts/searchTool.xml",
): ElementNode {
  const result = parseXmlDocument(xml, path);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

function parseSchemaOrThrow(source: string, path = "schema.ts"): Schema {
  const node: MappedText = {
    path,
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const parsed = parseSchema(node);
  if (parsed.kind !== "success") throw new Error("parseSchema failed");
  const validated = validateSchema(parsed, { kind: "namespace" });
  if (validated.kind !== "success") {
    throw new Error(
      `validateSchema failed: ${validated.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return validated;
}

function testValidateTool(args: {
  readonly xml: string;
  readonly namespaceSchema?: Schema;
  readonly path?: string;
}): ToolValidationResult {
  const root = parseElement(args.xml, args.path ?? "prompts/searchTool.xml");
  const parsedTool = parseTool(root);
  if (parsedTool.kind === "error") {
    throw new Error(
      `parseTool failed: ${parsedTool.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return validateTool({
    tool: parsedTool,
    namespaceSchema: args.namespaceSchema ?? EMPTY_SCHEMA,
  });
}

// ---------------------------------------------------------------------------
// validateTool
// ---------------------------------------------------------------------------

describe("validateTool", () => {
  it("validates a simple tool and populates definitionLinks", () => {
    const result = testValidateTool({
      xml: `
        <tool name="searchTool">
          <description>Searches for information</description>
          <schema>
            type Input = { query: string; };
            type Output = { results: string[]; };
          </schema>
        </tool>
      `,
    });

    expect(result).toMatch({
      kind: "tool",
      tool: {
        kind: "tool",
        name: { text: "searchTool" },
      },
      schema: {
        kind: "success",
      },
      definitionLinks: [],
    });
  });

  it("validates a tool referencing shared types in namespaceSchema", () => {
    const namespaceSchema = parseSchemaOrThrow(`
      type QueryOptions = {
        limit: number;
      };
    `);

    const result = testValidateTool({
      xml: `
        <tool name="searchTool">
          <description>Searches with options</description>
          <schema>
            type Input = {
              query: string;
              options: shared.QueryOptions;
            };
            type Output = { results: string[]; };
          </schema>
        </tool>
      `,
      namespaceSchema,
    });

    expect(result).toMatch({
      kind: "tool",
      tool: {
        kind: "tool",
        name: { text: "searchTool" },
      },
      schema: {
        kind: "success",
      },
      definitionLinks: [],
    });
  });

  it("validates tool description with <c> tags", () => {
    const result = testValidateTool({
      xml: `
        <tool name="searchTool">
          <description>Takes <c>query</c> and returns <c>results</c></description>
          <schema>
            type Input = { query: string; };
            type Output = { results: string[]; };
          </schema>
        </tool>
      `,
    });

    expect(result).toMatch({
      kind: "tool",
      tool: {
        kind: "tool",
        name: { text: "searchTool" },
      },
      schema: {
        kind: "success",
      },
      definitionLinks: [],
    });
  });

  it("reports error with definitionLinks when tool schema is invalid", () => {
    const result = testValidateTool({
      xml: `
        <tool name="searchTool">
          <description>Missing Output type</description>
          <schema>
            type Input = { query: string; };
          </schema>
        </tool>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing required type 'Output'",
        },
      ],
      definitionLinks: [],
    });
  });

  it("reports error with definitionLinks when description has invalid identifier", () => {
    const result = testValidateTool({
      xml: `
        <tool name="searchTool">
          <description>Takes <c>unknownField</c></description>
          <schema>
            type Input = { query: string; };
            type Output = { results: string[]; };
          </schema>
        </tool>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Identifier 'unknownField' not found in schema",
        },
      ],
      definitionLinks: [],
    });
  });

  it("reports error with definitionLinks when description has invalid JSON in <c> tag", () => {
    const result = testValidateTool({
      xml: `
        <tool name="searchTool">
          <description>Example: <c>{"wrongField": 123}</c></description>
          <schema>
            type Input = { query: string; };
            type Output = { results: string[]; };
          </schema>
        </tool>
      `,
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Does not match any of the types defined in the schema",
        },
      ],
      definitionLinks: [],
    });
  });
});
