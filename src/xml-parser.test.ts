import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type {
  ElementNode,
  SourceSpan,
  XmlDocument,
  XmlParseErrors,
} from "./xml-parser.js";
import { parseXmlDocument } from "./xml-parser.js";

function expectSuccess(result: XmlDocument | XmlParseErrors): XmlDocument {
  expect(result).toMatch({ kind: "success" });
  if (result.kind !== "success") {
    throw new Error(
      `Expected success, got errors: ${JSON.stringify(result.errors)}`,
    );
  }
  return result;
}

function expectError(result: XmlDocument | XmlParseErrors): XmlParseErrors {
  expect(result).toMatch({ kind: "error" });
  if (result.kind !== "error") {
    throw new Error("Expected parse errors");
  }
  return result;
}

function span(content: string, text: string, fromIndex = 0): SourceSpan {
  const start = content.indexOf(text, fromIndex);
  if (start < 0) {
    throw new Error(`Could not find '${text}' in input`);
  }
  return {
    text,
    start,
    end: start + text.length,
  };
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
      tagName: {
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
            kind: "text",
            sourceSpan: span(input, "before"),
          },
          {
            kind: "element",
            tagName: span(input, "root"),
            isSelfClosing: false,
            attributes: {
              a: {
                name: span(input, "a", input.indexOf('a="1"')),
                value: span(input, "1", input.indexOf('a="1"')),
              },
              b: {
                name: span(input, "b", input.indexOf("b='two'")),
                value: span(input, "two", input.indexOf("b='two'")),
              },
            },
            children: [
              {
                kind: "text",
                sourceSpan: span(input, "mid"),
              },
              {
                kind: "element",
                tagName: span(input, "child"),
                isSelfClosing: true,
                attributes: {
                  x: {
                    name: span(input, "x", input.indexOf('x="y"')),
                    value: span(input, "y", input.indexOf('x="y"')),
                  },
                },
                children: [],
              },
              {
                kind: "text",
                sourceSpan: span(input, "after"),
              },
            ],
          },
          {
            kind: "text",
            sourceSpan: span(input, "tail"),
          },
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
      tagName: span(input, "root"),
      isSelfClosing: false,
      children: [
        {
          kind: "text",
          sourceSpan: span(input, "ok"),
        },
      ],
    });
  });

  it("keeps distinct text nodes separated by a comment", () => {
    const input = "<foo>abc<!--\n    -->bcd</foo>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root).toMatch({
      kind: "element",
      tagName: span(input, "foo"),
      isSelfClosing: false,
      children: [
        {
          kind: "text",
          sourceSpan: span(input, "abc"),
        },
        {
          kind: "text",
          sourceSpan: span(input, "bcd", input.indexOf("-->") + 3),
        },
      ],
    });
  });

  it("keeps CDATA text as the inner text span", () => {
    const input = "<root><![CDATA[a<b>c]]></root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children).toMatch([
      {
        kind: "text",
        sourceSpan: span(input, "a<b>c"),
      },
    ]);
  });

  it("preserves raw entity text in text nodes and attribute values", () => {
    const input = '<root a="1 &amp; 2">x &amp; y</root>';
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root).toMatch({
      attributes: {
        a: {
          value: span(input, "1 &amp; 2"),
          decodedValue: "1 & 2",
        },
      },
      children: [
        {
          kind: "text",
          sourceSpan: span(input, "x &amp; y"),
          decoded: "x & y",
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
          value: span(input, "x &lt; y"),
          decodedValue: "x < y",
        },
        b: {
          value: span(input, "&#65;&#x42;"),
          decodedValue: "AB",
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
        tagName: span(input, "a"),
        isSelfClosing: true,
        children: [],
      },
      {
        kind: "element",
        tagName: span(input, "b", input.indexOf("<b")),
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
      tagName: span(input, "root"),
      isSelfClosing: false,
      attributes: {
        a: {
          value: span(input, "x > y"),
        },
      },
      children: [
        {
          kind: "element",
          tagName: span(input, "child"),
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
      sourceSpan: span(input, "&#65; &#x42;"),
      decoded: "A B",
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

  it("provides identity decoded text and offset map for CDATA text", () => {
    const input = "<root><![CDATA[a<b>c]]></root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;
    const cdataTextStart = input.indexOf("a<b>c");

    expect(root.children[0]).toMatch({
      kind: "text",
      sourceSpan: span(input, "a<b>c"),
      decoded: "a<b>c",
      offsetMap: [
        {
          decodedOffset: 0,
          sourceOffset: cdataTextStart,
        },
      ],
    });
  });

  it("reports an unexpected closing tag", () => {
    const result = expectError(parseXmlDocument("</root>"));

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          start: 0,
          end: 7,
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
          start: 6,
          end: 10,
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
          start: 0,
          end: 3,
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
          message: "Attribute 'x' must have a value",
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
          message: "Attribute 'x' value must be quoted",
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
          message: "Attribute 'x' value must be quoted",
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

describe("ElementNode.sourceSpan", () => {
  it("covers a self-closing element from < to />", () => {
    const input = "<root/>";
    const result = expectSuccess(parseXmlDocument(input));

    expect(result.root.children[0]).toMatch({
      kind: "element",
      sourceSpan: { text: "<root/>", start: 0, end: 7 },
    });
  });

  it("covers a regular element from < to >", () => {
    const input = "<root></root>";
    const result = expectSuccess(parseXmlDocument(input));

    expect(result.root.children[0]).toMatch({
      kind: "element",
      sourceSpan: { text: "<root></root>", start: 0, end: 13 },
    });
  });

  it("covers element content including children", () => {
    const input = "<root><child/></root>";
    const result = expectSuccess(parseXmlDocument(input));

    expect(result.root.children[0]).toMatch({
      kind: "element",
      sourceSpan: { text: "<root><child/></root>", start: 0, end: 21 },
    });
  });

  it("assigns independent spans to sibling elements", () => {
    const input = "<a/><b></b>";
    const result = expectSuccess(parseXmlDocument(input));

    expect(result.root.children).toMatch([
      { kind: "element", sourceSpan: { text: "<a/>", start: 0, end: 4 } },
      { kind: "element", sourceSpan: { text: "<b></b>", start: 4, end: 11 } },
    ]);
  });

  it("assigns correct span to a nested child element", () => {
    const input = "<outer>  <inner/>  </outer>";
    const result = expectSuccess(parseXmlDocument(input));
    const outer = result.root.children[0] as ElementNode;
    const inner = outer.children[1] as ElementNode;

    expect(outer.sourceSpan).toMatch({
      text: "<outer>  <inner/>  </outer>",
      start: 0,
      end: 27,
    });
    expect(inner.sourceSpan).toMatch({ text: "<inner/>", start: 9, end: 17 });
  });

  it("span starts after leading text sibling", () => {
    const input = "text<elem/>";
    const result = expectSuccess(parseXmlDocument(input));
    const elem = result.root.children[1] as ElementNode;

    expect(elem.sourceSpan).toMatch({ text: "<elem/>", start: 4, end: 11 });
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

  it("is true for CDATA with whitespace-only content", () => {
    const input = "<root><![CDATA[  \t\n  ]]></root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children[0]).toMatch({ kind: "text", allWhitespace: true });
  });

  it("is false for CDATA with non-whitespace content", () => {
    const input = "<root><![CDATA[hello]]></root>";
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
      decoded: "\t ",
      allWhitespace: true,
    });
  });

  it("is false when an entity decodes to a non-whitespace character", () => {
    const input = "<root>&#65;</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children[0]).toMatch({
      kind: "text",
      decoded: "A",
      allWhitespace: false,
    });
  });
});
