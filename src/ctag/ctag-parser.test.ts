import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseCTag } from "./ctag-parser.js";

describe("parseCTag", () => {
  it("parses JSON object, array, and ellipsis values", () => {
    const input = '{"foo": true, "items": [1, ...], ...}';
    const result = parseCTag(input);

    expect(result).toMatch({
      kind: "json",
      json: {
        kind: "object",
        entries: [
          {
            key: { kind: "string", value: "foo" },
            value: { kind: "boolean", value: true },
          },
          {
            key: { kind: "string", value: "items" },
            value: {
              kind: "array",
              elements: [{ kind: "number", value: 1 }, { kind: "ellipsis" }],
            },
          },
        ],
        ellipsis: { kind: "ellipsis" },
      },
    });
  });

  it("parses standalone primitive values as identifiers", () => {
    const values = [
      ["123", "123"],
      ["true", "true"],
      ["null", "null"],
    ] as const;

    for (const [input, expectedText] of values) {
      const result = parseCTag(input);
      expect(result).toMatch({
        kind: "identifier",
        identifier: { text: expectedText },
      });
    }
  });

  it("parses a quoted string as a JSON string, not an identifier", () => {
    expect(parseCTag('"x"')).toMatch({
      kind: "json",
      json: { kind: "string", value: "x" },
    });
  });

  it("parses empty object and empty array", () => {
    expect(parseCTag("{}")).toMatch({
      kind: "json",
      json: {
        kind: "object",
        entries: [],
      },
    });

    expect(parseCTag("[]")).toMatch({
      kind: "json",
      json: {
        kind: "array",
        elements: [],
      },
    });
  });

  it("decodes escaped JSON string values", () => {
    const result = parseCTag('"line\\nnext"');

    expect(result).toMatch({
      kind: "json",
      json: {
        kind: "string",
        value: "line\nnext",
      },
    });
  });

  it("parses JSON values with leading and trailing line comments", () => {
    const result = parseCTag("// before\ntrue // after");

    expect(result).toMatch({
      kind: "json",
      json: {
        kind: "boolean",
        value: true,
      },
    });
  });

  it("parses JSON values with leading and trailing block comments", () => {
    const result = parseCTag("/* before */ [1, 2] /* after */");

    expect(result).toMatch({
      kind: "json",
      json: {
        kind: "array",
        elements: [
          { kind: "number", value: 1 },
          { kind: "number", value: 2 },
        ],
      },
    });
  });

  it("parses comments between object tokens", () => {
    const result = parseCTag(
      '{"a"/*key-value*/:/*value*/1,/*sep*/"b":/*value*/2}',
    );

    expect(result).toMatch({
      kind: "json",
      json: {
        kind: "object",
        entries: [
          {
            key: { kind: "string", value: "a" },
            value: { kind: "number", value: 1 },
          },
          {
            key: { kind: "string", value: "b" },
            value: { kind: "number", value: 2 },
          },
        ],
      },
    });
  });

  it("parses comments between array values", () => {
    const result = parseCTag("[1, // between\n 2, /* between */ 3]");

    expect(result).toMatch({
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

  it("does not treat comment markers inside strings as comments", () => {
    const result = parseCTag('"/* not a comment */ // still string"');

    expect(result).toMatch({
      kind: "json",
      json: {
        kind: "string",
        value: "/* not a comment */ // still string",
      },
    });
  });

  it("reports expected JSON value for empty input", () => {
    const result = parseCTag("   ");

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected JSON value", start: 3, end: 3 }],
    });
  });

  it("reports trailing content after a JSON value", () => {
    const result = parseCTag("true false");

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected trailing content after JSON value",
          start: 5,
          end: 10,
        },
      ],
    });
  });

  it("reports missing colon in an object entry", () => {
    const result = parseCTag('{"a" 1}');

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected ':'" }],
    });
  });

  it("reports missing comma in an object", () => {
    const result = parseCTag('{"a": 1 "b": 2}');

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected ',' or '}'",
          start: 8,
          end: 9,
        },
      ],
    });
  });

  it("reports missing comma in an array", () => {
    const result = parseCTag("[1 2]");

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected ',' or ']'",
          start: 3,
          end: 4,
        },
      ],
    });
  });

  it("reports EOF while parsing object and array", () => {
    expect(parseCTag('{"a": 1')).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected '}'",
          start: 7,
          end: 7,
        },
      ],
    });

    expect(parseCTag("[1, 2")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected ']'",
          start: 5,
          end: 5,
        },
      ],
    });
  });

  it("reports unterminated JSON string", () => {
    const result = parseCTag('"abc');

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected closing quote for JSON string" }],
    });
  });

  it("reports invalid JSON string escape sequences", () => {
    const result = parseCTag('"bad\\q"');

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Invalid JSON string escape sequence",
          start: 0,
          end: 7,
        },
      ],
    });
  });

  it("reports invalid JSON string unicode escapes", () => {
    const result = parseCTag('"\\u12"');

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Invalid JSON string escape sequence",
          start: 0,
          end: 6,
        },
      ],
    });
  });

  it("reports invalid decode for object key strings", () => {
    const result = parseCTag('{"\\q": 1}');

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Invalid JSON string escape sequence",
          start: 1,
          end: 5,
        },
      ],
    });
  });

  it("reports each invalid JSON string decode in the same input", () => {
    const result = parseCTag('["\\q", "\\x"]');

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Invalid JSON string escape sequence",
          start: 1,
          end: 5,
        },
        {
          message: "Invalid JSON string escape sequence",
          start: 7,
          end: 11,
        },
      ],
    });
  });

  it("parses partial boolean keyword as identifier", () => {
    const result = parseCTag("tru");

    expect(result).toMatch({
      kind: "identifier",
      identifier: { text: "tru" },
    });
  });

  it("parses partial null keyword as identifier", () => {
    const result = parseCTag("nul");

    expect(result).toMatch({
      kind: "identifier",
      identifier: { text: "nul" },
    });
  });

  it("reports invalid number token", () => {
    const result = parseCTag("-");

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected JSON number", start: 0, end: 1 }],
    });
  });

  it("reports unterminated block comments at start and after a value", () => {
    expect(parseCTag("/* open")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected closing '*/' for block comment",
          start: 0,
          end: 7,
        },
      ],
    });

    expect(parseCTag("1 /* open")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected closing '*/' for block comment",
          start: 2,
          end: 9,
        },
      ],
    });
  });

  it("still reports structural errors with comments in between tokens", () => {
    const result = parseCTag("[1 /* gap */ 2]");

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected ',' or ']'",
        },
      ],
    });
  });

  it("reports duplicate object keys", () => {
    const result = parseCTag('{"a": 1, "a": 2}');

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Duplicate object key 'a'",
          start: 9,
          end: 12,
        },
      ],
    });
  });

  it("reports non-string object keys", () => {
    const result = parseCTag("{1: 2}");

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected JSON string" }],
    });
  });

  it("recovers and reports multiple errors for inputs with multiple issues", () => {
    const result = parseCTag('{"a": 1 "b": 2, c: 3}');

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected ',' or '}'",
        },
        {
          message: "Expected JSON string",
        },
      ],
    });

    if (result.kind !== "error") {
      throw new Error("Expected parse errors");
    }
    expect(result.errors.length >= 2).toBe(true);
  });

  it("recovers from repeated missing commas and reports each issue", () => {
    const result = parseCTag("[1 2 3]");

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected ',' or ']'",
        },
        {
          message: "Expected ',' or ']'",
        },
      ],
    });

    if (result.kind !== "error") {
      throw new Error("Expected parse errors");
    }
    expect(result.errors.length >= 2).toBe(true);
  });

  it("recovers from unquoted keys and missing colons in object entries", () => {
    const result = parseCTag("{a 1 b 2}");

    if (result.kind !== "error") {
      throw new Error("Expected parse errors");
    }

    const messages = result.errors.map((error) => error.message);
    expect(messages.includes("Expected JSON string")).toBe(true);
    expect(messages.includes("Expected ':'")).toBe(true);
    expect(messages.includes("Expected ',' or '}'")).toBe(true);
    expect(result.errors.length >= 3).toBe(true);
  });

  it("recovers from extraneous colons before object/array closers", () => {
    expect(parseCTag('{"a": 1:}')).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected ':' before '}'",
        },
      ],
    });

    expect(parseCTag("[1:]")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected ':' before ']'",
        },
      ],
    });
  });
});
