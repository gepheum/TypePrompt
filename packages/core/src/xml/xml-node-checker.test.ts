import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { InternalError } from "../util/shared-types.js";
import { checkAllAreElements, checkTag } from "./xml-node-checker.js";
import { parseXmlDocument } from "./xml-parser.js";
import type { ElementNode } from "./xml-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseElement(xml: string): ElementNode {
  const result = parseXmlDocument(xml);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

// ---------------------------------------------------------------------------
// checkAllAreElements
// ---------------------------------------------------------------------------

describe("checkAllAreElements", () => {
  it("succeeds when all children are allowed element tags", () => {
    const root = parseElement("<root><item name='1'/><other/></root>");
    const errors: InternalError[] = [];
    const result = checkAllAreElements(
      root.children,
      ["item", "other"] as const,
      "",
      errors,
    );

    expect({
      tags: result.map(([tag]) => tag),
      errors,
    }).toMatch({
      tags: ["item", "other"],
      errors: [],
    });
  });

  it("ignores whitespace-only text nodes between elements", () => {
    const root = parseElement(`
      <root>
        <item/>
        <other/>
      </root>
    `);
    const errors: InternalError[] = [];
    const result = checkAllAreElements(
      root.children,
      ["item", "other"] as const,
      "",
      errors,
    );

    expect({
      tags: result.map(([tag]) => tag),
      errors,
    }).toMatch({
      tags: ["item", "other"],
      errors: [],
    });
  });

  it("returns an empty array when given an empty node list", () => {
    const errors: InternalError[] = [];
    const result = checkAllAreElements([], ["item"] as const, "", errors);

    expect({ result, errors }).toMatch({
      result: [],
      errors: [],
    });
  });

  it("returns an empty array when element contains only whitespace text", () => {
    const root = parseElement("<root>   \n\t  </root>");
    const errors: InternalError[] = [];
    const result = checkAllAreElements(
      root.children,
      ["item"] as const,
      "",
      errors,
    );

    expect({ result, errors }).toMatch({
      result: [],
      errors: [],
    });
  });

  it("reports an error for non-whitespace text content with empty suffix", () => {
    const root = parseElement("<root>unexpected text<item/></root>");
    const errors: InternalError[] = [];
    const result = checkAllAreElements(
      root.children,
      ["item"] as const,
      "",
      errors,
    );

    expect({
      tags: result.map(([tag]) => tag),
      errors,
    }).toMatch({
      tags: ["item"],
      errors: [
        {
          message: "Unexpected text content",
          span: { start: 6, end: 21 },
        },
      ],
    });
  });

  it("reports an error for non-whitespace text content with custom messageSuffix", () => {
    const root = parseElement("<root>unexpected text</root>");
    const errors: InternalError[] = [];
    const result = checkAllAreElements(
      root.children,
      ["item"] as const,
      " in <template>",
      errors,
    );

    expect({
      result,
      errors,
    }).toMatch({
      result: [],
      errors: [
        {
          message: "Unexpected text content in <template>",
        },
      ],
    });
  });

  it("reports an error for an unexpected element tag with suggestions and tag span", () => {
    const input = "<root><unknown/><item/></root>";
    const root = parseElement(input);
    const errors: InternalError[] = [];
    const result = checkAllAreElements(
      root.children,
      ["item", "other"] as const,
      "",
      errors,
    );

    expect({
      tags: result.map(([tag]) => tag),
      errors,
    }).toMatch({
      tags: ["item"],
      errors: [
        {
          span: {
            start: input.indexOf("unknown"),
            end: input.indexOf("unknown") + "unknown".length,
          },
          message: "Unexpected element <unknown>",
          suggestions: ["item", "other"],
        },
      ],
    });
  });

  it("reports an error for an unexpected element tag with custom messageSuffix", () => {
    const root = parseElement("<root><forbidden/></root>");
    const errors: InternalError[] = [];
    const result = checkAllAreElements(
      root.children,
      ["allowed"] as const,
      " inside <group>",
      errors,
    );

    expect({
      result,
      errors,
    }).toMatch({
      result: [],
      errors: [
        {
          message: "Unexpected element <forbidden> inside <group>",
          suggestions: ["allowed"],
        },
      ],
    });
  });

  it("reports multiple independent errors for both unexpected text and elements", () => {
    const root = parseElement("<root>text1<bad1/>text2<bad2/></root>");
    const errors: InternalError[] = [];
    const result = checkAllAreElements(
      root.children,
      ["good"] as const,
      "",
      errors,
    );

    expect({
      result,
      errors,
    }).toMatch({
      result: [],
      errors: [
        { message: "Unexpected text content" },
        { message: "Unexpected element <bad1>" },
        { message: "Unexpected text content" },
        { message: "Unexpected element <bad2>" },
      ],
    });
  });

  it("throws an error when messageSuffix is non-empty and does not start with a space", () => {
    const root = parseElement("<root><item/></root>");
    const errors: InternalError[] = [];
    let thrownError: Error | null = null;
    try {
      checkAllAreElements(
        root.children,
        ["item"] as const,
        "without-space",
        errors,
      );
    } catch (err) {
      thrownError = err as Error;
    }

    expect(thrownError).toMatch({
      message: "messageSuffix must start with a space",
    });
  });
});

// ---------------------------------------------------------------------------
// checkTag
// ---------------------------------------------------------------------------

describe("checkTag", () => {
  it("returns the tag name when node tag is in the allowed list", () => {
    const el = parseElement("<item name='foo'/>");
    const errors: InternalError[] = [];
    const tag = checkTag(el, ["item", "other"] as const, "", errors);

    expect({ tag, errors }).toMatch({
      tag: "item",
      errors: [],
    });
  });

  it("returns null and reports an error with span and suggestions when tag is not allowed", () => {
    const input = "  <bad-tag/>";
    const el = parseElement(input);
    const errors: InternalError[] = [];
    const tag = checkTag(el, ["first", "second"] as const, "", errors);

    expect({ tag, errors }).toMatch({
      tag: null,
      errors: [
        {
          span: {
            start: input.indexOf("bad-tag"),
            end: input.indexOf("bad-tag") + "bad-tag".length,
          },
          message: "Unexpected element <bad-tag>",
          suggestions: ["first", "second"],
        },
      ],
    });
  });

  it("reports an error with custom messageSuffix when tag is not allowed", () => {
    const el = parseElement("<unknown/>");
    const errors: InternalError[] = [];
    const tag = checkTag(el, ["expected"] as const, " in <container>", errors);

    expect({ tag, errors }).toMatch({
      tag: null,
      errors: [
        {
          message: "Unexpected element <unknown> in <container>",
          suggestions: ["expected"],
        },
      ],
    });
  });

  it("throws an error when messageSuffix is non-empty and does not start with a space", () => {
    const el = parseElement("<item/>");
    const errors: InternalError[] = [];
    let thrownError: Error | null = null;
    try {
      checkTag(el, ["item"] as const, "invalid-suffix", errors);
    } catch (err) {
      thrownError = err as Error;
    }

    expect(thrownError).toMatch({
      message: "messageSuffix must start with a space",
    });
  });
});
