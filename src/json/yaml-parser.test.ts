import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { JsonValue } from "./json-types.js";
import { parseYaml } from "./yaml-parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOk(source: string): JsonValue<"strict"> {
  const result = parseYaml(source);
  if (result.kind === "error") {
    throw new Error(
      `Expected success but got errors: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result;
}

function parseErr(source: string) {
  const result = parseYaml(source);
  if (result.kind !== "error") {
    throw new Error(`Expected error but got: ${JSON.stringify(result)}`);
  }
  return result.errors as { message: string; start: number; end: number }[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe("parseYaml – errors", () => {
  it("rejects an empty string", () => {
    expect(parseErr("")).toMatch([{ message: "Empty YAML document" }]);
  });

  it("rejects a whitespace-only document", () => {
    expect(parseErr("   \n  ")).toMatch([{ message: "Empty YAML document" }]);
  });

  it("converts a YAML parse error to InternalErrors with source positions", () => {
    // "key: {unclosed" — the flow map is never closed
    const errs = parseErr("key: {unclosed");
    expect(errs.length).toMatch(1);
    expect(errs[0]!.start).toMatch(14);
    expect(errs[0]!.end).toMatch(15);
  });

  it("preserves the yaml error message", () => {
    const errs = parseErr("key: {unclosed");
    expect(errs[0]!.message.length > 0).toMatch(true);
  });
});

// ---------------------------------------------------------------------------
// Null scalars
// ---------------------------------------------------------------------------

describe("parseYaml – null scalar", () => {
  it("parses the 'null' keyword", () => {
    expect(parseOk("null")).toMatch({ kind: "null" });
  });

  it("parses '~' as null", () => {
    expect(parseOk("~")).toMatch({ kind: "null" });
  });

  it("records the firstToken span for 'null'", () => {
    expect(parseOk("null")).toMatch({
      kind: "null",
      firstToken: { text: "null", start: 0, end: 4 },
    });
  });

  it("records the firstToken span for '~'", () => {
    expect(parseOk("~")).toMatch({
      kind: "null",
      firstToken: { text: "~", start: 0, end: 1 },
    });
  });
});

// ---------------------------------------------------------------------------
// Boolean scalars
// ---------------------------------------------------------------------------

describe("parseYaml – boolean scalar", () => {
  it("parses 'true'", () => {
    expect(parseOk("true")).toMatch({
      kind: "boolean",
      value: true,
      firstToken: { text: "true", start: 0, end: 4 },
    });
  });

  it("parses 'false'", () => {
    expect(parseOk("false")).toMatch({
      kind: "boolean",
      value: false,
      firstToken: { text: "false", start: 0, end: 5 },
    });
  });
});

// ---------------------------------------------------------------------------
// Number scalars
// ---------------------------------------------------------------------------

describe("parseYaml – number scalar", () => {
  it("parses an integer", () => {
    expect(parseOk("42")).toMatch({
      kind: "number",
      value: 42,
      firstToken: { text: "42", start: 0, end: 2 },
    });
  });

  it("parses a negative integer", () => {
    expect(parseOk("-7")).toMatch({
      kind: "number",
      value: -7,
      firstToken: { text: "-7", start: 0, end: 2 },
    });
  });

  it("parses a float", () => {
    expect(parseOk("3.14")).toMatch({
      kind: "number",
      value: 3.14,
      firstToken: { text: "3.14", start: 0, end: 4 },
    });
  });
});

// ---------------------------------------------------------------------------
// String scalars
// ---------------------------------------------------------------------------

describe("parseYaml – string scalar", () => {
  it("parses an unquoted string", () => {
    expect(parseOk("hello")).toMatch({
      kind: "string",
      value: "hello",
      firstToken: { text: "hello", start: 0, end: 5 },
    });
  });

  it("parses a double-quoted string", () => {
    expect(parseOk('"world"')).toMatch({
      kind: "string",
      value: "world",
      // firstToken includes the surrounding quotes
      firstToken: { text: '"world"', start: 0, end: 7 },
    });
  });

  it("parses a single-quoted string", () => {
    expect(parseOk("'hello'")).toMatch({
      kind: "string",
      value: "hello",
      firstToken: { text: "'hello'", start: 0, end: 7 },
    });
  });

  it("parses a block literal scalar (pipe)", () => {
    const src = "|\n  line1\n  line2\n";
    expect(parseOk(src)).toMatch({
      kind: "string",
      value: "line1\nline2\n",
    });
  });

  it("parses a block folded scalar (>)", () => {
    const src = ">\n  line1\n  line2\n";
    expect(parseOk(src)).toMatch({
      kind: "string",
      value: "line1 line2\n",
    });
  });

  it("decodes escape sequences in double-quoted strings", () => {
    expect(parseOk('"tab:\\there"')).toMatch({
      kind: "string",
      value: "tab:\there",
    });
  });
});

// ---------------------------------------------------------------------------
// Block map
// ---------------------------------------------------------------------------

describe("parseYaml – block map", () => {
  it("parses a single-entry block map", () => {
    expect(parseOk("x: 1")).toMatch({
      kind: "object",
      entries: [
        {
          key: { kind: "string", value: "x" },
          value: { kind: "number", value: 1 },
        },
      ],
    });
  });

  it("preserves entry order", () => {
    expect(parseOk("a: 1\nb: 2\nc: 3")).toMatch({
      kind: "object",
      entries: [
        { key: { value: "a" } },
        { key: { value: "b" } },
        { key: { value: "c" } },
      ],
    });
  });

  it("firstToken is a single char at the start of the first key", () => {
    const src = "point: 1";
    expect(parseOk(src)).toMatch({
      kind: "object",
      firstToken: { text: "p", start: 0, end: 1 },
    });
  });

  it("key firstToken spans the key text in source", () => {
    const src = "mykey: 1";
    const result = parseOk(src);
    expect(result).toMatch({
      kind: "object",
      entries: [
        {
          key: {
            kind: "string",
            value: "mykey",
            firstToken: { text: "mykey", start: 0, end: 5 },
          },
        },
      ],
    });
  });

  it("value firstToken is offset correctly in source", () => {
    const src = "x: 42";
    // "x: " is 3 chars, "42" starts at offset 3
    expect(parseOk(src)).toMatch({
      kind: "object",
      entries: [
        {
          value: {
            kind: "number",
            value: 42,
            firstToken: { text: "42", start: 3, end: 5 },
          },
        },
      ],
    });
  });

  it("handles an implicit null value (empty after colon)", () => {
    const src = "key:\n";
    const result = parseOk(src);
    expect(result).toMatch({
      kind: "object",
      entries: [
        {
          key: { value: "key" },
          value: { kind: "null" },
        },
      ],
    });
    // The implicit null must have a zero-width firstToken
    const val = (result as any).entries[0].value;
    expect(val.firstToken.start).toMatch(val.firstToken.end);
  });

  it("handles an explicit null value", () => {
    expect(parseOk("key: null")).toMatch({
      kind: "object",
      entries: [{ key: { value: "key" }, value: { kind: "null" } }],
    });
  });

  it("handles boolean values", () => {
    expect(parseOk("active: true")).toMatch({
      kind: "object",
      entries: [{ value: { kind: "boolean", value: true } }],
    });
  });

  it("handles string values", () => {
    expect(parseOk('name: "Alice"')).toMatch({
      kind: "object",
      entries: [{ value: { kind: "string", value: "Alice" } }],
    });
  });

  it("handles a nested block map value", () => {
    const src = "outer:\n  inner: 1";
    expect(parseOk(src)).toMatch({
      kind: "object",
      entries: [
        {
          key: { value: "outer" },
          value: {
            kind: "object",
            entries: [
              {
                key: { value: "inner" },
                value: { kind: "number", value: 1 },
              },
            ],
          },
        },
      ],
    });
  });

  it("handles a sequence value", () => {
    expect(parseOk("tags:\n  - a\n  - b")).toMatch({
      kind: "object",
      entries: [
        {
          key: { value: "tags" },
          value: {
            kind: "array",
            elements: [
              { kind: "string", value: "a" },
              { kind: "string", value: "b" },
            ],
          },
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Flow map
// ---------------------------------------------------------------------------

describe("parseYaml – flow map", () => {
  it("parses a flow map", () => {
    expect(parseOk("{x: 1, y: 2}")).toMatch({
      kind: "object",
      entries: [
        { key: { value: "x" }, value: { kind: "number", value: 1 } },
        { key: { value: "y" }, value: { kind: "number", value: 2 } },
      ],
    });
  });

  it("firstToken is '{'", () => {
    expect(parseOk("{x: 1}")).toMatch({
      kind: "object",
      firstToken: { text: "{", start: 0, end: 1 },
    });
  });

  it("parses an empty flow map", () => {
    expect(parseOk("{}")).toMatch({ kind: "object", entries: [] });
  });

  it("key firstToken is correct inside a flow map", () => {
    // "{x: 1}" — key "x" starts at offset 1
    expect(parseOk("{x: 1}")).toMatch({
      entries: [{ key: { firstToken: { text: "x", start: 1, end: 2 } } }],
    });
  });
});

// ---------------------------------------------------------------------------
// Block sequence
// ---------------------------------------------------------------------------

describe("parseYaml – block sequence", () => {
  it("parses a block sequence of scalars", () => {
    expect(parseOk("- 1\n- 2\n- 3")).toMatch({
      kind: "array",
      elements: [
        { kind: "number", value: 1 },
        { kind: "number", value: 2 },
        { kind: "number", value: 3 },
      ],
    });
  });

  it("firstToken is '-' (the block sequence indicator)", () => {
    expect(parseOk("- 1")).toMatch({
      kind: "array",
      firstToken: { text: "-", start: 0, end: 1 },
    });
  });

  it("parses a block sequence of objects", () => {
    expect(parseOk("- x: 1\n- x: 2")).toMatch({
      kind: "array",
      elements: [
        {
          kind: "object",
          entries: [
            { key: { value: "x" }, value: { kind: "number", value: 1 } },
          ],
        },
        {
          kind: "object",
          entries: [
            { key: { value: "x" }, value: { kind: "number", value: 2 } },
          ],
        },
      ],
    });
  });

  it("parses mixed-type elements", () => {
    expect(parseOk("- 1\n- hello\n- true")).toMatch({
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

describe("parseYaml – flow sequence", () => {
  it("parses a flow sequence of numbers", () => {
    expect(parseOk("[10, 20, 30]")).toMatch({
      kind: "array",
      elements: [
        { kind: "number", value: 10 },
        { kind: "number", value: 20 },
        { kind: "number", value: 30 },
      ],
    });
  });

  it("firstToken is '['", () => {
    expect(parseOk("[1, 2]")).toMatch({
      kind: "array",
      firstToken: { text: "[", start: 0, end: 1 },
    });
  });

  it("parses an empty flow sequence", () => {
    expect(parseOk("[]")).toMatch({ kind: "array", elements: [] });
  });

  it("element firstToken is correct inside a flow sequence", () => {
    // "[10, 20]" — first element "10" at offset 1..3, second "20" at 5..7
    expect(parseOk("[10, 20]")).toMatch({
      elements: [
        { firstToken: { text: "10", start: 1, end: 3 } },
        { firstToken: { text: "20", start: 5, end: 7 } },
      ],
    });
  });

  it("parses mixed-type elements", () => {
    expect(parseOk('[1, true, null, "hi"]')).toMatch({
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
// Span preservation across a multi-node document
// ---------------------------------------------------------------------------

describe("parseYaml – span preservation", () => {
  it("preserves offsets across a full block map document", () => {
    const src = "name: Alice\nage: 30\n";
    // "name" at 0..4, value "Alice" at 6..11
    // "age" at 12..15, value "30" at 17..19
    expect(parseOk(src)).toMatch({
      kind: "object",
      entries: [
        {
          key: { firstToken: { text: "name", start: 0, end: 4 } },
          value: { firstToken: { text: "Alice", start: 6, end: 11 } },
        },
        {
          key: { firstToken: { text: "age", start: 12, end: 15 } },
          value: { firstToken: { text: "30", start: 17, end: 19 } },
        },
      ],
    });
  });

  it("preserves offsets inside a flow map nested in a block map", () => {
    const src = "point: {x: 1, y: 2}\n";
    // "point" at 0..5, flow map "{" at 7
    // "x" at 8..9, "1" at 11..12, "y" at 14..15, "2" at 17..18
    expect(parseOk(src)).toMatch({
      kind: "object",
      entries: [
        {
          key: { firstToken: { text: "point", start: 0, end: 5 } },
          value: {
            kind: "object",
            firstToken: { text: "{", start: 7, end: 8 },
            entries: [
              {
                key: { firstToken: { text: "x", start: 8, end: 9 } },
                value: { firstToken: { start: 11, end: 12 } },
              },
              {
                key: { firstToken: { text: "y", start: 14, end: 15 } },
                value: { firstToken: { start: 17, end: 18 } },
              },
            ],
          },
        },
      ],
    });
  });

  it("preserves offsets inside a flow sequence nested in a block map", () => {
    const src = "nums: [10, 20]\n";
    // "nums" at 0..4, "[" at 6, "10" at 7..9, "20" at 11..13
    expect(parseOk(src)).toMatch({
      kind: "object",
      entries: [
        {
          value: {
            kind: "array",
            firstToken: { text: "[", start: 6, end: 7 },
            elements: [
              { firstToken: { text: "10", start: 7, end: 9 } },
              { firstToken: { text: "20", start: 11, end: 13 } },
            ],
          },
        },
      ],
    });
  });
});
