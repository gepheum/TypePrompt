import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { MappedText } from "../util/shared-types.js";
import { parseExpression } from "./expression-parser.js";

function textNode(source: string): MappedText {
  return {
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

const NO_CONTEXT = { hasValContext: false as const };
const WITH_CONTEXT = { hasValContext: true as const };

// ---------------------------------------------------------------------------
// Success - base expressions
// ---------------------------------------------------------------------------

describe("parseExpression - base expressions", () => {
  it("parses 'input'", () => {
    expect(parseExpression(textNode("input"), NO_CONTEXT)).toMatch({
      kind: "success",
      expression: { kind: "input" },
    });
  });

  it("parses 'it' when hasValContext is true", () => {
    expect(parseExpression(textNode("it"), WITH_CONTEXT)).toMatch({
      kind: "success",
      expression: { kind: "it" },
    });
  });

  it("records the full-path span for 'input'", () => {
    expect(parseExpression(textNode("input"), NO_CONTEXT)).toMatch({
      kind: "success",
      expression: { fullPath: { text: "input", start: 0, end: 5 } },
    });
  });

  it("records the full-path span for 'it'", () => {
    expect(parseExpression(textNode("it"), WITH_CONTEXT)).toMatch({
      kind: "success",
      expression: { fullPath: { text: "it", start: 0, end: 2 } },
    });
  });
});

// ---------------------------------------------------------------------------
// Success - property chains
// ---------------------------------------------------------------------------

describe("parseExpression - property chains", () => {
  it("parses 'input.name' as a property access", () => {
    expect(parseExpression(textNode("input.name"), NO_CONTEXT)).toMatch({
      kind: "success",
      expression: {
        kind: "property",
        left: { kind: "input" },
        property: { text: "name" },
        fullPath: { text: "input.name" },
      },
    });
  });

  it("parses 'input.first.last' as a nested property chain", () => {
    expect(parseExpression(textNode("input.first.last"), NO_CONTEXT)).toMatch({
      kind: "success",
      expression: {
        kind: "property",
        left: {
          kind: "property",
          left: { kind: "input" },
          property: { text: "first" },
        },
        property: { text: "last" },
        fullPath: { text: "input.first.last" },
      },
    });
  });

  it("parses 'it.field' with hasValContext", () => {
    expect(parseExpression(textNode("it.field"), WITH_CONTEXT)).toMatch({
      kind: "success",
      expression: {
        kind: "property",
        left: { kind: "it" },
        property: { text: "field" },
      },
    });
  });

  it("records the property span with correct offsets", () => {
    // "input.name": property starts at 6, ends at 10
    expect(parseExpression(textNode("input.name"), NO_CONTEXT)).toMatch({
      kind: "success",
      expression: { property: { text: "name", start: 6, end: 10 } },
    });
  });

  it("fullPath grows with each property added", () => {
    expect(parseExpression(textNode("input.a.b"), NO_CONTEXT)).toMatch({
      kind: "success",
      expression: { fullPath: { text: "input.a.b", start: 0, end: 9 } },
    });
  });
});

// ---------------------------------------------------------------------------
// Success - source position remapping
// ---------------------------------------------------------------------------

describe("parseExpression - source position remapping", () => {
  it("remaps the input span via the offsetMap", () => {
    const content: MappedText = {
      text: "input",
      offsetMap: [{ textPosition: 0, sourcePosition: 10 }],
    };
    expect(parseExpression(content, NO_CONTEXT)).toMatch({
      kind: "success",
      expression: { fullPath: { start: 10, end: 15 } },
    });
  });

  it("remaps property spans via the offsetMap", () => {
    const content: MappedText = {
      text: "input.name",
      offsetMap: [{ textPosition: 0, sourcePosition: 5 }],
    };
    expect(parseExpression(content, NO_CONTEXT)).toMatch({
      kind: "success",
      expression: { property: { start: 11, end: 15 } },
    });
  });
});

// ---------------------------------------------------------------------------
// Errors - base expression not matched
// ---------------------------------------------------------------------------

describe("parseExpression - base not matched", () => {
  it("reports 'Expected input' for empty input (no context)", () => {
    expect(parseExpression(textNode(""), NO_CONTEXT)).toMatch({
      kind: "error",
      errors: [{ message: "Expected 'input'", suggestions: ["input"] }],
    });
  });

  it("reports 'Expected input or it' for empty input (with context)", () => {
    expect(parseExpression(textNode(""), WITH_CONTEXT)).toMatch({
      kind: "error",
      errors: [
        { message: "Expected 'input' or 'it'", suggestions: ["input", "it"] },
      ],
    });
  });

  it("reports an error for an unrecognised identifier", () => {
    expect(parseExpression(textNode("foo"), NO_CONTEXT)).toMatch({
      kind: "error",
      errors: [{ message: "Expected 'input'" }],
    });
  });

  it("does not match 'input' when followed by alphanumeric characters", () => {
    // 'inputExtra' — lookahead '(?![a-zA-Z0-9])' prevents matching 'input' here
    expect(parseExpression(textNode("inputExtra"), NO_CONTEXT)).toMatch({
      kind: "error",
    });
  });

  it("does not match 'it' when followed by alphanumeric characters", () => {
    expect(parseExpression(textNode("itself"), WITH_CONTEXT)).toMatch({
      kind: "error",
    });
  });
});

// ---------------------------------------------------------------------------
// Errors - 'it' without context
// ---------------------------------------------------------------------------

describe("parseExpression - 'it' without context", () => {
  it("rejects 'it' when hasValContext is false", () => {
    expect(parseExpression(textNode("it"), NO_CONTEXT)).toMatch({
      kind: "error",
      errors: [{ message: '"it" not allowed here' }],
    });
  });

  it("rejects 'it.field' when hasValContext is false", () => {
    expect(parseExpression(textNode("it.field"), NO_CONTEXT)).toMatch({
      kind: "error",
      errors: [{ message: '"it" not allowed here' }],
    });
  });
});

// ---------------------------------------------------------------------------
// Errors - property chain
// ---------------------------------------------------------------------------

describe("parseExpression - property chain errors", () => {
  it("reports an error for a trailing dot with no identifier", () => {
    expect(parseExpression(textNode("input."), NO_CONTEXT)).toMatch({
      kind: "error",
      errors: [{ message: "Expected: camelCase identifier" }],
    });
  });

  it("reports an error when the property identifier starts with uppercase", () => {
    expect(parseExpression(textNode("input.Name"), NO_CONTEXT)).toMatch({
      kind: "error",
      errors: [{ message: "Expected: camelCase identifier" }],
    });
  });

  it("reports an error when the property identifier starts with a digit", () => {
    expect(parseExpression(textNode("input.1name"), NO_CONTEXT)).toMatch({
      kind: "error",
      errors: [{ message: "Expected: camelCase identifier" }],
    });
  });

  it("reports an error when the property identifier contains an underscore", () => {
    // "input.my_field": IDENTIFIER_PATTERN matches "my", then text[pos]='_'
    expect(parseExpression(textNode("input.my_field"), NO_CONTEXT)).toMatch({
      kind: "error",
      errors: [{ message: "Identifier must not contain underscores" }],
    });
  });

  it("reports an error when a non-dot character follows the base", () => {
    expect(parseExpression(textNode("input foo"), NO_CONTEXT)).toMatch({
      kind: "error",
      errors: [{ message: "Expected '.'" }],
    });
  });

  it("reports an error when a non-dot character follows a property", () => {
    expect(parseExpression(textNode("input.name!"), NO_CONTEXT)).toMatch({
      kind: "error",
      errors: [{ message: "Expected '.'" }],
    });
  });

  it("reports an error when a dot has only whitespace after it", () => {
    expect(parseExpression(textNode("input. name"), NO_CONTEXT)).toMatch({
      kind: "error",
      errors: [{ message: "Expected: camelCase identifier" }],
    });
  });
});
