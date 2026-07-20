import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { InternalErrors } from "../util/common-types.js";
import { parseXmlDocument } from "./xml-parser.js";
import type { ElementNode, XmlDocument } from "./xml-types.js";

function expectSuccess(result: XmlDocument | InternalErrors): XmlDocument {
  expect(result).toMatch({ kind: "success" });
  if (result.kind !== "success") {
    throw new Error(
      `Expected success, got errors: ${JSON.stringify(result.errors)}`,
    );
  }
  return result;
}

function expectError(result: XmlDocument | InternalErrors): InternalErrors {
  expect(result).toMatch({ kind: "error" });
  if (result.kind !== "error") {
    throw new Error("Expected parse errors");
  }
  return result;
}

describe("parseXmlDocument", () => {
  it("parses an empty document", () => {
    expect(parseXmlDocument("")).toMatch({
      kind: "success",
      root: { children: [] },
    });
  });

  it("tracks tag offsets when first element starts after leading whitespace", () => {
    const input = " <foo/>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[1] as ElementNode;

    expect(root).toMatch({
      kind: "element",
      tag: {
        text: "foo",
        start: 2,
        end: 5,
      },
      isSelfClosing: true,
      children: [],
    });
  });

  it("parses nested elements, attributes, text, and self-closing tags", () => {
    const input =
      'before<root a="1" b=\'two\'>mid<child x="y"/>after</root>tail';
    const result = expectSuccess(parseXmlDocument(input));

    expect(result).toMatch({
      kind: "success",
      root: {
        children: [
          {
            text: "before",
          },
          {
            kind: "element",
            tag: {
              text: "root",
            },
            isSelfClosing: false,
            attributes: {
              a: {
                name: { text: "a" },
                value: { text: "1" },
              },
              b: {
                name: { text: "b" },
                value: { text: "two" },
              },
            },
            children: [
              { text: "mid" },
              {
                kind: "element",
                tag: { text: "child" },
                isSelfClosing: true,
                attributes: {
                  x: {
                    name: { text: "x" },
                    value: { text: "y" },
                  },
                },
                children: [],
              },
              { text: "after" },
            ],
          },
          { text: "tail" },
        ],
      },
    });
  });

  it("skips comments and processing instructions", () => {
    const input =
      '<?xml version="1.0"?><root><!--comment--><?pi target?>ok</root>';
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root).toMatch({
      kind: "element",
      tag: { text: "root" },
      isSelfClosing: false,
      children: [{ text: "ok" }],
    });
  });

  it("keeps distinct text nodes separated by a comment", () => {
    const input = "<foo>abc<!--\n    -->bcd</foo>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root).toMatch({
      kind: "element",
      tag: { text: "foo" },
      isSelfClosing: false,
      children: [{ text: "abc" }, { text: "bcd" }],
    });
  });

  it("skips CDATA sections (no child node emitted)", () => {
    const input = "<root><![CDATA[a<b>c]]></root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children).toMatch([]);
  });

  it("preserves raw entity text in text nodes and attribute values", () => {
    const input = '<root a="1 &amp; 2">x &amp; y</root>';
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root).toMatch({
      attributes: {
        a: {
          name: {
            text: "a",
          },
          value: {
            text: "1 & 2",
          },
        },
      },
      children: [
        {
          kind: "text",
          text: "x & y",
          offsetMap: [
            {
              decodedOffset: 0,
              sourceOffset: input.indexOf("x &amp; y"),
            },
            {
              decodedOffset: 2,
              sourceOffset: input.indexOf("&amp;", input.indexOf("x &amp; y")),
            },
            {
              decodedOffset: 3,
              sourceOffset:
                input.indexOf("&amp;", input.indexOf("x &amp; y")) +
                "&amp;".length,
            },
          ],
        },
      ],
    });
  });

  it("decodes escaped and numeric entities in attribute values", () => {
    const input = '<root a="x &lt; y" b="&#65;&#x42;" />';
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root).toMatch({
      attributes: {
        a: {
          value: { text: "x < y" },
        },
        b: {
          value: { text: "AB" },
        },
      },
      isSelfClosing: true,
    });
  });

  it("tracks whether elements are self-closing", () => {
    const input = "<a/><b></b>";
    const result = expectSuccess(parseXmlDocument(input));

    expect(result.root.children).toMatch([
      {
        kind: "element",
        tag: { text: "a" },
        isSelfClosing: true,
        children: [],
      },
      {
        kind: "element",
        tag: { text: "b" },
        isSelfClosing: false,
        children: [],
      },
    ]);
  });

  it("parses > inside quoted attribute values", () => {
    const input = '<root a="x > y"><child/></root>';
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root).toMatch({
      tag: { text: "root" },
      isSelfClosing: false,
      attributes: {
        a: {
          value: { text: "x > y" },
        },
      },
      children: [
        {
          kind: "element",
          tag: { text: "child" },
          isSelfClosing: true,
          children: [],
        },
      ],
    });
  });

  it("decodes numeric entities and builds offset map segments", () => {
    const input = "<root>&#65; &#x42;</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;
    const textStart = input.indexOf("&#65; &#x42;");
    const firstEntityStart = input.indexOf("&#65;", textStart);
    const firstEntityEnd = firstEntityStart + "&#65;".length;
    const secondEntityStart = input.indexOf("&#x42;", textStart);
    const secondEntityEnd = secondEntityStart + "&#x42;".length;

    expect(root.children[0]).toMatch({
      kind: "text",
      text: "A B",
      offsetMap: [
        {
          decodedOffset: 0,
          sourceOffset: firstEntityStart,
        },
        {
          decodedOffset: 1,
          sourceOffset: firstEntityEnd,
        },
        {
          decodedOffset: 2,
          sourceOffset: secondEntityStart,
        },
        {
          decodedOffset: 3,
          sourceOffset: secondEntityEnd,
        },
      ],
    });
  });

  it("reports undefined entities", () => {
    const result = expectError(parseXmlDocument("<root>&bad;</root>"));

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "undefined entity.",
        },
      ],
    });
  });

  it("reports malformed character entities", () => {
    const result = expectError(parseXmlDocument("<root>&#zz;</root>"));

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "malformed character entity.",
        },
      ],
    });
  });

  it("skips CDATA sections (cursor advances past closing ]]>)", () => {
    // Verify that content after the CDATA section is still parsed.
    const input = "<root><![CDATA[ignored]]>after</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children).toMatch([{ kind: "text", text: "after" }]);
  });

  it("reports an unexpected closing tag", () => {
    const result = expectError(parseXmlDocument("</root>"));

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: 0, end: 7 },
          message: "Unexpected closing tag '</root>'",
        },
      ],
    });
  });

  it("reports a mismatched closing tag", () => {
    const result = expectError(parseXmlDocument("<a><b></a>"));

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: 6, end: 10 },
          message: "Mismatched closing tag '</a>'; expected '</b>'",
        },
      ],
    });
  });

  it("reports an unclosed tag at end of input", () => {
    const result = expectError(parseXmlDocument("<a>"));

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: {
            start: 1,
            end: 2,
          },
          message: "Unclosed tag '<a>'",
        },
      ],
    });
  });

  it("reports an attribute without a value", () => {
    const result = expectError(parseXmlDocument("<a x></a>"));

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Attribute must have a value",
        },
      ],
    });
  });

  it("reports an unquoted attribute value", () => {
    const result = expectError(parseXmlDocument("<a x=y></a>"));

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Attribute value must be quoted",
        },
      ],
    });
  });

  it("reports multiple independent XML errors", () => {
    const result = expectError(parseXmlDocument("<a x=y><b></a></c>"));

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Attribute value must be quoted",
        },
        {
          message: "Mismatched closing tag '</a>'; expected '</b>'",
        },
        {
          message: "Unexpected closing tag '</c>'",
        },
      ],
    });
  });
});

