import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseXmlDocument } from "./xml-parser.js";

describe("parseXmlDocument", () => {
  it("parses an empty document", () => {
    expect(parseXmlDocument("")).toMatch({
      kind: "success",
      root: { children: [] },
    });
  });

  it("tracks tag offsets when first element starts after leading whitespace", () => {
    const input = " <foo/>";

    expect(parseXmlDocument(input)).toMatch({
      kind: "success",
      root: {
        children: [
          {},
          {
            kind: "element",
            tag: {
              text: "foo",
              start: 2,
              end: 5,
            },
            isSelfClosing: true,
            contentStart: 7,
            children: [],
          },
        ],
      },
    });
  });

  it("parses nested elements, attributes, text, and self-closing tags", () => {
    expect(
      parseXmlDocument(
        'before<root a="1" b=\'two\'>mid<child x="y"/>after</root>tail',
      ),
    ).toMatch({
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
            contentStart: 26,
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
    expect(
      parseXmlDocument(
        '<?xml version="1.0"?><root><!--comment--><?pi target?>ok</root>',
      ),
    ).toMatch({
      kind: "success",
      root: {
        children: [
          {
            kind: "element",
            tag: { text: "root" },
            isSelfClosing: false,
            children: [{ text: "ok" }],
          },
        ],
      },
    });
  });

  it("keeps distinct text nodes separated by a comment", () => {
    expect(parseXmlDocument("<foo>abc<!--\n    -->bcd</foo>")).toMatch({
      kind: "success",
      root: {
        children: [
          {
            kind: "element",
            tag: { text: "foo" },
            isSelfClosing: false,
            children: [{ text: "abc" }, { text: "bcd" }],
          },
        ],
      },
    });
  });

  it("skips CDATA sections (no child node emitted)", () => {
    expect(parseXmlDocument("<root><![CDATA[a<b>c]]></root>")).toMatch({
      kind: "success",
      root: { children: [{ children: [] }] },
    });
  });

  it("preserves raw entity text in text nodes and attribute values", () => {
    const input = '<root a="1 &amp; 2">x &amp; y</root>';

    expect(parseXmlDocument(input)).toMatch({
      kind: "success",
      root: {
        children: [
          {
            attributes: {
              a: {
                name: { text: "a" },
                value: { text: "1 & 2" },
              },
            },
            children: [
              {
                kind: "text",
                text: "x & y",
                offsetMap: [
                  {
                    textPosition: 0,
                    sourcePosition: input.indexOf("x &amp; y"),
                  },
                  {
                    textPosition: 2,
                    sourcePosition: input.indexOf(
                      "&amp;",
                      input.indexOf("x &amp; y"),
                    ),
                  },
                  {
                    textPosition: 3,
                    sourcePosition:
                      input.indexOf("&amp;", input.indexOf("x &amp; y")) +
                      "&amp;".length,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("decodes escaped and numeric entities in attribute values", () => {
    expect(parseXmlDocument('<root a="x &lt; y" b="&#65;&#x42;" />')).toMatch({
      kind: "success",
      root: {
        children: [
          {
            attributes: {
              a: { value: { text: "x < y" } },
              b: { value: { text: "AB" } },
            },
            isSelfClosing: true,
          },
        ],
      },
    });
  });

  it("tracks whether elements are self-closing", () => {
    expect(parseXmlDocument("<a/><b></b>")).toMatch({
      kind: "success",
      root: {
        children: [
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
        ],
      },
    });
  });

  it("parses > inside quoted attribute values", () => {
    expect(parseXmlDocument('<root a="x > y"><child/></root>')).toMatch({
      kind: "success",
      root: {
        children: [
          {
            tag: { text: "root" },
            isSelfClosing: false,
            attributes: { a: { value: { text: "x > y" } } },
            children: [
              {
                kind: "element",
                tag: { text: "child" },
                isSelfClosing: true,
                children: [],
              },
            ],
          },
        ],
      },
    });
  });

  it("decodes numeric entities and builds offset map segments", () => {
    const input = "<root>&#65; &#x42;</root>";
    const textStart = input.indexOf("&#65; &#x42;");
    const firstEntityStart = input.indexOf("&#65;", textStart);
    const firstEntityEnd = firstEntityStart + "&#65;".length;
    const secondEntityStart = input.indexOf("&#x42;", textStart);
    const secondEntityEnd = secondEntityStart + "&#x42;".length;

    expect(parseXmlDocument(input)).toMatch({
      kind: "success",
      root: {
        children: [
          {
            children: [
              {
                kind: "text",
                text: "A B",
                offsetMap: [
                  { textPosition: 0, sourcePosition: firstEntityStart },
                  { textPosition: 1, sourcePosition: firstEntityEnd },
                  { textPosition: 2, sourcePosition: secondEntityStart },
                  { textPosition: 3, sourcePosition: secondEntityEnd },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("reports undefined entities", () => {
    expect(parseXmlDocument("<root>&bad;</root>")).toMatch({
      kind: "error",
      errors: [{ message: "undefined entity." }],
    });
  });

  it("reports malformed character entities", () => {
    expect(parseXmlDocument("<root>&#zz;</root>")).toMatch({
      kind: "error",
      errors: [{ message: "malformed character entity." }],
    });
  });

  it("skips CDATA sections (cursor advances past closing ]]>)", () => {
    // Verify that content after the CDATA section is still parsed.
    expect(parseXmlDocument("<root><![CDATA[ignored]]>after</root>")).toMatch({
      kind: "success",
      root: {
        children: [{ children: [{ kind: "text", text: "after" }] }],
      },
    });
  });

  it("reports an unexpected closing tag", () => {
    expect(parseXmlDocument("</root>")).toMatch({
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
    expect(parseXmlDocument("<a><b></a>")).toMatch({
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
    expect(parseXmlDocument("<a>")).toMatch({
      kind: "error",
      errors: [{ span: { start: 1, end: 2 }, message: "Unclosed tag '<a>'" }],
    });
  });

  it("reports an attribute without a value", () => {
    expect(parseXmlDocument("<a x></a>")).toMatch({
      kind: "error",
      errors: [{ message: "Attribute must have a value" }],
    });
  });

  it("reports an unquoted attribute value", () => {
    expect(parseXmlDocument("<a x=y></a>")).toMatch({
      kind: "error",
      errors: [{ message: "Attribute value must be quoted" }],
    });
  });

  it("reports multiple independent XML errors", () => {
    expect(parseXmlDocument("<a x=y><b></a></c>")).toMatch({
      kind: "error",
      errors: [
        { message: "Attribute value must be quoted" },
        { message: "Mismatched closing tag '</a>'; expected '</b>'" },
        { message: "Unexpected closing tag '</c>'" },
      ],
    });
  });
});

describe("TextNode.allWhitespace", () => {
  it("is true for whitespace-only text", () => {
    expect(parseXmlDocument("<root>  \t\n  </root>")).toMatch({
      kind: "success",
      root: {
        children: [{ children: [{ kind: "text", allWhitespace: true }] }],
      },
    });
  });

  it("is false for non-whitespace text", () => {
    expect(parseXmlDocument("<root>hello</root>")).toMatch({
      kind: "success",
      root: {
        children: [{ children: [{ kind: "text", allWhitespace: false }] }],
      },
    });
  });

  it("is false for text that starts and ends with whitespace but contains non-whitespace", () => {
    expect(parseXmlDocument("<root>  hello  </root>")).toMatch({
      kind: "success",
      root: {
        children: [{ children: [{ kind: "text", allWhitespace: false }] }],
      },
    });
  });

  it("is true for whitespace-only text between elements", () => {
    expect(parseXmlDocument("<root>  \t\n  </root>")).toMatch({
      kind: "success",
      root: {
        children: [{ children: [{ kind: "text", allWhitespace: true }] }],
      },
    });
  });

  it("is false for non-whitespace text between elements", () => {
    expect(parseXmlDocument("<root>hello</root>")).toMatch({
      kind: "success",
      root: {
        children: [{ children: [{ kind: "text", allWhitespace: false }] }],
      },
    });
  });

  it("is based on decoded content, so entities that decode to whitespace count as whitespace", () => {
    expect(parseXmlDocument("<root>&#9;&#32;</root>")).toMatch({
      kind: "success",
      root: {
        children: [
          { children: [{ kind: "text", text: "\t ", allWhitespace: true }] },
        ],
      },
    });
  });

  it("is false when an entity decodes to a non-whitespace character", () => {
    expect(parseXmlDocument("<root>&#65;</root>")).toMatch({
      kind: "success",
      root: {
        children: [
          { children: [{ kind: "text", text: "A", allWhitespace: false }] },
        ],
      },
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
    });
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
