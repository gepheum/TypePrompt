import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { MappedText } from "../util/common-types.js";
import { parseJson } from "./json-parser.js";

function textNode(source: string): MappedText {
  return {
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

describe("parseJson – primitives", () => {
  it("parses a string", () => {
    expect(parseJson(textNode('"hello"'))).toMatch({
      kind: "string",
      value: "hello",
    });
  });

  it("parses a string with escape sequences", () => {
    expect(parseJson(textNode('"line\\nnext"'))).toMatch({
      kind: "string",
      value: "line\nnext",
    });
  });

  it("parses an integer number", () => {
    expect(parseJson(textNode("42"))).toMatch({
      kind: "number",
      value: 42,
    });
  });

  it("parses a negative number", () => {
    expect(parseJson(textNode("-3.14"))).toMatch({
      kind: "number",
      value: -3.14,
    });
  });

  it("parses true", () => {
    expect(parseJson(textNode("true"))).toMatch({
      kind: "boolean",
      value: true,
    });
  });

  it("parses false", () => {
    expect(parseJson(textNode("false"))).toMatch({
      kind: "boolean",
      value: false,
    });
  });

  it("parses null", () => {
    expect(parseJson(textNode("null"))).toMatch({
      kind: "null",
    });
  });
});

describe("parseJson – object", () => {
  it("parses an empty object", () => {
    expect(parseJson(textNode("{}"))).toMatch({
      kind: "object",
      entries: [],
    });
  });

  it("parses an object with entries", () => {
    expect(parseJson(textNode('{"a": 1, "b": true}'))).toMatch({
      kind: "object",
      entries: [
        { key: { value: "a" }, value: { kind: "number", value: 1 } },
        { key: { value: "b" }, value: { kind: "boolean", value: true } },
      ],
    });
  });

  it("parses an object with ellipsis", () => {
    expect(parseJson(textNode('{"x": 1, ...}'))).toMatch({
      kind: "object",
      entries: [{ key: { value: "x" } }],
      ellipsis: { kind: "ellipsis" },
    });
  });

  it("parses nested objects", () => {
    expect(parseJson(textNode('{"a": {"b": "c"}}'))).toMatch({
      kind: "object",
      entries: [
        {
          key: { value: "a" },
          value: {
            kind: "object",
            entries: [
              { key: { value: "b" }, value: { kind: "string", value: "c" } },
            ],
          },
        },
      ],
    });
  });
});

describe("parseJson – array", () => {
  it("parses an empty array", () => {
    expect(parseJson(textNode("[]"))).toMatch({
      kind: "array",
      elements: [],
    });
  });

  it("parses an array with elements", () => {
    expect(parseJson(textNode("[1, 2, 3]"))).toMatch({
      kind: "array",
      elements: [
        { kind: "number", value: 1 },
        { kind: "number", value: 2 },
        { kind: "number", value: 3 },
      ],
    });
  });

  it("parses an array with ellipsis", () => {
    expect(parseJson(textNode("[1, ...]"))).toMatch({
      kind: "array",
      elements: [{ kind: "number", value: 1 }, { kind: "ellipsis" }],
    });
  });
});

describe("parseJson – comments", () => {
  it("skips line comments", () => {
    expect(parseJson(textNode("// before\ntrue // after"))).toMatch({
      kind: "boolean",
      value: true,
    });
  });

  it("skips block comments", () => {
    expect(parseJson(textNode("/* before */ 42 /* after */"))).toMatch({
      kind: "number",
      value: 42,
    });
  });

  it("skips comments between object tokens", () => {
    expect(parseJson(textNode('{"a" /* sep */ : /* val */ 1}'))).toMatch({
      kind: "object",
      entries: [{ key: { value: "a" }, value: { kind: "number", value: 1 } }],
    });
  });
});

describe("parseJson – source spans", () => {
  it("records the span of a string token", () => {
    expect(parseJson(textNode(' "hi" '))).toMatch({
      kind: "string",
      firstToken: { start: 1, end: 5 },
    });
  });

  it("records the span of an object's opening brace", () => {
    expect(parseJson(textNode(" {}"))).toMatch({
      kind: "object",
      firstToken: { start: 1, end: 2 },
    });
  });
});

describe("parseJson – errors", () => {
  it("reports error for empty input", () => {
    expect(parseJson(textNode("   "))).toMatch({
      kind: "error",
      errors: [{ message: "Expected JSON value", span: { start: 3, end: 3 } }],
    });
  });

  it("reports error for trailing content", () => {
    expect(parseJson(textNode("true false"))).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected trailing content after JSON value",
          span: {
            start: 5,
            end: 10,
          },
        },
      ],
    });
  });

  it("reports error for unterminated string", () => {
    expect(parseJson(textNode('"hello'))).toMatch({
      kind: "error",
      errors: [{ message: "Expected closing quote for JSON string" }],
    });
  });

  it("reports error for duplicate object key", () => {
    expect(parseJson(textNode('{"a": 1, "a": 2}'))).toMatch({
      kind: "error",
      errors: [{ message: "Duplicate object key 'a'" }],
    });
  });

  it("reports error for missing colon in object entry", () => {
    expect(parseJson(textNode('{"a" 1}'))).toMatch({
      kind: "error",
      errors: [{ message: "Expected ':'" }],
    });
  });

  it("reports error for unterminated block comment", () => {
    expect(parseJson(textNode("/* not closed"))).toMatch({
      kind: "error",
      errors: [{ message: "Expected closing '*/' for block comment" }],
    });
  });

  it("reports error for invalid JSON value", () => {
    expect(parseJson(textNode("@"))).toMatch({
      kind: "error",
      errors: [{ message: "Invalid JSON value" }],
    });
  });

  it("reports error for missing closing bracket in array", () => {
    expect(parseJson(textNode("[1, 2"))).toMatch({
      kind: "error",
      errors: [{ message: "Expected ']'" }],
    });
  });

  it("reports error for missing closing brace in object", () => {
    expect(parseJson(textNode('{"a": 1'))).toMatch({
      kind: "error",
      errors: [{ message: "Expected '}'" }],
    });
  });
});

describe("parseJson – source offset remapping", () => {
  it("remaps firstToken offsets via the offsetMap", () => {
    const content: MappedText = {
      text: '"hello"',
      offsetMap: [{ textPosition: 0, sourcePosition: 5 }],
    };
    expect(parseJson(content)).toMatch({
      kind: "string",
      firstToken: { start: 5, end: 12 },
    });
  });

  it("remaps error offsets via the offsetMap", () => {
    const content: MappedText = {
      text: "   ",
      offsetMap: [{ textPosition: 0, sourcePosition: 7 }],
    };
    expect(parseJson(content)).toMatch({
      kind: "error",
      errors: [
        { span: { start: 10, end: 10 }, message: "Expected JSON value" },
      ],
    });
  });
});
