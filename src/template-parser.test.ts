import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseTemplates } from "./template-parser.js";

function parseSingleTemplate(source: string) {
  const result = parseTemplates([{ path: "demo.prompts", content: source }]);
  expect(result).toMatch({ kind: "success" });
  if (result.kind !== "success") {
    throw new Error("Expected success");
  }
  const bundle = result.templates.Demo;
  if (!bundle) {
    throw new Error("Expected template named Demo");
  }
  if (bundle.kind === "variants") {
    throw new Error("Expected no-variants bundle");
  }
  return bundle.template;
}

function hiddenSchemaSource(body: string): string {
  return [
    '<template name="Demo">',
    '  <schema hide="true">',
    "    type Response = { value: string; };",
    "  </schema>",
    body,
    "</template>",
  ].join("\n");
}

function inlineHiddenSchemaSource(body: string): string {
  return `<template name="Demo"><schema hide="true">type Response = { value: string; };</schema>${body}</template>`;
}

describe("parseTemplates", () => {
  it("reports arg names that conflict by casing", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>",
      "    type Response = 'abc';",
      "  </schema>",
      '  <arg name="abC" />',
      '  <arg name="aBc" />',
      "</template>",
    ].join("\n");

    const result = parseTemplates([{ path: "demo.prompts", content: source }]);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Name 'aBc' conflicts with 'abC'",
          startPosition: {
            offset: source.indexOf('name="aBc"') + 'name="'.length,
          },
          endPosition: {
            offset: source.indexOf('name="aBc"') + 'name="aBc'.length,
          },
        },
      ],
    });
  });

  it("does not report arg casing ambiguity when casing is consistent", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>",
      "    type Response = 'abc';",
      "  </schema>",
      '  <arg name="abC" />',
      '  <arg name="abC" />',
      "</template>",
    ].join("\n");

    const result = parseTemplates([{ path: "demo.prompts", content: source }]);

    expect(result).toMatch({
      kind: "success",
    });
  });

  it("accepts a blank template body around a hidden schema", () => {
    const source = [
      '<template name="Demo">',
      '  <schema hide="true">',
      "    type Response = { value: string; };",
      "  </schema>",
      "",
      "  ",
      "</template>",
    ].join("\n");

    const result = parseTemplates([{ path: "demo.prompts", content: source }]);

    expect(result).toMatch({
      kind: "success",
    });
  });

  it("uses empty baseIndent when first text node has no EOL", () => {
    const template = parseSingleTemplate(inlineHiddenSchemaSource("  foo"));

    expect(template.content).toMatch([{ kind: "text", text: "  foo" }]);
  });

  it("uses empty baseIndent when first line has non-whitespace", () => {
    const template = parseSingleTemplate(
      inlineHiddenSchemaSource("foo\n  bar"),
    );

    expect(template.content).toMatch([{ kind: "text", text: "foo\n  bar" }]);
  });

  it("matches baseIndent example 2", () => {
    const template = parseSingleTemplate(
      inlineHiddenSchemaSource("  \n foo\n  bar"),
    );

    expect(template.content).toMatch([{ kind: "text", text: "foo\n bar" }]);
  });

  it("matches baseIndent example 3 (whitespace only)", () => {
    const template = parseSingleTemplate(
      inlineHiddenSchemaSource("  \n\n\n    "),
    );

    expect(template.content).toMatch([]);
  });

  it("matches baseIndent example 4", () => {
    const template = parseSingleTemplate(
      inlineHiddenSchemaSource("  \n\n\n  foo\n    "),
    );

    expect(template.content).toMatch([{ kind: "text", text: "foo" }]);
  });

  it("reports indentation errors when EOL is not followed by EOL or baseIndent", () => {
    const source = inlineHiddenSchemaSource("  \n  foo\n bar");

    const result = parseTemplates([{ path: "demo.prompts", content: source }]);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected indentation '  ' after end-of-line",
        },
      ],
    });
  });

  it("removes leading and trailing empty lines from content", () => {
    const template = parseSingleTemplate(hiddenSchemaSource("\n\n  foo\n\n"));

    expect(template.content).toMatch([{ kind: "text", text: "foo" }]);
  });

  it("keeps arg pieces while trimming boundary empty lines", () => {
    const source = [
      '<template name="Demo">',
      '  <schema hide="true">',
      "    type Response = { value: string; };",
      "  </schema>",
      "",
      '  <arg name="value" />',
      "",
      "</template>",
    ].join("\n");

    const template = parseSingleTemplate(source);
    expect(template.content).toMatch([{ kind: "arg", name: "value" }]);
  });

  it("sets xmlContent to the raw content between template tags", () => {
    const source = [
      '<template name="Demo">',
      '  <schema hide="true">type Response = { value: string; };</schema>',
      '  before <arg name="value" /> after',
      "</template>",
    ].join("\n");

    const template = parseSingleTemplate(source);
    const openTagEnd = source.indexOf(">") + 1;
    const closeTagStart = source.lastIndexOf("</template>");

    expect(template.xmlContent).toBe(source.slice(openTagEnd, closeTagStart));
  });

  it("keeps leading and trailing whitespace in xmlContent", () => {
    const source = [
      '<template name="Demo">',
      "",
      '  <schema hide="true">type Response = { value: string; };</schema>',
      "  text",
      "",
      "</template>",
    ].join("\n");

    const template = parseSingleTemplate(source);

    expect(template.xmlContent.startsWith("\n\n")).toBe(true);
    expect(template.xmlContent.endsWith("\n")).toBe(true);
  });

  it("xmlContent includes nested element markup", () => {
    const source = [
      '<template name="Demo">',
      '  <schema hide="true">type Response = { value: string; };</schema>',
      '  <example type="Response">{"value":"x"}</example>',
      "</template>",
    ].join("\n");

    const template = parseSingleTemplate(source);

    expect(template.xmlContent.includes('<example type="Response">')).toBe(
      true,
    );
    expect(template.xmlContent.includes("</example>")).toBe(true);
  });
});
