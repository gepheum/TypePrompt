import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { z } from "zod";

import { checkXmlAttributes, expectOneOf } from "./xml-attributes-checker.js";
import { parseXmlDocument } from "./xml-parser.js";
import type { ElementNode } from "./xml-types.js";

function parseElement(xml: string): ElementNode {
  const result = parseXmlDocument(xml);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

describe("checkXmlAttributes", () => {
  it("succeeds when all required attributes are present and valid", () => {
    const el = parseElement('<foo name="hello" count="42" />');
    const result = checkXmlAttributes(el, {
      name: { schema: z.string(), optional: false, expected: "a string" },
      count: {
        schema: z.string().regex(/^\d+$/),
        optional: false,
        expected: "a number",
      },
    });

    expect(result).toMatch({
      kind: "success",
      attributes: {
        name: { value: { text: "hello" } },
        count: { value: { text: "42" } },
      },
    });
  });

  it("returns the decoded attribute value in success attributes", () => {
    const el = parseElement('<foo title="a &amp; b" />');
    const result = checkXmlAttributes(el, {
      title: {
        schema: z.string(),
        optional: false,
        expected: "a string",
      },
    });

    expect(result).toMatch({
      kind: "success",
      attributes: { title: { value: { text: "a & b" } } },
    });
  });

  it("succeeds with an empty expected schema on an element with no attributes", () => {
    const el = parseElement("<foo />");
    const result = checkXmlAttributes(el, {});

    expect(result).toMatch({ kind: "success", attributes: {} });
  });

  it("reports an error for a missing required attribute", () => {
    const input = '<foo count="1" />';
    const el = parseElement(input);
    const result = checkXmlAttributes(el, {
      name: {
        schema: z.string(),
        optional: false,
        expected: "a string",
      },
      count: {
        schema: z.string(),
        optional: false,
        expected: "a string",
      },
    });

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Missing required attribute 'name'" }],
    });
  });

  it("positions a missing-attribute error at the tag name", () => {
    const input = "  <foo />";
    const el = parseElement(input);
    const result = checkXmlAttributes(el, {
      name: {
        schema: z.string(),
        optional: false,
        expected: "a string",
      },
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: {
            start: input.indexOf("foo"),
            end: input.indexOf("foo") + "foo".length,
          },
        },
      ],
    });
  });

  it("reports an error for an unexpected attribute", () => {
    const input = '<foo name="x" extra="y" />';
    const el = parseElement(input);
    const result = checkXmlAttributes(el, {
      name: {
        schema: z.string(),
        optional: false,
        expected: "a string",
      },
    });

    expect(result).toMatch({
      kind: "partial",
      errors: [{ message: "Unexpected attribute 'extra'" }],
    });
  });

  it("positions an unexpected-attribute error at the attribute value span", () => {
    const input = '<foo extra="y" />';
    const el = parseElement(input);
    const result = checkXmlAttributes(el, {});

    expect(result).toMatch({
      kind: "partial",
      errors: [
        {
          span: {
            start: input.indexOf("extra"),
            end: input.indexOf("extra") + "extra".length,
          },
        },
      ],
    });
  });

  it("reports an error when an attribute value fails schema validation", () => {
    const input = '<foo count="abc" />';
    const el = parseElement(input);
    const result = checkXmlAttributes(el, {
      count: {
        schema: z.string().regex(/^\d+$/),
        optional: false,
        expected: "a number",
      },
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: /^Invalid value for attribute 'count': expected a number/ },
      ],
    });
  });

  it("positions a schema-validation error at the attribute value span", () => {
    const input = '<foo count="abc" />';
    const el = parseElement(input);
    const result = checkXmlAttributes(el, {
      count: {
        schema: z.string().regex(/^\d+$/),
        optional: false,
        expected: "a number",
      },
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: {
            start: input.indexOf("abc"),
            end: input.indexOf("abc") + "abc".length,
          },
        },
      ],
    });
  });

  it("succeeds when an optional attribute is present and valid", () => {
    const el = parseElement('<foo title="hi" />');
    const result = checkXmlAttributes(el, {
      title: { schema: z.string(), optional: true, expected: "a string" },
    });

    expect(result).toMatch({
      kind: "success",
      attributes: { title: { value: { text: "hi", start: 12, end: 14 } } },
    });
  });

  it("succeeds with undefined when an optional attribute is absent", () => {
    const el = parseElement("<foo />");
    const result = checkXmlAttributes(el, {
      title: { schema: z.string(), optional: true, expected: "a string" },
    });

    expect(result).toMatch({
      kind: "success",
      attributes: { title: undefined },
    });
  });

  it("one error when there is both a missing and an unexpected attribute", () => {
    const input = '<foo unknown="x" />';
    const el = parseElement(input);
    const result = checkXmlAttributes(el, {
      name: {
        schema: z.string(),
        optional: false,
        expected: "a string",
      },
    });

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected attribute 'unknown'" }],
    });
  });

  it("is typesafe: infers string for required and string|undefined for optional", () => {
    const el = parseElement('<foo req="a" />');
    const result = checkXmlAttributes(el, {
      req: {
        schema: z.string(),
        optional: false,
        expected: "a string",
      },
      opt: {
        schema: z.string(),
        optional: true,
        expected: "a string",
      },
    });

    if (result.kind === "success") {
      // TypeScript should know attrs.req is string and attrs.opt is string|undefined.
      const req: string = result.attributes.req.value.text;
      const opt: string | undefined = result.attributes.opt?.value.text;
      expect(req).toBe("a");
      expect(opt).toBe(undefined);
    } else {
      throw new Error("Expected success");
    }
  });

  describe("oneOf", () => {
    it("succeeds when attribute matches one of the allowed values", () => {
      const el = parseElement('<foo format="json" />');
      const result = checkXmlAttributes(el, {
        format: expectOneOf({
          values: ["json", "text", "csv"],
          optional: true,
        }),
      });

      expect(result).toMatch({
        kind: "success",
        attributes: {
          format: { value: { text: "json" } },
        },
      });
    });

    it("succeeds with undefined when optional oneOf attribute is omitted", () => {
      const el = parseElement("<foo />");
      const result = checkXmlAttributes(el, {
        format: expectOneOf({
          values: ["json", "text", "csv"],
          optional: true,
        }),
      });

      expect(result).toMatch({
        kind: "success",
        attributes: { format: undefined },
      });
    });

    it("reports an error with suggestions when an attribute value fails oneOf validation", () => {
      const el = parseElement('<foo format="yaml" />');
      const result = checkXmlAttributes(el, {
        format: expectOneOf({
          values: ["json", "text", "csv"],
          optional: true,
        }),
      });

      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message:
              "Invalid value for attribute 'format': expected one of: 'json', 'text', 'csv'",
            suggestions: ["json", "text", "csv"],
          },
        ],
      });
    });
  });

  describe("suggestions in errors", () => {
    it("sets suggestions to entry.suggestions when an attribute value is invalid", () => {
      const el = parseElement('<foo mode="invalid" />');
      const result = checkXmlAttributes(el, {
        mode: expectOneOf({ values: ["fast", "accurate"], optional: true }),
      });

      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message:
              "Invalid value for attribute 'mode': expected one of: 'fast', 'accurate'",
            span: {
              start: 11,
              end: 18,
            },
            suggestions: ["fast", "accurate"],
          },
        ],
      });
    });

    it("sets suggestions to missingAttributes for unexpected attributes when required attributes are missing", () => {
      const el = parseElement('<foo unexpected="bar" />');
      const result = checkXmlAttributes(el, {
        name: {
          schema: z.string(),
          optional: false,
          expected: "a string",
        },
        target: {
          schema: z.string(),
          optional: false,
          expected: "a string",
        },
      });

      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            message: "Unexpected attribute 'unexpected'",
            span: {
              start: 5,
              end: 15,
            },
            suggestions: ["name", "target"],
          },
        ],
      });
    });
  });
});
