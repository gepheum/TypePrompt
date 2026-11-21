import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { InternalError } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import { parseBody, parseToolDescription } from "./body-parser.js";

import type { Body, ToolDescription } from "./compiler-types.js";

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

function testParseBody(
  xml: string,
  options: { hasValContext: boolean } = { hasValContext: false },
): { body: Body<boolean>; errors: InternalError[] } {
  const root = parseElement(xml);
  const errors: InternalError[] = [];
  const body = parseBody(root, errors, options);
  return { body, errors };
}

function testParseToolDescription(xml: string): {
  description: ToolDescription;
  errors: InternalError[];
} {
  const root = parseElement(xml);
  const errors: InternalError[] = [];
  const description = parseToolDescription(root, errors);
  return { description, errors };
}

// ---------------------------------------------------------------------------
// parseBody - plain text, dedenting, and trimming
// ---------------------------------------------------------------------------

describe("parseBody - plain text and trimming", () => {
  it("parses single-line plain text", () => {
    expect(testParseBody("<system>Hello world</system>")).toMatch({
      body: [{ kind: "text", text: "Hello world" }],
      errors: [],
    });
  });

  it("dedents multi-line text based on first indented line and trims outer newlines", () => {
    const input = ["<system>", "  Line 1", "  Line 2", "</system>"].join("\n");

    expect(testParseBody(input)).toMatch({
      body: [{ kind: "text", text: "Line 1\nLine 2" }],
      errors: [],
    });
  });

  it("preserves empty and whitespace-only lines within multi-line text", () => {
    const input = [
      "<system>",
      "  Line 1",
      "",
      "    ",
      "  Line 2",
      "</system>",
    ].join("\n");

    expect(testParseBody(input)).toMatch({
      body: [{ kind: "text", text: "Line 1\n\n\nLine 2" }],
      errors: [],
    });
  });

  it("does not dedent when the first line starts immediately after the opening tag", () => {
    expect(testParseBody("<system>Line 1\n  Line 2</system>")).toMatch({
      body: [{ kind: "text", text: "Line 1\n  Line 2" }],
      errors: [],
    });
  });

  it("returns an empty body for an empty element", () => {
    expect(testParseBody("<system></system>")).toMatch({
      body: [],
      errors: [],
    });
  });

  it("returns an empty body for a self-closing element", () => {
    expect(testParseBody("<system/>")).toMatch({
      body: [],
      errors: [],
    });
  });

  it("returns an empty body for whitespace-only content", () => {
    expect(testParseBody("<system>   \n   \n   </system>")).toMatch({
      body: [],
      errors: [],
    });
  });
});

// ---------------------------------------------------------------------------
// parseBody - <insert val="..." />
// ---------------------------------------------------------------------------

