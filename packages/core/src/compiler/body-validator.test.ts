import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseExpression } from "../expression/expression-parser.js";
import type {
  Expression,
  ExpressionContext,
} from "../expression/expression-types.js";
import { parseSchema } from "../schema/schema-parser.js";
import type {
  PrimitiveType,
  ResolvedType,
  Schema,
} from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import type {
  InternalError,
  MappedSpan,
  ValidationResult,
} from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import { parseBody, parseToolDescription } from "./body-parser.js";
import {
  validateTemplateBody,
  validateToolDescription,
} from "./body-validator.js";
import type { TemplateTool, Tool } from "./compiler-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseElement(xml: string, path = "test.tp"): ElementNode {
  const result = parseXmlDocument(xml, path);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

function parseSchemaOrThrow(source: string, path = "schema.ts"): Schema {
  const node = textNode(source, path);
  const parsed = parseSchema(node, "namespace");
  if (parsed.kind !== "success") throw new Error("parseSchema failed");
  const validated = validateSchema(parsed, null);
  if (validated.kind !== "success") {
    throw new Error(
      `validateSchema failed: ${validated.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return validated;
}

function makeValidatedTool(name: string, schemaSource: string): TemplateTool {
  const schema = parseSchemaOrThrow(schemaSource);
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
    tool: {
      kind: "tool",
      tool,
      schema,
      definitionLinks: [],
    },
  };
}

function testValidateBody(args: {
  readonly bodyXml: string;
  readonly schemaSource: string;
  readonly tools?: { readonly [name: string]: TemplateTool };
  readonly context?: ExpressionContext | null;
  readonly hasValContext?: boolean;
}): ValidationResult {
  const hasValContext = args.hasValContext ?? false;
  const root = parseElement(args.bodyXml);
  const parseErrors: InternalError[] = [];
  const body = parseBody(root, parseErrors, { hasValContext });
  if (parseErrors.length > 0) {
    throw new Error(
      `parseBody failed: ${parseErrors.map((e) => e.message).join(", ")}`,
    );
  }
  const schema = parseSchemaOrThrow(args.schemaSource);
  return validateTemplateBody(
    body,
    schema,
    args.tools ?? {},
    (args.context ?? null) as any,
  );
}

function testValidateToolDescription(args: {
  readonly descXml: string;
  readonly schemaSource: string;
}): ValidationResult {
  const root = parseElement(args.descXml);
  const parseErrors: InternalError[] = [];
  const description = parseToolDescription(root, parseErrors);
  if (parseErrors.length > 0) {
    throw new Error(
      `parseToolDescription failed: ${parseErrors.map((e) => e.message).join(", ")}`,
    );
  }
  const toolSchema = parseSchemaOrThrow(args.schemaSource);
  return validateToolDescription({
    description,
    toolSchema,
  });
}

function textNode(source: string, path = ""): MappedSpan {
  return {
    text: source,
    start: 0,
    end: source.length,
    path,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

function makeExpr(path: string): Expression<false> {
  const r = parseExpression(textNode(path), { hasValContext: false });
  if (r.kind !== "success") throw new Error(`parseExpression failed: ${path}`);
  return r.expression;
}

function prim(
  text: "string" | "number" | "boolean" | "integer",
): PrimitiveType {
  return {
    kind: "primitive",
    primitive: { text, start: 0, end: text.length, path: "" },
  };
}

// ---------------------------------------------------------------------------
// validateTemplateBody - plain text and skipped pieces
// ---------------------------------------------------------------------------

describe("validateTemplateBody - plain text and snippet references", () => {
  it("returns no errors for plain text body", () => {
    const args = {
      bodyXml: "<system>Hello world</system>",
      schemaSource: "type Input = string;",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [],
    });
  });

  it("skips insert snippet elements without errors", () => {
    const args = {
      bodyXml: '<system><insert snippet="mySnippet"/></system>',
      schemaSource: "type Input = string;",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - <insert val="..."> implicit format
// ---------------------------------------------------------------------------

describe("validateTemplateBody - insert val with implicit format", () => {
  it("allows string primitive without format", () => {
    const args = {
      bodyXml: '<system><insert val="input.name"/></system>',
      schemaSource: "type Input = { name: string; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "name" } }],
    });
  });

  it("allows integer primitive without format", () => {
    const args = {
      bodyXml: '<system><insert val="input.count"/></system>',
      schemaSource: "type Input = { count: integer; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "count" } }],
    });
  });

  it("allows string literal without format", () => {
    const args = {
      bodyXml: '<system><insert val="input.status"/></system>',
      schemaSource: 'type Input = { status: "ready"; };',
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "status" } }],
    });
  });

  it("allows string union without format", () => {
    const args = {
      bodyXml: '<system><insert val="input.role"/></system>',
      schemaSource: 'type Input = { role: "admin" | "user"; };',
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "role" } }],
    });
  });

  it("requires format for float number primitive", () => {
    const args = {
      bodyXml: '<system><insert val="input.score"/></system>',
      schemaSource: "type Input = { score: number; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "Must specify format when type is not string or integer",
          hint: "Add a format attribute, for example format='json'",
        },
      ],
      definitionLinks: [{ definition: { text: "score" } }],
    });
  });

  it("requires format for boolean primitive", () => {
    const args = {
      bodyXml: '<system><insert val="input.active"/></system>',
      schemaSource: "type Input = { active: boolean; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "Must specify format when type is not string or integer",
        },
      ],
      definitionLinks: [{ definition: { text: "active" } }],
    });
  });

  it("requires format for interface type", () => {
    const args = {
      bodyXml: '<system><insert val="input.user"/></system>',
      schemaSource: "type Input = { user: { name: string; }; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "Must specify format when type is not string or integer",
        },
      ],
      definitionLinks: [{ definition: { text: "user" } }],
    });
  });

  it("requires format for array type", () => {
    const args = {
      bodyXml: '<system><insert val="input.items"/></system>',
      schemaSource: "type Input = { items: string[]; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "Must specify format when type is not string or integer",
        },
      ],
      definitionLinks: [{ definition: { text: "items" } }],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - null, optional, and expression errors
// ---------------------------------------------------------------------------

describe("validateTemplateBody - null, optional, and expression errors", () => {
  it("reports an error when expression resolves to null in context", () => {
    const context: ExpressionContext = {
      it: {
        expression: makeExpr("input.opt"),
        type: prim("string"),
      },
      typeOverrides: {
        "input.opt": { kind: "null" },
      },
    };
    const args = {
      bodyXml: '<system><insert val="it"/></system>',
      schemaSource: "type Input = { opt?: string; };",
      context,
      hasValContext: true,
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "Always null",
        },
      ],
      definitionLinks: [],
    });
  });

  it("reports an error when expression resolves to optional", () => {
    const args = {
      bodyXml: '<system><insert val="input.email"/></system>',
      schemaSource: "type Input = { email?: string; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "May be null",
        },
      ],
      definitionLinks: [{ definition: { text: "email" } }],
    });
  });

  it("propagates expression resolution errors for unknown fields", () => {
    const args = {
      bodyXml: '<system><insert val="input.missing"/></system>',
      schemaSource: "type Input = { name: string; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "Field 'missing' not found in interface",
        },
      ],
      definitionLinks: [],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - format='text'
// ---------------------------------------------------------------------------

describe("validateTemplateBody - format='text'", () => {
  it("allows format='text' on string primitive", () => {
    const args = {
      bodyXml: '<system><insert val="input.text" format="text"/></system>',
      schemaSource: "type Input = { text: string; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "text" } }],
    });
  });

  it("allows format='text' on integer primitive", () => {
    const args = {
      bodyXml: '<system><insert val="input.count" format="text"/></system>',
      schemaSource: "type Input = { count: integer; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "count" } }],
    });
  });

  it("allows format='text' on string literal", () => {
    const args = {
      bodyXml: '<system><insert val="input.status" format="text"/></system>',
      schemaSource: 'type Input = { status: "pending"; };',
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "status" } }],
    });
  });

  it("allows format='text' on string union", () => {
    const args = {
      bodyXml: '<system><insert val="input.mode" format="text"/></system>',
      schemaSource: 'type Input = { mode: "fast" | "slow"; };',
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "mode" } }],
    });
  });

  it("rejects format='text' on float number primitive", () => {
    const args = {
      bodyXml: '<system><insert val="input.score" format="text"/></system>',
      schemaSource: "type Input = { score: number; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "'text' can only be used with string and integer types",
        },
      ],
      definitionLinks: [{ definition: { text: "score" } }],
    });
  });

  it("rejects format='text' on boolean primitive", () => {
    const args = {
      bodyXml: '<system><insert val="input.flag" format="text"/></system>',
      schemaSource: "type Input = { flag: boolean; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "'text' can only be used with string and integer types",
        },
      ],
      definitionLinks: [{ definition: { text: "flag" } }],
    });
  });

  it("rejects format='text' on interface type", () => {
    const args = {
      bodyXml: '<system><insert val="input.user" format="text"/></system>',
      schemaSource: "type Input = { user: { id: string; }; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "'text' can only be used with string and integer types",
        },
      ],
      definitionLinks: [{ definition: { text: "user" } }],
    });
  });

  it("rejects format='text' on array type", () => {
    const args = {
      bodyXml: '<system><insert val="input.tags" format="text"/></system>',
      schemaSource: "type Input = { tags: string[]; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "'text' can only be used with string and integer types",
        },
      ],
      definitionLinks: [{ definition: { text: "tags" } }],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - format='csv' and format='tsv'
// ---------------------------------------------------------------------------

describe("validateTemplateBody - format='csv' and format='tsv'", () => {
  it("allows format='csv' and format='tsv' on tabular array of interfaces", () => {
    const args = {
      bodyXml: `
        <system>
          <insert val="input.rows" format="csv"/>
          <insert val="input.rows" format="tsv"/>
        </system>
      `,
      schemaSource: `
        type Row = {
          name: string;
          count: integer;
          kind: "item";
          level: "low" | "high";
        };
        type Input = {
          rows: Row[];
        };
      `,
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [
        { definition: { text: "rows" } },
        { definition: { text: "rows" } },
      ],
    });
  });

  it("rejects format='csv' on non-array type", () => {
    const args = {
      bodyXml: '<system><insert val="input.name" format="csv"/></system>',
      schemaSource: "type Input = { name: string; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "'csv' can only be used with tabular types",
          rule: "A tabular type is an array of objects with only string or integer fields",
        },
      ],
      definitionLinks: [{ definition: { text: "name" } }],
    });
  });

  it("rejects format='tsv' on array of primitives", () => {
    const args = {
      bodyXml: '<system><insert val="input.tags" format="tsv"/></system>',
      schemaSource: "type Input = { tags: string[]; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "'tsv' can only be used with tabular types",
          rule: "A tabular type is an array of objects with only string or integer fields",
        },
      ],
      definitionLinks: [{ definition: { text: "tags" } }],
    });
  });

  it("rejects format='csv' on array of interfaces with boolean fields", () => {
    const args = {
      bodyXml: '<system><insert val="input.rows" format="csv"/></system>',
      schemaSource: `
        type Row = { name: string; active: boolean; };
        type Input = { rows: Row[]; };
      `,
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "'csv' can only be used with tabular types",
        },
      ],
      definitionLinks: [{ definition: { text: "rows" } }],
    });
  });

  it("rejects format='tsv' on array of interfaces with float number fields", () => {
    const args = {
      bodyXml: '<system><insert val="input.rows" format="tsv"/></system>',
      schemaSource: `
        type Row = { name: string; score: number; };
        type Input = { rows: Row[]; };
      `,
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "'tsv' can only be used with tabular types",
        },
      ],
      definitionLinks: [{ definition: { text: "rows" } }],
    });
  });

  it("rejects format='csv' on array of interfaces with nested interface fields", () => {
    const args = {
      bodyXml: '<system><insert val="input.rows" format="csv"/></system>',
      schemaSource: `
        type Row = { name: string; child: { id: string; }; };
        type Input = { rows: Row[]; };
      `,
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "'csv' can only be used with tabular types",
        },
      ],
      definitionLinks: [{ definition: { text: "rows" } }],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - format='json', 'yaml', 'toon'
// ---------------------------------------------------------------------------

describe("validateTemplateBody - structured formats ('json', 'yaml', 'toon')", () => {
  it("allows format='json', 'yaml', and 'toon' on complex nested types", () => {
    const args = {
      bodyXml: `
        <system>
          <insert val="input.user" format="json"/>
          <insert val="input.items" format="yaml"/>
          <insert val="input.user.active" format="toon"/>
        </system>
      `,
      schemaSource: `
        type User = {
          name: string;
          active: boolean;
          score: number;
        };
        type Input = {
          user: User;
          items: string[];
        };
      `,
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [
        { definition: { text: "user" } },
        { definition: { text: "items" } },
        { definition: { text: "user" } },
        { definition: { text: "active" } },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - <c> tags
// ---------------------------------------------------------------------------

describe("validateTemplateBody - <c> tags", () => {
  it("allows <c> tag with string literal defined in template schema", () => {
    const args = {
      bodyXml: "<system><c>active</c></system>",
      schemaSource: `
        type Status = "active" | "inactive";
        type Input = { status: Status; };
      `,
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: '"active"' } }],
    });
  });

  it("allows <c> tag with field name defined in template schema", () => {
    const args = {
      bodyXml: "<system><c>profileName</c></system>",
      schemaSource: "type Input = { profileName: string; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "profileName" } }],
    });
  });

  it("allows <c> tag matching a tool name in tools map", () => {
    const calculatorTool = makeValidatedTool(
      "calculator",
      "type Input = { expr: string; }; type Output = { result: number; };",
    );
    const args = {
      bodyXml: "<system><c>calculator</c></system>",
      schemaSource: "type Input = { text: string; };",
      tools: { calculator: calculatorTool },
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "calculator" } }],
    });
  });

  it("allows <c> tag matching a field name from a tool's schema", () => {
    const webSearchTool = makeValidatedTool(
      "webSearch",
      "type Input = { searchKeyword: string; }; type Output = { hits: integer; };",
    );
    const args = {
      bodyXml: "<system><c>searchKeyword</c></system>",
      schemaSource: "type Input = { text: string; };",
      tools: { webSearch: webSearchTool },
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "searchKeyword" } }],
    });
  });

  it("reports an error for unknown identifier in <c> tag", () => {
    const args = {
      bodyXml: "<system><c>unknownIdentifier</c></system>",
      schemaSource: "type Input = { name: string; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "Identifier 'unknownIdentifier' not found in schema",
        },
      ],
      definitionLinks: [],
    });
  });

  it("allows <c> tag with JSON matching a type in the schema", () => {
    const args = {
      bodyXml: '<system><c>{"name": "Alice"}</c></system>',
      schemaSource: "type Input = { name: string; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "name" } }],
    });
  });

  it("reports an error for <c> tag with JSON not matching any schema type", () => {
    const args = {
      bodyXml: '<system><c>{"unknownKey": 123}</c></system>',
      schemaSource: "type Input = { name: string; };",
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "Does not match any of the types defined in the schema",
        },
      ],
      definitionLinks: [],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - with ExpressionContext
// ---------------------------------------------------------------------------

describe("validateTemplateBody - with ExpressionContext (hasValContext=true)", () => {
  it("validates 'it' expression with string type from context", () => {
    const context: ExpressionContext = {
      it: {
        expression: makeExpr("input.text"),
        type: prim("string"),
      },
      typeOverrides: {},
    };
    const args = {
      bodyXml: '<system><insert val="it"/></system>',
      schemaSource: "type Input = { text: string; };",
      context,
      hasValContext: true,
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [],
    });
  });

  it("requires format for 'it' expression with number type from context", () => {
    const context: ExpressionContext = {
      it: {
        expression: makeExpr("input.score"),
        type: prim("number"),
      },
      typeOverrides: {},
    };
    const args = {
      bodyXml: '<system><insert val="it"/></system>',
      schemaSource: "type Input = { score: number; };",
      context,
      hasValContext: true,
    };
    expect(testValidateBody(args)).toMatch({
      errors: [
        {
          message: "Must specify format when type is not string or integer",
        },
      ],
      definitionLinks: [],
    });
  });

  it("validates 'it.name' property access on interface type from context", () => {
    const userInterface: ResolvedType = {
      kind: "interface",
      leftCurlyBracket: { start: 0, end: 1, path: "" },
      fields: {
        name: {
          name: { text: "name", start: 0, end: 4, path: "" },
          type: prim("string"),
          doc: "",
        },
      },
    };
    const context: ExpressionContext = {
      it: {
        expression: makeExpr("input.user"),
        type: userInterface,
      },
      typeOverrides: {},
    };
    const args = {
      bodyXml: '<system><insert val="it.name"/></system>',
      schemaSource: "type Input = { user: { name: string; }; };",
      context,
      hasValContext: true,
    };
    expect(testValidateBody(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "name" } }],
    });
  });
});

// ---------------------------------------------------------------------------
// validateToolDescription
// ---------------------------------------------------------------------------

describe("validateToolDescription", () => {
  it("validates plain text and <c> tags matching tool schema", () => {
    const args = {
      descXml: `
        <description>
          Fetches weather for <c>location</c> and returns <c>temp</c>.
        </description>
      `,
      schemaSource: `
        type Input = { location: string; };
        type Output = { temp: number; };
      `,
    };
    expect(testValidateToolDescription(args)).toMatch({
      errors: [],
      definitionLinks: [
        { definition: { text: "location" } },
        { definition: { text: "temp" } },
      ],
    });
  });

  it("reports an error for unknown identifier in <c> tag within description", () => {
    const args = {
      descXml: "<description>Calls <c>nonExistent</c>.</description>",
      schemaSource: "type Input = { location: string; }; type Output = string;",
    };
    expect(testValidateToolDescription(args)).toMatch({
      errors: [
        {
          message: "Identifier 'nonExistent' not found in schema",
        },
      ],
      definitionLinks: [],
    });
  });

  it("validates JSON within <c> tag in tool description against tool schema", () => {
    const args = {
      descXml:
        '<description>Example: <c>{"location": "Paris"}</c></description>',
      schemaSource: "type Input = { location: string; }; type Output = string;",
    };
    expect(testValidateToolDescription(args)).toMatch({
      errors: [],
      definitionLinks: [{ definition: { text: "location" } }],
    });
  });

  it("reports an error for invalid JSON within <c> tag in tool description", () => {
    const args = {
      descXml: '<description>Example: <c>{"wrongField": 123}</c></description>',
      schemaSource: "type Input = { location: string; }; type Output = string;",
    };
    expect(testValidateToolDescription(args)).toMatch({
      errors: [
        {
          message: "Does not match any of the types defined in the schema",
        },
      ],
      definitionLinks: [],
    });
  });
});
