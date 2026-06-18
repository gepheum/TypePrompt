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
});
