import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { MappedText } from "../util/shared-types.js";
import { parseCTag } from "./ctag-parser.js";

function textNode(source: string): MappedText {
  return {
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

// ---------------------------------------------------------------------------
// Identifier path – unquoted word
// ---------------------------------------------------------------------------

describe("parseCTag – unquoted identifier", () => {
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
// Identifier path – quoted word
// ---------------------------------------------------------------------------

describe("parseCTag – quoted identifier", () => {
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
// JSON path – falls through to loose JSON parsing
// ---------------------------------------------------------------------------

describe("parseCTag – JSON values", () => {
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

describe("parseCTag – errors", () => {
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

describe("parseCTag – source position remapping", () => {
  it("remaps unquoted identifier spans via the offsetMap", () => {
    const content: MappedText = {
      text: "hello",
      offsetMap: [{ textPosition: 0, sourcePosition: 10 }],
    };
    expect(parseCTag(content)).toMatch({
      kind: "identifier",
      identifier: { text: "hello", start: 10, end: 15 },
    });
  });

  it("remaps quoted identifier spans via the offsetMap", () => {
    // text = '"hi"', identifier text positions 1–3, source offset = +5
    const content: MappedText = {
      text: '"hi"',
      offsetMap: [{ textPosition: 0, sourcePosition: 5 }],
    };
    expect(parseCTag(content)).toMatch({
      kind: "identifier",
      identifier: { text: "hi", start: 6, end: 8 },
    });
  });
});

//     expect(result).toMatch({
//       kind: "json",
//       json: {
//         kind: "object",
//         entries: [
//           {
//             key: { kind: "string", value: "foo" },
//             value: { kind: "boolean", value: true },
//           },
//           {
//             key: { kind: "string", value: "items" },
//             value: {
//               kind: "array",
//               elements: [{ kind: "number", value: 1 }, { kind: "ellipsis" }],
//             },
//           },
//         ],
//         ellipsis: { kind: "ellipsis" },
//       },
//     });
//   });

//   it("parses standalone primitive values as identifiers", () => {
//     const values = [
//       ["123", "123"],
//       ["true", "true"],
//       ["null", "null"],
//     ] as const;

//     for (const [input, expectedText] of values) {
//       const result = parseCTag(textNode(input));
//       expect(result).toMatch({
//         kind: "identifier",
//         identifier: { text: expectedText },
//       });
//     }
//   });

//   it("parses a quoted string as a JSON string, not an identifier", () => {
//     expect(parseCTag(textNode('"x"'))).toMatch({
//       kind: "json",
//       json: { kind: "string", value: "x" },
//     });
//   });

//   it("parses empty object and empty array", () => {
//     expect(parseCTag(textNode("{}"))).toMatch({
//       kind: "json",
//       json: {
//         kind: "object",
//         entries: [],
//       },
//     });

//     expect(parseCTag(textNode("[]"))).toMatch({
//       kind: "json",
//       json: {
//         kind: "array",
//         elements: [],
//       },
//     });
//   });

//   it("decodes escaped JSON string values", () => {
//     const result = parseCTag(textNode('"line\\nnext"'));

//     expect(result).toMatch({
//       kind: "json",
//       json: {
//         kind: "string",
//         value: "line\nnext",
//       },
//     });
//   });

//   it("parses JSON values with leading and trailing line comments", () => {
//     const result = parseCTag(textNode("// before\ntrue // after"));

//     expect(result).toMatch({
//       kind: "json",
//       json: {
//         kind: "boolean",
//         value: true,
//       },
//     });
//   });

//   it("parses JSON values with leading and trailing block comments", () => {
//     const result = parseCTag(textNode("/* before */ [1, 2] /* after */"));

//     expect(result).toMatch({
//       kind: "json",
//       json: {
//         kind: "array",
//         elements: [
//           { kind: "number", value: 1 },
//           { kind: "number", value: 2 },
//         ],
//       },
//     });
//   });

//   it("parses comments between object tokens", () => {
//     const result = parseCTag(
//       textNode('{"a"/*key-value*/:/*value*/1,/*sep*/"b":/*value*/2}'),
//     );

//     expect(result).toMatch({
//       kind: "json",
//       json: {
//         kind: "object",
//         entries: [
//           {
//             key: { kind: "string", value: "a" },
//             value: { kind: "number", value: 1 },
//           },
//           {
//             key: { kind: "string", value: "b" },
//             value: { kind: "number", value: 2 },
//           },
//         ],
//       },
//     });
//   });

//   it("parses comments between array values", () => {
//     const result = parseCTag(textNode("[1, // between\n 2, /* between */ 3]"));

//     expect(result).toMatch({
//       kind: "json",
//       json: {
//         kind: "array",
//         elements: [
//           { kind: "number", value: 1 },
//           { kind: "number", value: 2 },
//           { kind: "number", value: 3 },
//         ],
//       },
//     });
//   });

//   it("does not treat comment markers inside strings as comments", () => {
//     const result = parseCTag(textNode('"/* not a comment */ // still string"'));

//     expect(result).toMatch({
//       kind: "json",
//       json: {
//         kind: "string",
//         value: "/* not a comment */ // still string",
//       },
//     });
//   });

//   it("reports expected JSON value for empty input", () => {
//     const result = parseCTag(textNode("   "));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "Expected JSON value", span: { start: 3, end: 3 } }],
//     });
//   });

//   it("reports trailing content after a JSON value", () => {
//     const result = parseCTag(textNode("true false"));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Unexpected trailing content after JSON value",
//           span: {
//             start: 5,
//             end: 10,
//           },
//         },
//       ],
//     });
//   });

//   it("reports missing colon in an object entry", () => {
//     const result = parseCTag(textNode('{"a" 1}'));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "Expected ':'" }],
//     });
//   });

//   it("reports missing comma in an object", () => {
//     const result = parseCTag(textNode('{"a": 1 "b": 2}'));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Expected ',' or '}'",
//           span: {
//             start: 8,
//             end: 9,
//           },
//         },
//       ],
//     });
//   });

//   it("reports missing comma in an array", () => {
//     const result = parseCTag(textNode("[1 2]"));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Expected ',' or ']'",
//           span: {
//             start: 3,
//             end: 4,
//           },
//         },
//       ],
//     });
//   });

//   it("reports EOF while parsing object and array", () => {
//     expect(parseCTag(textNode('{"a": 1'))).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Expected '}'",
//           span: {
//             start: 7,
//             end: 7,
//           },
//         },
//       ],
//     });

//     expect(parseCTag(textNode("[1, 2"))).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Expected ']'",
//           span: {
//             start: 5,
//             end: 5,
//           },
//         },
//       ],
//     });
//   });

//   it("reports unterminated JSON string", () => {
//     const result = parseCTag(textNode('"abc'));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "Expected closing quote for JSON string" }],
//     });
//   });

//   it("reports invalid JSON string escape sequences", () => {
//     const result = parseCTag(textNode('"bad\\q"'));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Invalid JSON string escape sequence",
//           span: {
//             start: 0,
//             end: 7,
//           },
//         },
//       ],
//     });
//   });

//   it("reports invalid JSON string unicode escapes", () => {
//     const result = parseCTag(textNode('"\\u12"'));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Invalid JSON string escape sequence",
//           span: {
//             start: 0,
//             end: 6,
//           },
//         },
//       ],
//     });
//   });

//   it("reports invalid decode for object key strings", () => {
//     const result = parseCTag(textNode('{"\\q": 1}'));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Invalid JSON string escape sequence",
//           span: {
//             start: 1,
//             end: 5,
//           },
//         },
//       ],
//     });
//   });

//   it("reports each invalid JSON string decode in the same input", () => {
//     const result = parseCTag(textNode('["\\q", "\\x"]'));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Invalid JSON string escape sequence",
//           span: {
//             start: 1,
//             end: 5,
//           },
//         },
//         {
//           message: "Invalid JSON string escape sequence",
//           span: {
//             start: 7,
//             end: 11,
//           },
//         },
//       ],
//     });
//   });

//   it("parses partial boolean keyword as identifier", () => {
//     const result = parseCTag(textNode("tru"));

//     expect(result).toMatch({
//       kind: "identifier",
//       identifier: { text: "tru" },
//     });
//   });

//   it("parses partial null keyword as identifier", () => {
//     const result = parseCTag(textNode("nul"));

//     expect(result).toMatch({
//       kind: "identifier",
//       identifier: { text: "nul" },
//     });
//   });

//   it("reports invalid number token", () => {
//     const result = parseCTag(textNode("-"));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "Expected JSON number", span: { start: 0, end: 1 } }],
//     });
//   });

//   it("reports unterminated block comments at start and after a value", () => {
//     expect(parseCTag(textNode("/* open"))).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Expected closing '*/' for block comment",
//           span: {
//             start: 0,
//             end: 7,
//           },
//         },
//       ],
//     });

//     expect(parseCTag(textNode("1 /* open"))).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Expected closing '*/' for block comment",
//           span: {
//             start: 2,
//             end: 9,
//           },
//         },
//       ],
//     });
//   });

//   it("still reports structural errors with comments in between tokens", () => {
//     const result = parseCTag(textNode("[1 /* gap */ 2]"));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Expected ',' or ']'",
//         },
//       ],
//     });
//   });

//   it("reports duplicate object keys", () => {
//     const result = parseCTag(textNode('{"a": 1, "a": 2}'));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Duplicate object key 'a'",
//           span: {
//             start: 9,
//             end: 12,
//           },
//         },
//       ],
//     });
//   });

//   it("reports non-string object keys", () => {
//     const result = parseCTag(textNode("{1: 2}"));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "Expected JSON string" }],
//     });
//   });

//   it("recovers and reports multiple errors for inputs with multiple issues", () => {
//     const result = parseCTag(textNode('{"a": 1 "b": 2, c: 3}'));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Expected ',' or '}'",
//         },
//         {
//           message: "Expected JSON string",
//         },
//       ],
//     });

//     if (result.kind !== "error") {
//       throw new Error("Expected parse errors");
//     }
//     expect(result.errors.length >= 2).toBe(true);
//   });

//   it("recovers from repeated missing commas and reports each issue", () => {
//     const result = parseCTag(textNode("[1 2 3]"));

//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Expected ',' or ']'",
//         },
//         {
//           message: "Expected ',' or ']'",
//         },
//       ],
//     });

//     if (result.kind !== "error") {
//       throw new Error("Expected parse errors");
//     }
//     expect(result.errors.length >= 2).toBe(true);
//   });

//   it("recovers from unquoted keys and missing colons in object entries", () => {
//     const result = parseCTag(textNode("{a 1 b 2}"));

//     if (result.kind !== "error") {
//       throw new Error("Expected parse errors");
//     }

//     const messages = result.errors.map((error) => error.message);
//     expect(messages.includes("Expected JSON string")).toBe(true);
//     expect(messages.includes("Expected ':'")).toBe(true);
//     expect(messages.includes("Expected ',' or '}'")).toBe(true);
//     expect(result.errors.length >= 3).toBe(true);
//   });

//   it("recovers from extraneous colons before object/array closers", () => {
//     expect(parseCTag(textNode('{"a": 1:}'))).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Unexpected ':' before '}'",
//         },
//       ],
//     });

//     expect(parseCTag(textNode("[1:]"))).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Unexpected ':' before ']'",
//         },
//       ],
//     });
//   });
// });
