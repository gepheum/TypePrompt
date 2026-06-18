import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseTemplates } from "./template-parser.js";

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

  it("dedents top-level text using the first content line", () => {
    const source = [
      '<template name="Demo">',
      '  <schema hide="true">',
      "    type Response = { value: string; };",
      "  </schema>",
      "",
      "    Hello",
      "    world",
      "</template>",
    ].join("\n");

    const result = parseTemplates([{ path: "demo.prompts", content: source }]);

    expect(result).toMatch({
      kind: "success",
    });
  });

  it("dedents text after an arg piece on the same indentation level", () => {
    const source = [
      '<template name="Demo">',
      '  <schema hide="true">',
      "    type Response = { value: string; };",
      "  </schema>",
      "",
      '  <arg name="value" />',
      "  Hello",
      "  world",
      "</template>",
    ].join("\n");

    const result = parseTemplates([{ path: "demo.prompts", content: source }]);

    expect(result).toMatch({
      kind: "success",
    });
  });

  it("accepts tab-indented template bodies", () => {
    const source = [
      '<template name="Demo">',
      '\t<schema hide="true">',
      "\t\ttype Response = { value: string; };",
      "\t</schema>",
      "",
      "\t\tHello",
      "\t\tworld",
      "</template>",
    ].join("\n");

    const result = parseTemplates([{ path: "demo.prompts", content: source }]);

    expect(result).toMatch({
      kind: "success",
    });
  });

  it("reports a line that is not indented enough after dedent", () => {
    const source = [
      '<template name="Demo">',
      '  <schema hide="true">',
      "    type Response = { value: string; };",
      "  </schema>",
      "",
      "    Hello",
      "  world",
      "</template>",
    ].join("\n");

    const result = parseTemplates([{ path: "demo.prompts", content: source }]);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected line to start with template indent '    '",
        },
      ],
    });
  });

  it("reports a leading body line that does not match the dedent indent", () => {
    const source = [
      '<template name="Demo">',
      '  <schema hide="true">',
      "    type Response = { value: string; };",
      "  </schema>",
      "",
      "    Hello",
      "   world",
      "</template>",
    ].join("\n");

    const result = parseTemplates([{ path: "demo.prompts", content: source }]);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected line to start with template indent '    '",
        },
      ],
    });
  });

  it("allows internal blank lines without reporting indentation errors", () => {
    const source = [
      '<template name="Demo">',
      '  <schema hide="true">',
      "    type Response = { value: string; };",
      "  </schema>",
      "",
      "    Hello",
      "",
      "    world",
      "",
      "</template>",
    ].join("\n");

    const result = parseTemplates([{ path: "demo.prompts", content: source }]);

    expect(result).toMatch({
      kind: "success",
    });
  });
});