describe("parseBody - <insert val='...' />", () => {
  it("parses a basic val expression without format", () => {
    expect(
      testParseBody('<system><insert val="input.user.name"/></system>'),
    ).toMatch({
      body: [
        {
          kind: "insert-val",
          val: {
            kind: "property",
            property: { text: "name" },
            left: {
              kind: "property",
              property: { text: "user" },
              left: { kind: "input" },
            },
          },
          format: null,
          indent: "",
        },
      ],
      errors: [],
    });
  });

  it("parses insert val with format='json'", () => {
    expect(
      testParseBody(
        '<system><insert val="input.user" format="json"/></system>',
      ),
    ).toMatch({
      body: [
        {
          kind: "insert-val",
          val: {
            kind: "property",
            property: { text: "user" },
            left: { kind: "input" },
          },
          format: { text: "json" },
          indent: "",
        },
      ],
      errors: [],
    });
  });

  it("parses insert val with format='yaml'", () => {
    expect(
      testParseBody(
        '<system><insert val="input.user" format="yaml"/></system>',
      ),
    ).toMatch({
      body: [
        {
          kind: "insert-val",
          format: { text: "yaml" },
        },
      ],
      errors: [],
    });
  });

  it("parses insert val with format='toon'", () => {
    expect(
      testParseBody(
        '<system><insert val="input.user" format="toon"/></system>',
      ),
    ).toMatch({
      body: [
        {
          kind: "insert-val",
          format: { text: "toon" },
        },
      ],
      errors: [],
    });
  });

  it("parses insert val with format='csv'", () => {
    expect(
      testParseBody('<system><insert val="input.user" format="csv"/></system>'),
    ).toMatch({
      body: [
        {
          kind: "insert-val",
          format: { text: "csv" },
        },
      ],
      errors: [],
    });
  });

  it("parses insert val with format='tsv'", () => {
    expect(
      testParseBody('<system><insert val="input.user" format="tsv"/></system>'),
    ).toMatch({
      body: [
        {
          kind: "insert-val",
          format: { text: "tsv" },
        },
      ],
      errors: [],
    });
  });

  it("parses insert val with format='text'", () => {
    expect(
      testParseBody(
        '<system><insert val="input.user" format="text"/></system>',
      ),
    ).toMatch({
      body: [
        {
          kind: "insert-val",
          format: { text: "text" },
        },
      ],
      errors: [],
    });
  });

  it("reports an error for an invalid format attribute", () => {
    expect(
      testParseBody('<system><insert val="input.user" format="xml"/></system>'),
    ).toMatch({
      body: [],
      errors: [
        {
          message:
            "Invalid value for attribute 'format': expected one of: 'text', 'json', 'yaml', 'toon', 'csv', 'tsv'",
        },
      ],
    });
  });

  it("reports an error for unexpected attributes on insert val", () => {
    expect(
      testParseBody('<system><insert val="input.user" extra="bad"/></system>'),
    ).toMatch({
      body: [],
      errors: [
        {
          message: "Unexpected attribute 'extra'",
        },
      ],
    });
  });

  it("reports missing val attribute when neither snippet nor val is provided", () => {
    expect(testParseBody("<system><insert/></system>")).toMatch({
      body: [],
      errors: [
        {
          message: "Missing required attribute 'val'",
        },
      ],
    });
  });

  it("reports syntax errors from invalid val expressions", () => {
    expect(
      testParseBody('<system><insert val="input.foo."/></system>'),
    ).toMatch({
      body: [],
      errors: [
        {
          message: "Expected: camelCase identifier",
        },
      ],
    });
  });

  it("rejects 'it' identifier when hasValContext is false", () => {
    expect(
      testParseBody('<system><insert val="it.name"/></system>', {
        hasValContext: false,
      }),
    ).toMatch({
      body: [],
      errors: [
        {
          message: '"it" not allowed here',
        },
      ],
    });
  });

  it("allows 'it' identifier when hasValContext is true", () => {
    expect(
      testParseBody('<system><insert val="it.name"/></system>', {
        hasValContext: true,
      }),
    ).toMatch({
      body: [
        {
          kind: "insert-val",
          val: {
            kind: "property",
            property: { text: "name" },
            left: { kind: "it" },
          },
          format: null,
          indent: "",
        },
      ],
      errors: [],
    });
  });
});

// ---------------------------------------------------------------------------
// parseBody - <insert snippet="..." />
// ---------------------------------------------------------------------------

