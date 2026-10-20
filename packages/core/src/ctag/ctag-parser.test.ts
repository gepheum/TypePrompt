import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { MappedText } from "../util/shared-types.js";
import { parseCTag } from "./ctag-parser.js";

function textNode(source: string, path = "test.tp"): MappedText {
  return {
    path,
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

// ---------------------------------------------------------------------------
// Identifier path - unquoted word
// ---------------------------------------------------------------------------

describe("parseCTag - unquoted identifier", () => {
  it("parses a simple word as an identifier", () => {
    expect(parseCTag(textNode("hello"))).toMatch({
      kind: "identifier",
      identifier: { text: "hello" },
    });
  });

  it("parses an all-digit string as an identifier (not a JSON number)", () => {
    expect(parseCTag(textNode("123"))).toMatch({
      kind: "identifier",
      identifier: { text: "123" },
    });
  });

  it("parses a mixed alphanumeric string as an identifier", () => {
    expect(parseCTag(textNode("abc123"))).toMatch({
      kind: "identifier",
      identifier: { text: "abc123" },
    });
  });

  it("treats 'true', 'false', 'null' as identifiers (not JSON literals)", () => {
    for (const word of ["true", "false", "null"]) {
      expect(parseCTag(textNode(word))).toMatch({
        kind: "identifier",
        identifier: { text: word },
      });
    }
  });

  it("records the correct source span for an unquoted identifier", () => {
    expect(parseCTag(textNode("hello"))).toMatch({
      kind: "identifier",
      identifier: { text: "hello", start: 0, end: 5 },
    });
  });
});

// ---------------------------------------------------------------------------
// Identifier path - quoted word
// ---------------------------------------------------------------------------

describe("parseCTag - quoted identifier", () => {
  it("parses a quoted word as an identifier and strips the quotes", () => {
    expect(parseCTag(textNode('"hello"'))).toMatch({
      kind: "identifier",
      identifier: { text: "hello" },
    });
  });

  it("records a span that excludes the surrounding quotes", () => {
    // text = '"hello"', identifier text runs from index 1 to 6 (excluding quotes)
    expect(parseCTag(textNode('"hello"'))).toMatch({
      kind: "identifier",
      identifier: { text: "hello", start: 1, end: 6 },
    });
  });

  it("parses a quoted JSON keyword as an identifier, not a JSON value", () => {
    expect(parseCTag(textNode('"true"'))).toMatch({
      kind: "identifier",
      identifier: { text: "true" },
    });
  });
});

// ---------------------------------------------------------------------------
// JSON path - falls through to loose JSON parsing
// ---------------------------------------------------------------------------

describe("parseCTag - JSON values", () => {
  it("parses a quoted string containing a space as a JSON string", () => {
    // Space is not a word char, so "hello world" does not match the identifier regexes.
    expect(parseCTag(textNode('"hello world"'))).toMatch({
      kind: "json",
      json: { kind: "string", value: "hello world" },
    });
  });

  it("parses a JSON object", () => {
    expect(parseCTag(textNode('{"a": 1, "b": true}'))).toMatch({
      kind: "json",
      json: {
        kind: "object",
        entries: {
          a: { value: { kind: "number", value: 1 } },
          b: { value: { kind: "boolean", value: true } },
        },
      },
    });
  });

  it("parses an empty JSON object", () => {
    expect(parseCTag(textNode("{}"))).toMatch({
      kind: "json",
      json: { kind: "object", entries: {} },
    });
  });

  it("parses a JSON array", () => {
    expect(parseCTag(textNode("[1, 2, 3]"))).toMatch({
      kind: "json",
      json: {
        kind: "array",
        elements: [
          { kind: "number", value: 1 },
          { kind: "number", value: 2 },
          { kind: "number", value: 3 },
        ],
      },
    });
  });

  it("parses an empty JSON array", () => {
    expect(parseCTag(textNode("[]"))).toMatch({
      kind: "json",
      json: { kind: "array", elements: [] },
    });
  });

  it("parses a JSON object with an ellipsis (loose mode)", () => {
    expect(parseCTag(textNode('{"x": 1, ...}'))).toMatch({
      kind: "json",
      json: {
        kind: "object",
        entries: { x: { value: { kind: "number", value: 1 } } },
        ellipsis: { kind: "ellipsis" },
      },
    });
  });

  it("parses a JSON array with an ellipsis (loose mode)", () => {
    expect(parseCTag(textNode("[1, ...]"))).toMatch({
      kind: "json",
      json: {
        kind: "array",
        elements: [{ kind: "number", value: 1 }, { kind: "ellipsis" }],
      },
    });
  });

  it("skips line comments", () => {
    expect(parseCTag(textNode("// comment\n42 // after"))).toMatch({
      kind: "json",
      json: { kind: "number", value: 42 },
    });
  });

  it("skips block comments", () => {
    expect(parseCTag(textNode("/* before */ 42 /* after */"))).toMatch({
      kind: "json",
      json: { kind: "number", value: 42 },
    });
  });
});

// ---------------------------------------------------------------------------
// Error path
// ---------------------------------------------------------------------------

describe("parseCTag - errors", () => {
  it("returns an error for an invalid JSON value", () => {
    expect(parseCTag(textNode("@"))).toMatch({
      kind: "error",
      errors: [{ message: "Invalid JSON value" }],
    });
  });

  it("returns an error for empty input", () => {
    expect(parseCTag(textNode("   "))).toMatch({
      kind: "error",
      errors: [{ message: "Expected JSON value" }],
    });
  });

  it("returns an error for trailing content", () => {
    // "true false" has a space so does not match the identifier regex; falls through
    // to JSON, which parses "true" then reports trailing "false".
    expect(parseCTag(textNode("true false"))).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected trailing content after JSON value" }],
    });
  });

  it("returns an error for a missing closing brace", () => {
    expect(parseCTag(textNode('{"a": 1'))).toMatch({
      kind: "error",
      errors: [{ message: "Expected '}'" }],
    });
  });

  it("returns an error for a missing closing bracket", () => {
    expect(parseCTag(textNode("[1, 2"))).toMatch({
      kind: "error",
      errors: [{ message: "Expected ']'" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Source position remapping
// ---------------------------------------------------------------------------

describe("parseCTag - source position remapping", () => {
  it("remaps unquoted identifier spans via the offsetMap", () => {
    const content: MappedText = {
      path: "test.tp",
      text: "hello",
      offsetMap: [{ textPosition: 0, sourcePosition: 10 }],
    };
    expect(parseCTag(content)).toMatch({
      kind: "identifier",
      identifier: { text: "hello", start: 10, end: 15 },
    });
  });

  it("remaps quoted identifier spans via the offsetMap", () => {
    // text = '"hi"', identifier text positions 1-3, source offset = +5
    const content: MappedText = {
      path: "test.tp",
      text: '"hi"',
      offsetMap: [{ textPosition: 0, sourcePosition: 5 }],
    };
    expect(parseCTag(content)).toMatch({
      kind: "identifier",
      identifier: { text: "hi", start: 6, end: 8 },
    });
  });
});
