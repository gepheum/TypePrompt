import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { formatError, makeCyan } from "./error-renderer.js";
import type { RenderableError } from "./renderable-error.js";

describe("error-renderer", () => {
  it("formats standard error without base schema", () => {
    const error: RenderableError = {
      path: "prompts/test.xml",
      message: "Syntax error",
      start: {
        line: {
          line: '<template name="test">',
          zeroBasedLineNumber: 0,
          linePosition: 0,
        },
        zeroBasedColNumber: 1,
      },
      end: {
        line: {
          line: '<template name="test">',
          zeroBasedLineNumber: 0,
          linePosition: 0,
        },
        zeroBasedColNumber: 9,
      },
    };

    const formatted = formatError(error, "error");
    expect(formatted.includes("prompts/test.xml")).toBe(true);
    expect(formatted.includes("Syntax error")).toBe(true);
    expect(formatted.includes('<template name="test">')).toBe(true);
  });

  it("renders base schema in cyan under the error message when present", () => {
    const baseSchemaText =
      "type Input = { text: string; };\ntype Output = string;";
    const error: RenderableError = {
      path: "prompts/Translate.xml",
      message: "Schema does not match base",
      baseSchema: baseSchemaText,
      start: {
        line: {
          line: "  <schema>",
          zeroBasedLineNumber: 2,
          linePosition: 0,
        },
        zeroBasedColNumber: 2,
      },
      end: {
        line: {
          line: "  </schema>",
          zeroBasedLineNumber: 5,
          linePosition: 0,
        },
        zeroBasedColNumber: 11,
      },
    };

    const formatted = formatError(error, "error");
    expect(formatted.includes("prompts/Translate.xml")).toBe(true);
    expect(formatted.includes("Schema does not match base")).toBe(true);
    expect(formatted.includes(makeCyan(baseSchemaText))).toBe(true);
  });
});
