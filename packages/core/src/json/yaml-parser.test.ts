import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { MappedText } from "../util/shared-types.js";
import { parseYaml, tokenizeYaml } from "./yaml-parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textNode(source: string, path = "test.yaml"): MappedText {
  return {
    path,
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe("parseYaml - errors", () => {
  it("rejects an empty string", () => {
    expect(parseYaml(textNode(""))).toMatch({
      kind: "error",
      errors: [{ message: "Empty YAML document" }],
    });
  });

  it("rejects a whitespace-only document", () => {
    expect(parseYaml(textNode("   \n  "))).toMatch({
      kind: "error",
      errors: [{ message: "Empty YAML document" }],
    });
  });

  it("converts a YAML parse error to InternalErrors with source positions", () => {
    // "key: {unclosed" — the flow map is never closed
    expect(parseYaml(textNode("key: {unclosed"))).toMatch({
      kind: "error",
      errors: [{ span: { start: 14, end: 15 } }],
    });
  });

  it("preserves the yaml error message", () => {
    expect(parseYaml(textNode("key: {unclosed"))).toMatch({
      kind: "error",
      errors: [{ message: /.+/ }],
    });
  });
});

// ---------------------------------------------------------------------------
// Null scalars
// ---------------------------------------------------------------------------

describe("parseYaml - null scalar", () => {
  it("parses the 'null' keyword", () => {
    expect(parseYaml(textNode("null"))).toMatch({ kind: "null" });
  });

  it("parses '~' as null", () => {
    expect(parseYaml(textNode("~"))).toMatch({ kind: "null" });
  });

  it("records the firstToken span for 'null'", () => {
    expect(parseYaml(textNode("null"))).toMatch({
      kind: "null",
      firstToken: { start: 0, end: 4 },
    });
  });

  it("records the firstToken span for '~'", () => {
    expect(parseYaml(textNode("~"))).toMatch({
      kind: "null",
      firstToken: { start: 0, end: 1 },
    });
  });
});

// ---------------------------------------------------------------------------
// Boolean scalars
// ---------------------------------------------------------------------------

describe("parseYaml - boolean scalar", () => {
  it("parses 'true'", () => {
    expect(parseYaml(textNode("true"))).toMatch({
      kind: "boolean",
      value: true,
      firstToken: { start: 0, end: 4 },
    });
  });

  it("parses 'false'", () => {
    expect(parseYaml(textNode("false"))).toMatch({
      kind: "boolean",
      value: false,
      firstToken: { start: 0, end: 5 },
    });
  });
});

// ---------------------------------------------------------------------------
// Number scalars
// ---------------------------------------------------------------------------

describe("parseYaml - number scalar", () => {
  it("parses an integer", () => {
    expect(parseYaml(textNode("42"))).toMatch({
      kind: "number",
      value: 42,
      firstToken: { start: 0, end: 2 },
    });
  });

  it("parses a negative integer", () => {
    expect(parseYaml(textNode("-7"))).toMatch({
      kind: "number",
      value: -7,
      firstToken: { start: 0, end: 2 },
    });
  });

  it("parses a float", () => {
    expect(parseYaml(textNode("3.14"))).toMatch({
      kind: "number",
      value: 3.14,
      firstToken: { start: 0, end: 4 },
    });
  });
});

// ---------------------------------------------------------------------------
// String scalars
// ---------------------------------------------------------------------------

describe("parseYaml - string scalar", () => {
  it("parses an unquoted string", () => {
    expect(parseYaml(textNode("hello"))).toMatch({
      kind: "string",
      value: "hello",
      firstToken: { start: 0, end: 5 },
      quoted: false,
    });
  });

  it("parses a double-quoted string", () => {
    expect(parseYaml(textNode('"world"'))).toMatch({
      kind: "string",
      value: "world",
      // firstToken includes the surrounding quotes
      firstToken: { start: 0, end: 7 },
      quoted: true,
    });
  });

  it("parses a single-quoted string", () => {
    expect(parseYaml(textNode("'hello'"))).toMatch({
      kind: "string",
      value: "hello",
      firstToken: { start: 0, end: 7 },
      quoted: true,
    });
  });

  it("parses a block literal scalar (pipe)", () => {
    const src = "|\n  line1\n  line2\n";
    expect(parseYaml(textNode(src))).toMatch({
      kind: "string",
      value: "line1\nline2\n",
      quoted: false,
    });
  });

  it("parses a block folded scalar (>)", () => {
    const src = ">\n  line1\n  line2\n";
    expect(parseYaml(textNode(src))).toMatch({
      kind: "string",
      value: "line1 line2\n",
      quoted: false,
    });
  });

  it("decodes escape sequences in double-quoted strings", () => {
    expect(parseYaml(textNode('"tab:\\there"'))).toMatch({
      kind: "string",
      value: "tab:\there",
    });
  });
});

// ---------------------------------------------------------------------------
// Block map
// ---------------------------------------------------------------------------

describe("parseYaml - block map", () => {
  it("parses a single-entry block map", () => {
    expect(parseYaml(textNode("x: 1"))).toMatch({
      kind: "object",
      entries: {
        x: {
          key: { kind: "string", value: "x" },
          value: { kind: "number", value: 1 },
        },
      },
    });
  });

  it("all entries are present in the dict", () => {
    expect(parseYaml(textNode("a: 1\nb: 2\nc: 3"))).toMatch({
      kind: "object",
      entries: {
        a: { key: { value: "a" } },
        b: { key: { value: "b" } },
        c: { key: { value: "c" } },
      },
    });
  });

  it("firstToken is a single char at the start of the first key", () => {
    const src = "point: 1";
    expect(parseYaml(textNode(src))).toMatch({
      kind: "object",
      firstToken: { start: 0, end: 1 },
    });
  });

  it("key firstToken spans the key text in source", () => {
    const src = "mykey: 1";
    const result = parseYaml(textNode(src));
    expect(result).toMatch({
      kind: "object",
      entries: {
        mykey: {
          key: {
            kind: "string",
            value: "mykey",
            firstToken: { start: 0, end: 5 },
          },
        },
      },
    });
  });

  it("value firstToken is offset correctly in source", () => {
    const src = "x: 42";
    // "x: " is 3 chars, "42" starts at offset 3
    expect(parseYaml(textNode(src))).toMatch({
      kind: "object",
      entries: {
        x: {
          value: {
            kind: "number",
            value: 42,
            firstToken: { start: 3, end: 5 },
          },
        },
      },
    });
  });

  it("handles an implicit null value (empty after colon)", () => {
    const src = "key:\n";
    const result = parseYaml(textNode(src));
    expect(result).toMatch({
      kind: "object",
      entries: {
        key: {
          key: { value: "key" },
          value: { kind: "null" },
        },
      },
    });
    // The implicit null must have a zero-width firstToken
    const val = (result as any).entries["key"].value;
    expect(val.firstToken.start).toMatch(val.firstToken.end);
  });

  it("handles an explicit null value", () => {
    expect(parseYaml(textNode("key: null"))).toMatch({
      kind: "object",
      entries: { key: { key: { value: "key" }, value: { kind: "null" } } },
    });
  });

  it("handles boolean values", () => {
    expect(parseYaml(textNode("active: true"))).toMatch({
      kind: "object",
      entries: { active: { value: { kind: "boolean", value: true } } },
    });
  });

  it("handles string values", () => {
    expect(parseYaml(textNode('name: "Alice"'))).toMatch({
      kind: "object",
      entries: { name: { value: { kind: "string", value: "Alice" } } },
    });
  });

  it("handles a nested block map value", () => {
    const src = "outer:\n  inner: 1";
    expect(parseYaml(textNode(src))).toMatch({
      kind: "object",
      entries: {
        outer: {
          key: { value: "outer" },
          value: {
            kind: "object",
            entries: {
              inner: {
                key: { value: "inner" },
                value: { kind: "number", value: 1 },
              },
            },
          },
        },
      },
    });
  });

  it("handles a sequence value", () => {
    expect(parseYaml(textNode("tags:\n  - a\n  - b"))).toMatch({
      kind: "object",
      entries: {
        tags: {
          key: { value: "tags" },
          value: {
            kind: "array",
            elements: [
              { kind: "string", value: "a" },
              { kind: "string", value: "b" },
            ],
          },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Flow map
// ---------------------------------------------------------------------------

describe("parseYaml - flow map", () => {
  it("parses a flow map", () => {
    expect(parseYaml(textNode("{x: 1, y: 2}"))).toMatch({
      kind: "object",
      entries: {
        x: { key: { value: "x" }, value: { kind: "number", value: 1 } },
        y: { key: { value: "y" }, value: { kind: "number", value: 2 } },
      },
    });
  });

  it("firstToken is '{'", () => {
    expect(parseYaml(textNode("{x: 1}"))).toMatch({
      kind: "object",
      firstToken: { start: 0, end: 1 },
    });
  });

  it("parses an empty flow map", () => {
    expect(parseYaml(textNode("{}"))).toMatch({ kind: "object", entries: {} });
  });

  it("key firstToken is correct inside a flow map", () => {
    // "{x: 1}" — key "x" starts at offset 1
    expect(parseYaml(textNode("{x: 1}"))).toMatch({
      entries: { x: { key: { firstToken: { start: 1, end: 2 } } } },
    });
  });
});

// ---------------------------------------------------------------------------
// Block sequence
// ---------------------------------------------------------------------------

describe("parseYaml - block sequence", () => {
  it("parses a block sequence of scalars", () => {
    expect(parseYaml(textNode("- 1\n- 2\n- 3"))).toMatch({
      kind: "array",
      elements: [
        { kind: "number", value: 1 },
        { kind: "number", value: 2 },
        { kind: "number", value: 3 },
      ],
    });
  });

  it("firstToken is '-' (the block sequence indicator)", () => {
    expect(parseYaml(textNode("- 1"))).toMatch({
      kind: "array",
      firstToken: { start: 0, end: 1 },
    });
  });

  it("parses a block sequence of objects", () => {
    expect(parseYaml(textNode("- x: 1\n- x: 2"))).toMatch({
      kind: "array",
      elements: [
        {
          kind: "object",
          entries: {
            x: { key: { value: "x" }, value: { kind: "number", value: 1 } },
          },
        },
        {
          kind: "object",
          entries: {
            x: { key: { value: "x" }, value: { kind: "number", value: 2 } },
          },
        },
      ],
    });
  });

  it("parses mixed-type elements", () => {
    expect(parseYaml(textNode("- 1\n- hello\n- true"))).toMatch({
      kind: "array",
      elements: [
        { kind: "number", value: 1 },
        { kind: "string", value: "hello" },
        { kind: "boolean", value: true },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Flow sequence
// ---------------------------------------------------------------------------

describe("parseYaml - flow sequence", () => {
  it("parses a flow sequence of numbers", () => {
    expect(parseYaml(textNode("[10, 20, 30]"))).toMatch({
      kind: "array",
      elements: [
        { kind: "number", value: 10 },
        { kind: "number", value: 20 },
        { kind: "number", value: 30 },
      ],
    });
  });

  it("firstToken is '['", () => {
    expect(parseYaml(textNode("[1, 2]"))).toMatch({
      kind: "array",
      firstToken: { start: 0, end: 1 },
    });
  });

  it("parses an empty flow sequence", () => {
    expect(parseYaml(textNode("[]"))).toMatch({ kind: "array", elements: [] });
  });

  it("element firstToken is correct inside a flow sequence", () => {
    // "[10, 20]" — first element "10" at offset 1..3, second "20" at 5..7
    expect(parseYaml(textNode("[10, 20]"))).toMatch({
      elements: [
        { firstToken: { start: 1, end: 3 } },
        { firstToken: { start: 5, end: 7 } },
      ],
    });
  });

  it("parses mixed-type elements", () => {
    expect(parseYaml(textNode('[1, true, null, "hi"]'))).toMatch({
      kind: "array",
      elements: [
        { kind: "number", value: 1 },
        { kind: "boolean", value: true },
        { kind: "null" },
        { kind: "string", value: "hi" },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Source offset remapping
// ---------------------------------------------------------------------------

describe("parseYaml - source offset remapping", () => {
  it("remaps firstToken offsets via the offsetMap", () => {
    const content: MappedText = {
      path: "test.yaml",
      text: "null",
      offsetMap: [{ textPosition: 0, sourcePosition: 20 }],
    };
    const result = parseYaml(content);
    expect(result).toMatch({
      kind: "null",
      firstToken: { start: 20, end: 24 },
    });
  });

  it("remaps error offsets via the offsetMap", () => {
    const content: MappedText = {
      path: "test.yaml",
      text: "",
      offsetMap: [{ textPosition: 0, sourcePosition: 10 }],
    };
    const result = parseYaml(content);
    expect(result).toMatch({
      kind: "error",
      errors: [
        { span: { start: 10, end: 10 }, message: "Empty YAML document" },
      ],
    });
  });
});

describe("parseYaml - span preservation", () => {
  it("preserves offsets across a full block map document", () => {
    const src = "name: Alice\nage: 30\n";
    // "name" at 0..4, value "Alice" at 6..11
    // "age" at 12..15, value "30" at 17..19
    expect(parseYaml(textNode(src))).toMatch({
      kind: "object",
      entries: {
        name: {
          key: { firstToken: { start: 0, end: 4 } },
          value: { firstToken: { start: 6, end: 11 } },
        },
        age: {
          key: { firstToken: { start: 12, end: 15 } },
          value: { firstToken: { start: 17, end: 19 } },
        },
      },
    });
  });

  it("preserves offsets inside a flow map nested in a block map", () => {
    const src = "point: {x: 1, y: 2}\n";
    // "point" at 0..5, flow map "{" at 7
    // "x" at 8..9, "1" at 11..12, "y" at 14..15, "2" at 17..18
    expect(parseYaml(textNode(src))).toMatch({
      kind: "object",
      entries: {
        point: {
          key: { firstToken: { start: 0, end: 5 } },
          value: {
            kind: "object",
            firstToken: { start: 7, end: 8 },
            entries: {
              x: {
                key: { firstToken: { start: 8, end: 9 } },
                value: { firstToken: { start: 11, end: 12 } },
              },
              y: {
                key: { firstToken: { start: 14, end: 15 } },
                value: { firstToken: { start: 17, end: 18 } },
              },
            },
          },
        },
      },
    });
  });

  it("preserves offsets inside a flow sequence nested in a block map", () => {
    const src = "nums: [10, 20]\n";
    // "nums" at 0..4, "[" at 6, "10" at 7..9, "20" at 11..13
    expect(parseYaml(textNode(src))).toMatch({
      kind: "object",
      entries: {
        nums: {
          value: {
            kind: "array",
            firstToken: { start: 6, end: 7 },
            elements: [
              { firstToken: { start: 7, end: 9 } },
              { firstToken: { start: 11, end: 13 } },
            ],
          },
        },
      },
    });
  });
});

describe("tokenizeYaml", () => {
  it("returns an empty array for empty input", () => {
    expect(tokenizeYaml(textNode(""))).toMatch([]);
  });

  it("identifies comments in various positions", () => {
    const input = [
      "# top comment",
      "model: gpt-4 # inline comment",
      "# middle comment",
      "tags:",
      "  - fast # item comment",
      "# trailing comment",
    ].join("\n");

    const tokens = tokenizeYaml(textNode(input));
    const comments = tokens.filter((t) => t.kind === "comment");
    expect(comments).toMatch([
      {
        kind: "comment",
        span: { start: 0, end: 13 },
      },
      {
        kind: "comment",
        span: { start: 27, end: 43 },
      },
      {
        kind: "comment",
        span: { start: 44, end: 60 },
      },
      {
        kind: "comment",
        span: { start: 76, end: 90 },
      },
      {
        kind: "comment",
        span: { start: 91, end: 109 },
      },
    ]);
  });

  it("identifies string literals", () => {
    const input = "double: \"hello\"\nsingle: 'world'\nplain: unquoted";
    const tokens = tokenizeYaml(textNode(input));
    expect(tokens).toMatch([
      {
        kind: "string",
        span: { start: 8, end: 15 },
      },
      {
        kind: "string",
        span: { start: 24, end: 31 },
      },
      {
        kind: "string",
        span: { start: 39, end: 47 },
      },
    ]);
  });

  it("identifies number and boolean literals", () => {
    const input = "count: 42\ntemperature: 0.7\nflag: true\ndisabled: false";
    const tokens = tokenizeYaml(textNode(input));
    expect(tokens).toMatch([
      {
        kind: "number",
        span: { start: 7, end: 9 },
      },
      {
        kind: "number",
        span: { start: 23, end: 26 },
      },
      {
        kind: "boolean",
        span: { start: 33, end: 37 },
      },
      {
        kind: "boolean",
        span: { start: 48, end: 53 },
      },
    ]);
  });

  it("identifies quoted keys as strings but ignores unquoted keys", () => {
    const input = '"quotedKey": "val"\nunquotedKey: 123';
    const tokens = tokenizeYaml(textNode(input));
    expect(tokens).toMatch([
      {
        kind: "string",
        span: { start: 0, end: 11 },
      },
      {
        kind: "string",
        span: { start: 13, end: 18 },
      },
      {
        kind: "number",
        span: { start: 32, end: 35 },
      },
    ]);
  });

  it("preserves source offsets across mapped text segments", () => {
    const mapped: MappedText = {
      path: "test.yaml",
      text: "# comment\nmodel: gpt-4",
      offsetMap: [{ textPosition: 0, sourcePosition: 200 }],
    };
    const tokens = tokenizeYaml(mapped);
    expect(tokens).toMatch([
      {
        kind: "comment",
        span: { start: 200, end: 209 },
      },
      {
        kind: "string",
        span: { start: 217, end: 222 },
      },
    ]);
  });
});
