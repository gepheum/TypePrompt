import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseXmlDocument as parseXmlDocumentCore } from "./xml-parser.js";
import type { InvalidXmlDocument, XmlDocument } from "./xml-types.js";

function parseXmlDocument(
  content: string,
  path = "test.xml",
): XmlDocument | InvalidXmlDocument {
  return parseXmlDocumentCore(content, path);
}

describe("parseXmlDocument", () => {
  it("parses an empty document", () => {
    expect(parseXmlDocument("")).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: 0, end: 0 },
          message: "No root element found",
        },
      ],
    });
  });

  it("tracks tag offsets when first element starts after leading whitespace", () => {
    const input = " <foo/>";

    expect(parseXmlDocument(input)).toMatch({
      kind: "success",
      content: input,
      root: {
        kind: "element",
        tag: {
          text: "foo",
          start: 2,
          end: 5,
        },
        start: 1,
        end: 7,
        isSelfClosing: true,
        contentStart: 7,
        children: [],
        xmlSlice: "<foo/>",
      },
    });
  });

  it("parses nested elements, attributes, text, and self-closing tags", () => {
    expect(
      parseXmlDocument(
        ' <z>before<root a="1" b=\'two\'>mid<child x="y"/>after</root>tail</z>',
      ),
    ).toMatch({
      kind: "success",
      root: {
        tag: { text: "z" },
        children: [
          {
            text: "before",
            xmlSlice: "before",
          },
          {
            kind: "element",
            tag: {
              text: "root",
            },
            start: 10,
            end: 59,
            isSelfClosing: false,
            contentStart: 30,
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
            xmlSlice: '<root a="1" b=\'two\'>mid<child x="y"/>after</root>',
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
        kind: "element",
        tag: { text: "root" },
        isSelfClosing: false,
        children: [{ text: "ok" }],
      },
    });
  });

  it("keeps distinct text nodes separated by a comment", () => {
    expect(parseXmlDocument("<foo>abc<!--\n    -->bcd</foo>")).toMatch({
      kind: "success",
      root: {
        kind: "element",
        tag: { text: "foo" },
        isSelfClosing: false,
        children: [{ text: "abc" }, { text: "bcd" }],
      },
    });
  });

  it("skips CDATA sections (no child node emitted)", () => {
    expect(parseXmlDocument("<root><![CDATA[a<b>c]]></root>")).toMatch({
      kind: "success",
      root: { children: [] },
    });
  });

  it("preserves raw entity text in text nodes and attribute values", () => {
    const input = '<root a="1 &amp; 2">x &amp; y</root>';

    expect(parseXmlDocument(input)).toMatch({
      kind: "success",
      root: {
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
    });
  });

  it("decodes escaped and numeric entities in attribute values", () => {
    expect(parseXmlDocument('<root a="x &lt; y" b="&#65;&#x42;" />')).toMatch({
      kind: "success",
      root: {
        attributes: {
          a: { value: { text: "x < y" } },
          b: { value: { text: "AB" } },
        },
        isSelfClosing: true,
      },
    });
  });

  it("tracks whether elements are self-closing and sets closingTag", () => {
    expect(parseXmlDocument("<z><a/><b></b></z>")).toMatch({
      kind: "success",
      root: {
        closingTag: { start: 14, end: 18 },
        children: [
          {
            kind: "element",
            tag: { text: "a" },
            isSelfClosing: true,
            closingTag: undefined,
            children: [],
          },
          {
            kind: "element",
            tag: { text: "b" },
            isSelfClosing: false,
            closingTag: { start: 10, end: 14 },
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
      root: { children: [{ kind: "text", text: "after" }] },
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
        {},
      ],
    });
  });

  it("reports an unclosed tag when closing an ancestor", () => {
    expect(parseXmlDocument("<a><b></a>")).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: 4, end: 5 },
          message: "Unclosed tag '<b>'",
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
    expect(parseXmlDocument('<a valid="yes" x=y></a>')).toMatch({
      kind: "error",
      errors: [{ message: "Attribute value must be quoted" }],
      root: {
        kind: "element",
        tag: { text: "a" },
        attributes: {
          valid: { name: { text: "valid" }, value: { text: "yes" } },
        },
      },
    });
  });

  it("reports an unexpected character like comma between attributes", () => {
    const input = '<foo a="a", b="b"/>';
    expect(parseXmlDocument(input)).toMatch({
      kind: "error",
      errors: [
        {
          span: {
            start: input.indexOf(","),
            end: input.indexOf(",") + 1,
          },
          message: "Unexpected character",
        },
      ],
      root: {
        kind: "element",
        tag: { text: "foo" },
        attributes: {
          a: { name: { text: "a" }, value: { text: "a" } },
          b: { name: { text: "b" }, value: { text: "b" } },
        },
      },
    });
  });

  it("reports multiple independent XML errors", () => {
    expect(parseXmlDocument("<a x=y><b></a></c>")).toMatch({
      kind: "error",
      errors: [
        { message: "Attribute value must be quoted" },
        { message: "Unclosed tag '<b>'" },
        { message: "Unexpected closing tag '</c>'" },
      ],
    });
  });
});

describe("TextNode.allWhitespace", () => {
  it("is true for whitespace-only text", () => {
    expect(parseXmlDocument("<root>  \t\n  </root>")).toMatch({
      kind: "success",
      root: { children: [{ kind: "text", allWhitespace: true }] },
    });
  });

  it("is false for non-whitespace text", () => {
    expect(parseXmlDocument("<root>hello</root>")).toMatch({
      kind: "success",
      root: {
        children: [{ kind: "text", allWhitespace: false }],
      },
    });
  });

  it("is false for text that starts and ends with whitespace but contains non-whitespace", () => {
    expect(parseXmlDocument("<root>  hello  </root>")).toMatch({
      kind: "success",
      root: {
        children: [{ kind: "text", allWhitespace: false }],
      },
    });
  });

  it("is true for whitespace-only text between elements", () => {
    expect(parseXmlDocument("<root>  \t\n  </root>")).toMatch({
      kind: "success",
      root: {
        children: [{ kind: "text", allWhitespace: true }],
      },
    });
  });

  it("is false for non-whitespace text between elements", () => {
    expect(parseXmlDocument("<root>hello</root>")).toMatch({
      kind: "success",
      root: {
        children: [{ kind: "text", allWhitespace: false }],
      },
    });
  });

  it("is based on decoded content, so entities that decode to whitespace count as whitespace", () => {
    expect(parseXmlDocument("<root>&#9;&#32;</root>")).toMatch({
      kind: "success",
      root: {
        children: [{ kind: "text", text: "\t ", allWhitespace: true }],
      },
    });
  });

  it("is false when an entity decodes to a non-whitespace character", () => {
    expect(parseXmlDocument("<root>&#65;</root>")).toMatch({
      kind: "success",
      root: {
        children: [{ kind: "text", text: "A", allWhitespace: false }],
      },
    });
  });
});

// // ---------------------------------------------------------------------------
// // Comments
// // ---------------------------------------------------------------------------

describe("parseXmlDocument - comments", () => {
  it("save comments", () => {
    const input = "<!-- ignored --> <root><!-- comment --><child/></root>";
    expect(parseXmlDocument(input)).toMatch({
      kind: "success",
      root: {
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
            start: 23,
            end: 39,
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
      errors: [{ message: "Unclosed XML comment" }, {}],
    });
  });
});

describe("parseXmlDocument - lenient parsing", () => {
  it("recovers from an unclosed opening tag followed by another tag", () => {
    const input = `<template>
  <i
  <system>Hello</system>
</template>`;
    const result = parseXmlDocument(input);
    if (result.kind !== "error") {
      throw new Error("Expected parse error");
    }
    expect(result.root).toMatch({
      kind: "element",
      tag: { text: "template" },
    });
    expect(result.errors.some((e) => e.message === "Unclosed tag '<i>'")).toBe(
      true,
    );
  });

  it("recovers attributes from an unclosed tag followed by another tag", () => {
    const input = `<template>
  <insert val="input"
  <user>Hello</user>
</template>`;
    const result = parseXmlDocument(input);
    if (result.kind !== "error") {
      throw new Error("Expected parse error");
    }
    expect(result.root).toMatch({
      kind: "element",
      tag: { text: "template" },
    });
    expect(
      result.errors.some((e) => e.message === "Unclosed tag '<insert>'"),
    ).toBe(true);
  });

  it("recovers from an unclosed tag inside element text", () => {
    const input = `<template>
  <system>
    Foo <i
    You are a bookkeeping assistant.
  </system>
</template>`;
    const result = parseXmlDocument(input);
    if (result.kind !== "error") {
      throw new Error("Expected parse error");
    }

    expect(result.root).toMatch({
      kind: "element",
      tag: { text: "template" },
    });
    expect(result.errors.some((e) => e.message === "Unclosed tag '<i>'")).toBe(
      true,
    );
  });

  it("recovers an element at EOF missing closing angle bracket", () => {
    const input = "<root";
    const result = parseXmlDocument(input);
    if (result.kind !== "error") {
      throw new Error("Expected parse error");
    }
    expect(result.root).toMatch({
      kind: "element",
      tag: { text: "root" },
      start: 0,
      end: 5,
    });
    expect(result.errors).toMatch([
      {
        span: { start: 1, end: 5 },
        message: "Unclosed tag '<root>'",
      },
    ]);
  });

  it("does not trigger attribute error for unclosed tags missing >", () => {
    expect(parseXmlDocument("<a><foo bar</a>")).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: 4, end: 7 },
          message: "Unclosed tag '<foo>'",
        },
      ],
      root: {
        kind: "element",
        tag: { text: "a" },
        children: [
          {
            kind: "element",
            tag: { text: "foo" },
            attributes: {
              bar: {
                name: { text: "bar", start: 8, end: 11 },
              },
            },
          },
        ],
      },
    });

    expect(parseXmlDocument("<foo bar")).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: 1, end: 4 },
          message: "Unclosed tag '<foo>'",
        },
      ],
    });
  });

  describe("closingTagSuggestions", () => {
    it("suggests closing tag for simple unclosed element", () => {
      const result = parseXmlDocument("<foo>");
      expect(result).toMatch({
        kind: "error",
        closingTagSuggestions: [{ position: 5, tagName: "foo" }],
      });
    });

    it("suggests closing tag for unclosed element with attributes", () => {
      const result = parseXmlDocument(
        '<tool name="search" description="test">',
      );
      expect(result).toMatch({
        kind: "error",
        closingTagSuggestions: [{ position: 39, tagName: "tool" }],
      });
    });

    it("suggests closing tags for nested unclosed elements", () => {
      const result = parseXmlDocument("<root><child>");
      expect(result).toMatch({
        kind: "error",
        closingTagSuggestions: [
          { position: 13, tagName: "child" },
          { position: 6, tagName: "root" },
        ],
      });
    });

    it("suggests closing tag for unclosed element before ancestor closes", () => {
      const result = parseXmlDocument("<root><child></root>");
      expect(result).toMatch({
        kind: "error",
        closingTagSuggestions: [{ position: 13, tagName: "child" }],
      });
    });

    it("does not suggest closing tag for self-closing elements", () => {
      const result = parseXmlDocument("<foo/>");
      expect(result.kind).toBe("success");
    });

    it("does not suggest closing tag for completely closed document", () => {
      const result = parseXmlDocument("<foo></foo>");
      expect(result.kind).toBe("success");
    });

    it("does not suggest closing tag for tag missing closing angle bracket", () => {
      const result = parseXmlDocument("<foo");
      expect(result).toMatch({
        kind: "error",
        closingTagSuggestions: [],
      });
    });
  });
});