describe("TextNode.allWhitespace", () => {
  it("is true for whitespace-only text", () => {
    const input = "<root>  \t\n  </root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children[0]).toMatch({ kind: "text", allWhitespace: true });
  });

  it("is false for non-whitespace text", () => {
    const input = "<root>hello</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children[0]).toMatch({ kind: "text", allWhitespace: false });
  });

  it("is false for text that starts and ends with whitespace but contains non-whitespace", () => {
    const input = "<root>  hello  </root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children[0]).toMatch({ kind: "text", allWhitespace: false });
  });

  it("is true for whitespace-only text between elements", () => {
    const input = "<root>  \t\n  </root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children[0]).toMatch({ kind: "text", allWhitespace: true });
  });

  it("is false for non-whitespace text between elements", () => {
    const input = "<root>hello</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children[0]).toMatch({ kind: "text", allWhitespace: false });
  });

  it("is based on decoded content, so entities that decode to whitespace count as whitespace", () => {
    const input = "<root>&#9;&#32;</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children[0]).toMatch({
      kind: "text",
      text: "\t ",
      allWhitespace: true,
    });
  });

  it("is false when an entity decodes to a non-whitespace character", () => {
    const input = "<root>&#65;</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children[0]).toMatch({
      kind: "text",
      text: "A",
      allWhitespace: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

describe("parseXmlDocument – comments", () => {
  it("save comments", () => {
    const input = "<!-- ignored --> <root><!-- comment --><child/></root>";
    expect(parseXmlDocument(input)).toMatch({
      kind: "success",
      root: {
        children: [
          {
            kind: "text",
          },
          {
            kind: "element",
            tag: { text: "root" },
            isSelfClosing: false,
            children: [
              {
                kind: "element",
                tag: { text: "child" },
                isSelfClosing: true,
              },
            ],
            comments: [
              {
                span: {
                  start: 23,
                  end: 39,
                },
              },
            ],
          },
        ],
      },
    })
  });

  it("reports an error for an unclosed comment", () => {
    const unclosed = "<!-- not closed";

    const result = parseXmlDocument(unclosed);
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unclosed XML comment" }],
    });
  });
});
