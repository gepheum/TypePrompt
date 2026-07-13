import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { z } from "zod";

import { checkXmlAttributes } from "./xml-attributes-checker.js";
import { parseXmlDocument } from "./xml-parser.js";
import type { ElementNode } from "./xml-types.js";

function parseElement(xml: string): ElementNode {
  const result = parseXmlDocument(xml);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  for (const node of result.root.children) {
    if (node.kind === "element") {
      return node;
    }
  }
  throw new Error("No element node found");
}

describe("checkXmlAttributes", () => {
  it("succeeds when all required attributes are present and valid", () => {
    const el = parseElement('<foo name="hello" count="42" />');
    const result = checkXmlAttributes(el, {
      name: { schema: z.string(), expected: "a string" },
      count: { schema: z.string().regex(/^\d+$/), expected: "a number" },
    });

    expect(result).toMatch({
      kind: "success",
      attributes: { name: { value: "hello" }, count: { value: "42" } },
    });
  });

  it("returns the decoded attribute value in success attributes", () => {
    const el = parseElement('<foo title="a &amp; b" />');
    const result = checkXmlAttributes(el, {
      title: { schema: z.string(), expected: "a string" },
    });

    expect(result).toMatch({
      kind: "success",
      attributes: { title: { value: "a & b" } },
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
      name: { schema: z.string(), expected: "a string" },
      count: { schema: z.string(), expected: "a string" },
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
      name: { schema: z.string(), expected: "a string" },
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          start: input.indexOf("foo"),
          end: input.indexOf("foo") + "foo".length,
        },
      ],
    });
  });

  it("reports an error for an unexpected attribute", () => {
    const input = '<foo name="x" extra="y" />';
    const el = parseElement(input);
    const result = checkXmlAttributes(el, {
      name: { schema: z.string(), expected: "a string" },
    });

    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected attribute 'extra'" }],
    });
  });

  it("positions an unexpected-attribute error at the attribute value span", () => {
    const input = '<foo extra="y" />';
    const el = parseElement(input);
    const result = checkXmlAttributes(el, {});

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          start: input.indexOf("y"),
          end: input.indexOf("y") + "y".length,
        },
      ],
    });
  });

  it("reports an error when an attribute value fails schema validation", () => {
    const input = '<foo count="abc" />';
    const el = parseElement(input);
    const result = checkXmlAttributes(el, {
      count: { schema: z.string().regex(/^\d+$/), expected: "a number" },
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
      count: { schema: z.string().regex(/^\d+$/), expected: "a number" },
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          start: input.indexOf("abc"),
          end: input.indexOf("abc") + "abc".length,
        },
      ],
    });
  });

  it("succeeds when an optional attribute is present and valid", () => {
    const el = parseElement('<foo title="hi" />');
    const result = checkXmlAttributes(el, {
      title: { schema: z.string().optional(), expected: "a string" },
    });

    expect(result).toMatch({
      kind: "success",
      attributes: { title: { value: "hi" } },
    });
  });

  it("succeeds with undefined when an optional attribute is absent", () => {
    const el = parseElement("<foo />");
    const result = checkXmlAttributes(el, {
      title: { schema: z.string().optional(), expected: "a string" },
    });

    expect(result).toMatch({
      kind: "success",
      attributes: { title: undefined },
    });
  });

  it("reports errors for both a missing required and an unexpected attribute", () => {
    const input = '<foo unknown="x" />';
    const el = parseElement(input);
    const result = checkXmlAttributes(el, {
      name: { schema: z.string(), expected: "a string" },
    });

    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Unexpected attribute 'unknown'" },
        { message: "Missing required attribute 'name'" },
      ],
    });
  });

  it("is typesafe: infers string for required and string|undefined for optional", () => {
    const el = parseElement('<foo req="a" />');
    const result = checkXmlAttributes(el, {
      req: { schema: z.string(), expected: "a string" },
      opt: { schema: z.string().optional(), expected: "a string" },
    });

    if (result.kind === "success") {
      // TypeScript should know attrs.req is string and attrs.opt is string|undefined.
      const req: string = result.attributes.req.value;
      const opt: string | undefined = result.attributes.opt?.value;
      expect(req).toBe("a");
      expect(opt).toBe(undefined);
    } else {
      throw new Error("Expected success");
    }
  });
});