describe("parseBody - <insert snippet='...' />", () => {
  it("parses a valid camelCase snippet name", () => {
    expect(
      testParseBody('<system><insert snippet="userSnippet"/></system>'),
    ).toMatch({
      body: [
        {
          kind: "insert-snippet",
          snippet: { text: "userSnippet" },
          indent: "",
        },
      ],
      errors: [],
    });
  });

  it("parses a single-letter snippet name", () => {
    expect(testParseBody('<system><insert snippet="s"/></system>')).toMatch({
      body: [
        {
          kind: "insert-snippet",
          snippet: { text: "s" },
          indent: "",
        },
      ],
      errors: [],
    });
  });

  it("parses an alphanumeric camelCase snippet name with digits", () => {
    expect(
      testParseBody('<system><insert snippet="item123Value"/></system>'),
    ).toMatch({
      body: [
        {
          kind: "insert-snippet",
          snippet: { text: "item123Value" },
          indent: "",
        },
      ],
      errors: [],
    });
  });

  it("rejects PascalCase snippet names", () => {
    expect(
      testParseBody('<system><insert snippet="UserSnippet"/></system>'),
    ).toMatch({
      body: [{ kind: "insert-snippet" }],
      errors: [
        {
          message:
            "Invalid value for attribute 'snippet': expected a camelCase identifier",
        },
      ],
    });
  });

  it("rejects kebab-case snippet names", () => {
    expect(
      testParseBody('<system><insert snippet="user-snippet"/></system>'),
    ).toMatch({
      body: [{ kind: "insert-snippet" }],
      errors: [
        {
          message:
            "Invalid value for attribute 'snippet': expected a camelCase identifier",
        },
      ],
    });
  });

  it("rejects snake_case snippet names", () => {
    expect(
      testParseBody('<system><insert snippet="user_snippet"/></system>'),
    ).toMatch({
      body: [{ kind: "insert-snippet" }],
      errors: [
        {
          message:
            "Invalid value for attribute 'snippet': expected a camelCase identifier",
        },
      ],
    });
  });

  it("rejects snippet names starting with a digit", () => {
    expect(
      testParseBody('<system><insert snippet="1snippet"/></system>'),
    ).toMatch({
      body: [{ kind: "insert-snippet" }],
      errors: [
        {
          message:
            "Invalid value for attribute 'snippet': expected a camelCase identifier",
        },
      ],
    });
  });

  it("reports unexpected attributes on insert snippet", () => {
    expect(
      testParseBody(
        '<system><insert snippet="mySnippet" extra="bad"/></system>',
      ),
    ).toMatch({
      body: [{ kind: "insert-snippet" }],
      errors: [
        {
          message: "Unexpected attribute 'extra'",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseBody - <insert schema="..." format="..." />
// ---------------------------------------------------------------------------

describe("parseBody - <insert schema='...' format='...' />", () => {
  it("parses a valid PascalCase schema name with format='typescript'", () => {
    expect(
      testParseBody(
        '<system><insert schema="Output" format="typescript"/></system>',
      ),
    ).toMatch({
      body: [
        {
          kind: "insert-schema",
          schema: { text: "Output" },
          indent: "",
        },
      ],
      errors: [],
    });
  });

  it("tracks indentation for insert schema", () => {
    const input = [
      "<system>",
      "  Schema:",
      '    Label: <insert schema="Output" format="typescript"/>',
      "</system>",
    ].join("\n");

    expect(testParseBody(input)).toMatch({
      body: [
        { kind: "text", text: "Schema:\n  Label: " },
        {
          kind: "insert-schema",
          schema: { text: "Output" },
          indent: "  ",
        },
      ],
      errors: [],
    });
  });

  it("rejects missing format attribute", () => {
    expect(testParseBody('<system><insert schema="Output"/></system>')).toMatch(
      {
        body: [],
        errors: [
          {
            message: "Missing required attribute 'format'",
          },
        ],
      },
    );
  });

  it("rejects invalid format attribute", () => {
    expect(
      testParseBody('<system><insert schema="Output" format="json"/></system>'),
    ).toMatch({
      body: [],
      errors: [
        {
          message:
            "Invalid value for attribute 'format': expected one of: 'typescript'",
        },
      ],
    });
  });

  it("reports unexpected attributes on insert schema", () => {
    expect(
      testParseBody(
        '<system><insert schema="Output" format="typescript" extra="bad"/></system>',
      ),
    ).toMatch({
      body: [{ kind: "insert-schema" }],
      errors: [
        {
          message: "Unexpected attribute 'extra'",
        },
      ],
    });
  });

  it("rejects both schema and val on insert", () => {
    expect(
      testParseBody(
        '<system><insert schema="Output" format="typescript" val="input.foo"/></system>',
      ),
    ).toMatch({
      body: [{ kind: "insert-schema" }],
      errors: [
        {
          message: "Unexpected attribute 'val'",
        },
      ],
    });
  });

  it("rejects both schema and snippet on insert", () => {
    expect(
      testParseBody(
        '<system><insert snippet="mySnippet" schema="Output" format="typescript"/></system>',
      ),
    ).toMatch({
      body: [{ kind: "insert-snippet" }],
      errors: [
        {
          message: "Unexpected attribute 'schema'",
        },
        {
          message: "Unexpected attribute 'format'",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseBody - indentation tracking for inserts
// ---------------------------------------------------------------------------

describe("parseBody - indentation tracking for inserts", () => {
  it("tracks column indent on an indented line after dedenting", () => {
    const input = [
      "<system>",
      "  Prefix:",
      '    Label: <insert val="input.child"/>',
      "</system>",
    ].join("\n");

    expect(testParseBody(input)).toMatch({
      body: [
        { kind: "text", text: "Prefix:\n  Label: " },
        {
          kind: "insert-val",
          val: {
            kind: "property",
            property: { text: "child" },
            left: { kind: "input" },
          },
          indent: "  ",
        },
      ],
      errors: [],
    });
  });

  it("assigns empty indent to an insert placed after non-whitespace text on the same line", () => {
    const input = [
      "<system>",
      '  Prefix: <insert snippet="mySnippet"/>',
      "</system>",
    ].join("\n");

    expect(testParseBody(input)).toMatch({
      body: [
        { kind: "text", text: "Prefix: " },
        {
          kind: "insert-snippet",
          snippet: { text: "mySnippet" },
          indent: "",
        },
      ],
      errors: [],
    });
  });

  it("tracks column indent for multiple inserts across lines", () => {
    const input = [
      "<system>",
      "  Root:",
      '    - First: <insert val="input.first"/>',
      '      Second: <insert val="input.second"/>',
      "</system>",
    ].join("\n");

    expect(testParseBody(input)).toMatch({
      body: [
        { kind: "text", text: "Root:\n  - First: " },
        {
          kind: "insert-val",
          val: {
            kind: "property",
            property: { text: "first" },
            left: { kind: "input" },
          },
          indent: "  ",
        },
        { kind: "text", text: "\n    Second: " },
        {
          kind: "insert-val",
          val: {
            kind: "property",
            property: { text: "second" },
            left: { kind: "input" },
          },
          indent: "    ",
        },
      ],
      errors: [],
    });
  });
});

// ---------------------------------------------------------------------------
// parseBody - <c> tags
// ---------------------------------------------------------------------------

describe("parseBody - <c> tags", () => {
  it("parses an unquoted identifier inside <c>", () => {
    expect(testParseBody("<system><c>userProfile</c></system>")).toMatch({
      body: [
        {
          kind: "c-tag",
          text: "userProfile",
          cTag: {
            kind: "identifier",
            identifier: { text: "userProfile" },
          },
        },
      ],
      errors: [],
    });
  });

  it("parses a quoted string inside <c>", () => {
    expect(testParseBody('<system><c>"validId"</c></system>')).toMatch({
      body: [
        {
          kind: "c-tag",
          text: '"validId"',
          cTag: {
            kind: "identifier",
            identifier: { text: "validId" },
          },
        },
      ],
      errors: [],
    });
  });

  it("reports an error when <c> contains XML attributes", () => {
    expect(testParseBody('<system><c lang="ts">code</c></system>')).toMatch({
      body: [
        {
          kind: "c-tag",
          text: "code",
        },
      ],
      errors: [
        {
          message: "Unexpected attribute 'lang'",
        },
      ],
    });
  });

  it("reports an error when <c> contains child XML elements", () => {
    expect(
      testParseBody('<system><c>code <insert val="input.x"/></c></system>'),
    ).toMatch({
      body: [],
      errors: [
        {
          message: "Unexpected element <insert>",
        },
      ],
    });
  });

  it("reports an error when <c> contains invalid CTag content", () => {
    expect(testParseBody("<system><c>12.34.56</c></system>")).toMatch({
      body: [],
      errors: [
        {
          message: "Unexpected trailing content after JSON value",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseBody - <enclosed tag="..." />
// ---------------------------------------------------------------------------

describe("parseBody - <enclosed tag='...'>", () => {
  it("wraps child content in synthetic open and close tags", () => {
    expect(
      testParseBody(
        '<system><enclosed tag="context">Content inside</enclosed></system>',
      ),
    ).toMatch({
      body: [
        { kind: "text", text: "<context>" },
        { kind: "text", text: "Content inside" },
        { kind: "text", text: "</context>" },
      ],
      errors: [],
    });
  });

  it("supports nested <enclosed> tags", () => {
    expect(
      testParseBody(
        '<system><enclosed tag="outer"><enclosed tag="inner">nested</enclosed></enclosed></system>',
      ),
    ).toMatch({
      body: [
        { kind: "text", text: "<outer>" },
        { kind: "text", text: "<inner>" },
        { kind: "text", text: "nested" },
        { kind: "text", text: "</inner>" },
        { kind: "text", text: "</outer>" },
      ],
      errors: [],
    });
  });

  it("supports child <insert> and <c> elements inside <enclosed>", () => {
    expect(
      testParseBody(
        '<system><enclosed tag="data"><insert val="input.x"/><c>Code</c></enclosed></system>',
      ),
    ).toMatch({
      body: [
        { kind: "text", text: "<data>" },
        {
          kind: "insert-val",
          val: {
            kind: "property",
            property: { text: "x" },
            left: { kind: "input" },
          },
          indent: "",
        },
        {
          kind: "c-tag",
          text: "Code",
          cTag: {
            kind: "identifier",
            identifier: { text: "Code" },
          },
        },
        { kind: "text", text: "</data>" },
      ],
      errors: [],
    });
  });

  it("reports an error when tag attribute is missing on <enclosed>", () => {
    expect(
      testParseBody("<system><enclosed>hello</enclosed></system>"),
    ).toMatch({
      body: [],
      errors: [
        {
          message: "Missing required attribute 'tag'",
        },
      ],
    });
  });

  it("reports an error for an invalid XML tag name in <enclosed>", () => {
    expect(
      testParseBody(
        '<system><enclosed tag="123invalid">hello</enclosed></system>',
      ),
    ).toMatch({
      body: [{ kind: "text" }, { kind: "text" }, { kind: "text" }],
      errors: [
        {
          message:
            "Invalid value for attribute 'tag': expected a valid XML tag name",
        },
      ],
    });
  });

  it("reports an error for unexpected attributes on <enclosed>", () => {
    expect(
      testParseBody(
        '<system><enclosed tag="valid" extra="bad">hello</enclosed></system>',
      ),
    ).toMatch({
      body: [{ kind: "text" }, { kind: "text" }, { kind: "text" }],
      errors: [
        {
          message: "Unexpected attribute 'extra'",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseBody - unexpected child elements
// ---------------------------------------------------------------------------

describe("parseBody - unexpected child elements", () => {
  it("reports an error for unknown child elements with suggestions", () => {
    expect(
      testParseBody("<system><badElement>some text</badElement></system>"),
    ).toMatch({
      body: [],
      errors: [
        {
          message: "Unexpected element <badElement>",
          suggestions: ["c", "enclosed", "insert"],
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseBody - indentation errors
// ---------------------------------------------------------------------------

describe("parseBody - indentation errors", () => {
  it("reports an indentation error when a line has less indentation than base indent", () => {
    const input = ["<system>", "    Line 1", "  Line 2", "</system>"].join(
      "\n",
    );

    expect(testParseBody(input)).toMatch({
      body: [{ kind: "text", text: "Line 1\n  Line 2" }],
      errors: [
        {
          message: "Indentation error; expected: '    '",
        },
      ],
    });
  });

  it("formats tab indentation correctly in error message", () => {
    const input = ["<system>", "\tLine 1", "  Line 2", "</system>"].join("\n");

    expect(testParseBody(input)).toMatch({
      body: [{ kind: "text", text: "Line 1\n  Line 2" }],
      errors: [
        {
          message: "Indentation error; expected: '\\t'",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseToolDescription
// ---------------------------------------------------------------------------

describe("parseToolDescription", () => {
  it("parses a single-line tool description", () => {
    expect(
      testParseToolDescription(
        "<description>Fetches weather for a location.</description>",
      ),
    ).toMatch({
      description: [{ kind: "text", text: "Fetches weather for a location." }],
      errors: [],
    });
  });

  it("parses a tool description with <c> tags", () => {
    expect(
      testParseToolDescription(
        "<description>Returns <c>WeatherData</c> info.</description>",
      ),
    ).toMatch({
      description: [
        { kind: "text", text: "Returns " },
        {
          kind: "c-tag",
          text: "WeatherData",
          cTag: {
            kind: "identifier",
            identifier: { text: "WeatherData" },
          },
        },
        { kind: "text", text: " info." },
      ],
      errors: [],
    });
  });

  it("dedents a multi-line tool description", () => {
    const input = [
      "<description>",
      "  Line 1",
      "  Line 2",
      "</description>",
    ].join("\n");

    expect(testParseToolDescription(input)).toMatch({
      description: [{ kind: "text", text: "Line 1\nLine 2" }],
      errors: [],
    });
  });

  it("rejects <insert> elements in tool descriptions and suggests <c>", () => {
    expect(
      testParseToolDescription(
        '<description>Tool with <insert val="input.param"/></description>',
      ),
    ).toMatch({
      description: [{ kind: "text", text: "Tool with " }],
      errors: [
        {
          message: "Unexpected element <insert>",
          suggestions: ["c"],
        },
      ],
    });
  });

  it("rejects <enclosed> elements in tool descriptions and suggests <c>", () => {
    expect(
      testParseToolDescription(
        '<description><enclosed tag="box">Text</enclosed></description>',
      ),
    ).toMatch({
      description: [],
      errors: [
        {
          message: "Unexpected element <enclosed>",
          suggestions: ["c"],
        },
      ],
    });
  });

  it("rejects unknown child elements in tool descriptions", () => {
    expect(
      testParseToolDescription(
        "<description><custom>Text</custom></description>",
      ),
    ).toMatch({
      description: [],
      errors: [
        {
          message: "Unexpected element <custom>",
          suggestions: ["c"],
        },
      ],
    });
  });
});
