import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseExample } from "./example-parser.js";

describe("parseExample", () => {
  it("parses JSON object, array, and ellipsis values", () => {
    const input = '{"foo": true, "items": [1, ...], ...}';
    const result = parseExample(input);

    expect(result).toMatch({
      kind: "success",
      exampleSource: input,
      value: {
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
              values: [{ kind: "number", value: 1 }, { kind: "ellipsis" }],
            },
          },
        ],
        ellipsis: { kind: "ellipsis" },
      },
    });
  });

  it("parses standalone primitive values", () => {
    const values = [
      ['"x"', { kind: "string", value: "x" }],
      ["123", { kind: "number", value: 123 }],
      ["true", { kind: "boolean", value: true }],
      ["null", { kind: "null" }],
    ] as const;

    for (const [input, expected] of values) {
      const result = parseExample(input);
      expect(result).toMatch({
        kind: "success",
        value: expected,
      });
    }
  });

  it("parses empty object and empty array", () => {
    expect(parseExample("{}")).toMatch({
      kind: "success",
      value: {
        kind: "object",
        entries: [],
      },
    });

    expect(parseExample("[]")).toMatch({
      kind: "success",
      value: {
        kind: "array",
        values: [],
      },
    });
  });

  it("decodes escaped JSON string values", () => {
    const result = parseExample('"line\\nnext"');

    expect(result).toMatch({
      kind: "success",
      value: {
        kind: "string",
        value: "line\nnext",
      },
    });
  });

  it("parses JSON values with leading and trailing line comments", () => {
    const result = parseExample("// before\ntrue // after");

    expect(result).toMatch({
      kind: "success",
      value: {
        kind: "boolean",
        value: true,
      },
    });
  });

  it("parses JSON values with leading and trailing block comments", () => {
    const result = parseExample("/* before */ [1, 2] /* after */");

    expect(result).toMatch({
      kind: "success",
      value: {
        kind: "array",
        values: [
          { kind: "number", value: 1 },
          { kind: "number", value: 2 },
        ],
      },
    });
  });

  it("parses comments between object tokens", () => {
    const result = parseExample(
      '{"a"/*key-value*/:/*value*/1,/*sep*/"b":/*value*/2}',
    );

    expect(result).toMatch({
      kind: "success",
      value: {
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
    const result = parseExample("[1, // between\n 2, /* between */ 3]");

    expect(result).toMatch({
      kind: "success",
      value: {
        kind: "array",
        values: [
          { kind: "number", value: 1 },
          { kind: "number", value: 2 },
          { kind: "number", value: 3 },
        ],
      },
    });
  });

  it("does not treat comment markers inside strings as comments", () => {
    const result = parseExample('"/* not a comment */ // still string"');

    expect(result).toMatch({
      kind: "success",
      value: {
        kind: "string",
        value: "/* not a comment */ // still string",
      },
    });
  });

  it("reports expected JSON value for empty input", () => {
    const result = parseExample("   ");

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected JSON value", start: 3, end: 3 }],
    });
  });

  it("reports trailing content after a JSON value", () => {
    const result = parseExample("true false");

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
    const result = parseExample('{"a" 1}');

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected ':'" }],
    });
  });

  it("reports missing comma in an object", () => {
    const result = parseExample('{"a": 1 "b": 2}');

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
    const result = parseExample("[1 2]");

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
    expect(parseExample('{"a": 1')).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected '}'",
          start: 7,
          end: 7,
        },
      ],
    });

    expect(parseExample("[1, 2")).toMatch({
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
    const result = parseExample('"abc');

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected closing quote for JSON string" }],
    });
  });

  it("reports invalid JSON string escape sequences", () => {
    const result = parseExample('"bad\\q"');

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
    const result = parseExample('"\\u12"');

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
    const result = parseExample('{"\\q": 1}');

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
    const result = parseExample('["\\q", "\\x"]');

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

  it("reports invalid boolean keyword", () => {
    const result = parseExample("tru");

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected 'true' or 'false'" }],
    });
  });

  it("reports invalid null keyword", () => {
    const result = parseExample("nul");

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected 'null'" }],
    });
  });

  it("reports invalid number token", () => {
    const result = parseExample("-");

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected JSON number", start: 0, end: 1 }],
    });
  });

  it("reports unterminated block comments at start and after a value", () => {
    expect(parseExample("/* open")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected closing '*/' for block comment",
          start: 0,
          end: 7,
        },
      ],
    });

    expect(parseExample("1 /* open")).toMatch({
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
    const result = parseExample("[1 /* gap */ 2]");

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected ',' or ']'",
        },
      ],
    });
  });

  it("reports non-string object keys", () => {
    const result = parseExample("{1: 2}");

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected JSON string" }],
    });
  });

  it("recovers and reports multiple errors for inputs with multiple issues", () => {
    const result = parseExample('{"a": 1 "b": 2, c: 3}');

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
    const result = parseExample("[1 2 3]");

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
    const result = parseExample("{a 1 b 2}");

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
    expect(parseExample('{"a": 1:}')).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected ':' before '}'",
        },
      ],
    });

    expect(parseExample("[1:]")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected ':' before ']'",
        },
      ],
    });
  });
});
