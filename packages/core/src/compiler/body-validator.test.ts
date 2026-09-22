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
import type { InternalError, MappedText } from "../util/shared-types.js";
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

function parseElement(xml: string): ElementNode {
  const result = parseXmlDocument(xml);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

function parseSchemaOrThrow(source: string): Schema {
  const node: MappedText = {
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const parsed = parseSchema(node);
  if (parsed.kind !== "success") throw new Error("parseSchema failed");
  const validated = validateSchema(parsed, {
    kind: "namespace",
  });
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
    kind: "success",
    name: { text: name, start: 0, end: name.length },
    namespace: null,
    description: [],
    schema: { kind: "success", typeDeclarations: {}, sourcePosition: 0 },
    warnings: [],
  };
  return {
    tool: {
      kind: "tool",
      tool,
      schema,
    },
  };
}

function testValidateBody(args: {
  readonly bodyXml: string;
  readonly schemaSource: string;
  readonly tools?: { readonly [name: string]: TemplateTool };
  readonly context?: ExpressionContext | null;
  readonly hasValContext?: boolean;
}): { errors: readonly InternalError[] } {
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
  const errors = validateTemplateBody(
    body,
    schema,
    args.tools ?? {},
    (args.context ?? null) as any,
  );
  return { errors };
}

function testValidateToolDescription(args: {
  readonly descXml: string;
  readonly schemaSource: string;
}): { errors: readonly InternalError[] } {
  const root = parseElement(args.descXml);
  const parseErrors: InternalError[] = [];
  const description = parseToolDescription(root, parseErrors);
  if (parseErrors.length > 0) {
    throw new Error(
      `parseToolDescription failed: ${parseErrors.map((e) => e.message).join(", ")}`,
    );
  }
  const toolSchema = parseSchemaOrThrow(args.schemaSource);
  const errors = validateToolDescription({
    description,
    toolSchema,
  });
  return { errors };
}

function textNode(source: string): MappedText {
  return { text: source, offsetMap: [{ textPosition: 0, sourcePosition: 0 }] };
}

function makeExpr(path: string): Expression<false> {
  const r = parseExpression(textNode(path), { hasValContext: false });
  if (r.kind !== "success") throw new Error(`parseExpression failed: ${path}`);
  return r.expression;
}

function prim(
  text: "string" | "number" | "boolean" | "integer",
): PrimitiveType {
  return { kind: "primitive", primitive: { text, start: 0, end: text.length } };
}

// ---------------------------------------------------------------------------
// validateTemplateBody - plain text and skipped pieces
// ---------------------------------------------------------------------------

describe("validateTemplateBody - plain text and snippet references", () => {
  it("returns no errors for plain text body", () => {
    expect(
      testValidateBody({
        bodyXml: "<system>Hello world</system>",
        schemaSource: "type Input = string;",
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("skips insert snippet elements without errors", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert snippet="mySnippet"/></system>',
        schemaSource: "type Input = string;",
      }),
    ).toMatch({
      errors: [],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - <insert val="..."> implicit format
// ---------------------------------------------------------------------------

describe("validateTemplateBody - insert val with implicit format", () => {
  it("allows string primitive without format", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.name"/></system>',
        schemaSource: "type Input = { name: string; };",
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("allows integer primitive without format", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.count"/></system>',
        schemaSource: "type Input = { count: integer; };",
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("allows string literal without format", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.status"/></system>',
        schemaSource: 'type Input = { status: "ready"; };',
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("allows string union without format", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.role"/></system>',
        schemaSource: 'type Input = { role: "admin" | "user"; };',
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("requires format for float number primitive", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.score"/></system>',
        schemaSource: "type Input = { score: number; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "Must specify format when type is not string or integer",
          hint: "Add a format attribute, for example format='json'",
        },
      ],
    });
  });

  it("requires format for boolean primitive", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.active"/></system>',
        schemaSource: "type Input = { active: boolean; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "Must specify format when type is not string or integer",
        },
      ],
    });
  });

  it("requires format for interface type", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.user"/></system>',
        schemaSource: "type Input = { user: { name: string; }; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "Must specify format when type is not string or integer",
        },
      ],
    });
  });

  it("requires format for array type", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.items"/></system>',
        schemaSource: "type Input = { items: string[]; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "Must specify format when type is not string or integer",
        },
      ],
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

    expect(
      testValidateBody({
        bodyXml: '<system><insert val="it"/></system>',
        schemaSource: "type Input = { opt?: string; };",
        context,
        hasValContext: true,
      }),
    ).toMatch({
      errors: [
        {
          message: "Always null",
        },
      ],
    });
  });

  it("reports an error when expression resolves to optional", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.email"/></system>',
        schemaSource: "type Input = { email?: string; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "May be null",
        },
      ],
    });
  });

  it("propagates expression resolution errors for unknown fields", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.missing"/></system>',
        schemaSource: "type Input = { name: string; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "Field 'missing' not found in interface",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - format='text'
// ---------------------------------------------------------------------------

describe("validateTemplateBody - format='text'", () => {
  it("allows format='text' on string primitive", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.text" format="text"/></system>',
        schemaSource: "type Input = { text: string; };",
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("allows format='text' on integer primitive", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.count" format="text"/></system>',
        schemaSource: "type Input = { count: integer; };",
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("allows format='text' on string literal", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.status" format="text"/></system>',
        schemaSource: 'type Input = { status: "pending"; };',
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("allows format='text' on string union", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.mode" format="text"/></system>',
        schemaSource: 'type Input = { mode: "fast" | "slow"; };',
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("rejects format='text' on float number primitive", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.score" format="text"/></system>',
        schemaSource: "type Input = { score: number; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "'text' can only be used with string and integer types",
        },
      ],
    });
  });

  it("rejects format='text' on boolean primitive", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.flag" format="text"/></system>',
        schemaSource: "type Input = { flag: boolean; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "'text' can only be used with string and integer types",
        },
      ],
    });
  });

  it("rejects format='text' on interface type", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.user" format="text"/></system>',
        schemaSource: "type Input = { user: { id: string; }; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "'text' can only be used with string and integer types",
        },
      ],
    });
  });

  it("rejects format='text' on array type", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.tags" format="text"/></system>',
        schemaSource: "type Input = { tags: string[]; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "'text' can only be used with string and integer types",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - format='csv' and format='tsv'
// ---------------------------------------------------------------------------

describe("validateTemplateBody - format='csv' and format='tsv'", () => {
  it("allows format='csv' and format='tsv' on tabular array of interfaces", () => {
    expect(
      testValidateBody({
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
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("rejects format='csv' on non-array type", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.name" format="csv"/></system>',
        schemaSource: "type Input = { name: string; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "'csv' can only be used with tabular types",
          rule: "A tabular type is an array of objects with only string or integer fields",
        },
      ],
    });
  });

  it("rejects format='tsv' on array of primitives", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.tags" format="tsv"/></system>',
        schemaSource: "type Input = { tags: string[]; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "'tsv' can only be used with tabular types",
          rule: "A tabular type is an array of objects with only string or integer fields",
        },
      ],
    });
  });

  it("rejects format='csv' on array of interfaces with boolean fields", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.rows" format="csv"/></system>',
        schemaSource: `
          type Row = { name: string; active: boolean; };
          type Input = { rows: Row[]; };
        `,
      }),
    ).toMatch({
      errors: [
        {
          message: "'csv' can only be used with tabular types",
        },
      ],
    });
  });

  it("rejects format='tsv' on array of interfaces with float number fields", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.rows" format="tsv"/></system>',
        schemaSource: `
          type Row = { name: string; score: number; };
          type Input = { rows: Row[]; };
        `,
      }),
    ).toMatch({
      errors: [
        {
          message: "'tsv' can only be used with tabular types",
        },
      ],
    });
  });

  it("rejects format='csv' on array of interfaces with nested interface fields", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><insert val="input.rows" format="csv"/></system>',
        schemaSource: `
          type Row = { name: string; child: { id: string; }; };
          type Input = { rows: Row[]; };
        `,
      }),
    ).toMatch({
      errors: [
        {
          message: "'csv' can only be used with tabular types",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - format='json', 'yaml', 'toon'
// ---------------------------------------------------------------------------

describe("validateTemplateBody - structured formats ('json', 'yaml', 'toon')", () => {
  it("allows format='json', 'yaml', and 'toon' on complex nested types", () => {
    expect(
      testValidateBody({
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
      }),
    ).toMatch({
      errors: [],
    });
  });
});

// ---------------------------------------------------------------------------
// validateTemplateBody - <c> tags
// ---------------------------------------------------------------------------

describe("validateTemplateBody - <c> tags", () => {
  it("allows <c> tag with string literal defined in template schema", () => {
    expect(
      testValidateBody({
        bodyXml: "<system><c>active</c></system>",
        schemaSource: `
          type Status = "active" | "inactive";
          type Input = { status: Status; };
        `,
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("allows <c> tag with field name defined in template schema", () => {
    expect(
      testValidateBody({
        bodyXml: "<system><c>profileName</c></system>",
        schemaSource: "type Input = { profileName: string; };",
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("allows <c> tag matching a tool name in tools map", () => {
    const calculatorTool = makeValidatedTool(
      "calculator",
      "type Input = { expr: string; }; type Output = { result: number; };",
    );

    expect(
      testValidateBody({
        bodyXml: "<system><c>calculator</c></system>",
        schemaSource: "type Input = { text: string; };",
        tools: { calculator: calculatorTool },
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("allows <c> tag matching a field name from a tool's schema", () => {
    const webSearchTool = makeValidatedTool(
      "webSearch",
      "type Input = { searchKeyword: string; }; type Output = { hits: integer; };",
    );

    expect(
      testValidateBody({
        bodyXml: "<system><c>searchKeyword</c></system>",
        schemaSource: "type Input = { text: string; };",
        tools: { webSearch: webSearchTool },
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("reports an error for unknown identifier in <c> tag", () => {
    expect(
      testValidateBody({
        bodyXml: "<system><c>unknownIdentifier</c></system>",
        schemaSource: "type Input = { name: string; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "Identifier 'unknownIdentifier' not found in schema",
        },
      ],
    });
  });

  it("allows <c> tag with JSON matching a type in the schema", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><c>{"name": "Alice"}</c></system>',
        schemaSource: "type Input = { name: string; };",
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("reports an error for <c> tag with JSON not matching any schema type", () => {
    expect(
      testValidateBody({
        bodyXml: '<system><c>{"unknownKey": 123}</c></system>',
        schemaSource: "type Input = { name: string; };",
      }),
    ).toMatch({
      errors: [
        {
          message: "Does not match any of the types defined in the schema",
        },
      ],
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

    expect(
      testValidateBody({
        bodyXml: '<system><insert val="it"/></system>',
        schemaSource: "type Input = { text: string; };",
        context,
        hasValContext: true,
      }),
    ).toMatch({
      errors: [],
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

    expect(
      testValidateBody({
        bodyXml: '<system><insert val="it"/></system>',
        schemaSource: "type Input = { score: number; };",
        context,
        hasValContext: true,
      }),
    ).toMatch({
      errors: [
        {
          message: "Must specify format when type is not string or integer",
        },
      ],
    });
  });

  it("validates 'it.name' property access on interface type from context", () => {
    const userInterface: ResolvedType = {
      kind: "interface",
      leftCurlyBracket: { start: 0, end: 1 },
      fields: {
        name: {
          name: { text: "name", start: 0, end: 4 },
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

    expect(
      testValidateBody({
        bodyXml: '<system><insert val="it.name"/></system>',
        schemaSource: "type Input = { user: { name: string; }; };",
        context,
        hasValContext: true,
      }),
    ).toMatch({
      errors: [],
    });
  });
});

// ---------------------------------------------------------------------------
// validateToolDescription
// ---------------------------------------------------------------------------

describe("validateToolDescription", () => {
  it("validates plain text and <c> tags matching tool schema", () => {
    expect(
      testValidateToolDescription({
        descXml: `
          <description>
            Fetches weather for <c>location</c> and returns <c>temp</c>.
          </description>
        `,
        schemaSource: `
          type Input = { location: string; };
          type Output = { temp: number; };
        `,
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("reports an error for unknown identifier in <c> tag within description", () => {
    expect(
      testValidateToolDescription({
        descXml: "<description>Calls <c>nonExistent</c>.</description>",
        schemaSource:
          "type Input = { location: string; }; type Output = string;",
      }),
    ).toMatch({
      errors: [
        {
          message: "Identifier 'nonExistent' not found in schema",
        },
      ],
    });
  });

  it("validates JSON within <c> tag in tool description against tool schema", () => {
    expect(
      testValidateToolDescription({
        descXml:
          '<description>Example: <c>{"location": "Paris"}</c></description>',
        schemaSource:
          "type Input = { location: string; }; type Output = string;",
      }),
    ).toMatch({
      errors: [],
    });
  });

  it("reports an error for invalid JSON within <c> tag in tool description", () => {
    expect(
      testValidateToolDescription({
        descXml:
          '<description>Example: <c>{"wrongField": 123}</c></description>',
        schemaSource:
          "type Input = { location: string; }; type Output = string;",
      }),
    ).toMatch({
      errors: [
        {
          message: "Does not match any of the types defined in the schema",
        },
      ],
    });
  });
});
