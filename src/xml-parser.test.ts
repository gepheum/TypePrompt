import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type {
  ElementNode,
  SourceSpan,
  TextNode,
  XmlDocument,
  XmlParseErrors,
} from "./xml-parser.js";
import {
  parseXmlDocument,
  textNodeDecodedOffsetToSourceOffset,
} from "./xml-parser.js";

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
      content: [],
    });
  });

  it("tracks tag offsets when first element starts after leading whitespace", () => {
    const input = " <foo/>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[1] as ElementNode;

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
      content: [
        {
          kind: "text",
          text: span(input, "before"),
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
              text: span(input, "mid"),
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
              text: span(input, "after"),
            },
          ],
        },
        {
          kind: "text",
          text: span(input, "tail"),
        },
      ],
    });
  });

  it("skips comments and processing instructions", () => {
    const input =
      '<?xml version="1.0"?><root><!--comment--><?pi target?>ok</root>';
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[0] as ElementNode;

    expect(root).toMatch({
      kind: "element",
      tagName: span(input, "root"),
      isSelfClosing: false,
      children: [
        {
          kind: "text",
          text: span(input, "ok"),
        },
      ],
    });
  });

  it("keeps distinct text nodes separated by a comment", () => {
    const input = "<foo>abc<!--\n    -->bcd</foo>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[0] as ElementNode;

    expect(root).toMatch({
      kind: "element",
      tagName: span(input, "foo"),
      isSelfClosing: false,
      children: [
        {
          kind: "text",
          text: span(input, "abc"),
        },
        {
          kind: "text",
          text: span(input, "bcd", input.indexOf("-->") + 3),
        },
      ],
    });
  });

  it("keeps CDATA text as the inner text span", () => {
    const input = "<root><![CDATA[a<b>c]]></root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[0] as ElementNode;

    expect(root.children).toMatch([
      {
        kind: "text",
        text: span(input, "a<b>c"),
      },
    ]);
  });

  it("preserves raw entity text in text nodes and attribute values", () => {
    const input = '<root a="1 &amp; 2">x &amp; y</root>';
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[0] as ElementNode;

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
          text: span(input, "x &amp; y"),
          decoded: "x & y",
          offsetMap: [
            {
              decodedOffset: 0,
              sourceOffsetStart: input.indexOf("x &amp; y"),
              sourceOffsetEnd: input.indexOf(
                "&amp;",
                input.indexOf("x &amp; y"),
              ),
            },
            {
              decodedOffset: 2,
              sourceOffsetStart: input.indexOf(
                "&amp;",
                input.indexOf("x &amp; y"),
              ),
              sourceOffsetEnd:
                input.indexOf("&amp;", input.indexOf("x &amp; y")) +
                "&amp;".length,
            },
            {
              decodedOffset: 3,
              sourceOffsetStart:
                input.indexOf("&amp;", input.indexOf("x &amp; y")) +
                "&amp;".length,
              sourceOffsetEnd: input.indexOf("x &amp; y") + "x &amp; y".length,
            },
          ],
        },
      ],
    });
  });

  it("decodes escaped and numeric entities in attribute values", () => {
    const input = '<root a="x &lt; y" b="&#65;&#x42;" />';
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[0] as ElementNode;

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

    expect(result.content).toMatch([
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
    const root = result.content[0] as ElementNode;

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
    const root = result.content[0] as ElementNode;
    const textStart = input.indexOf("&#65; &#x42;");
    const firstEntityStart = input.indexOf("&#65;", textStart);
    const firstEntityEnd = firstEntityStart + "&#65;".length;
    const secondEntityStart = input.indexOf("&#x42;", textStart);
    const secondEntityEnd = secondEntityStart + "&#x42;".length;

    expect(root.children[0]).toMatch({
      kind: "text",
      text: span(input, "&#65; &#x42;"),
      decoded: "A B",
      offsetMap: [
        {
          decodedOffset: 0,
          sourceOffsetStart: firstEntityStart,
          sourceOffsetEnd: firstEntityEnd,
        },
        {
          decodedOffset: 1,
          sourceOffsetStart: firstEntityEnd,
          sourceOffsetEnd: secondEntityStart,
        },
        {
          decodedOffset: 2,
          sourceOffsetStart: secondEntityStart,
          sourceOffsetEnd: secondEntityEnd,
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

  it("maps decoded offsets to source offsets for plain text", () => {
    const input = "<root>abc</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[0] as ElementNode;
    const textNode = root.children[0] as TextNode;

    expect(textNodeDecodedOffsetToSourceOffset(textNode, 0)).toBe(
      input.indexOf("abc"),
    );
    expect(textNodeDecodedOffsetToSourceOffset(textNode, 1)).toBe(
      input.indexOf("abc") + 1,
    );
    expect(textNodeDecodedOffsetToSourceOffset(textNode, 2)).toBe(
      input.indexOf("abc") + 2,
    );
    expect(textNodeDecodedOffsetToSourceOffset(textNode, 3)).toBe(
      input.indexOf("abc") + 3,
    );
  });

  it("maps decoded offsets to source offsets across entity and raw segments", () => {
    const input = "<root>x &amp; y</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[0] as ElementNode;
    const textNode = root.children[0] as TextNode;

    // decoded: "x & y", source: "x &amp; y"
    expect(textNodeDecodedOffsetToSourceOffset(textNode, 0)).toBe(
      input.indexOf("x &amp; y"),
    );
    expect(textNodeDecodedOffsetToSourceOffset(textNode, 1)).toBe(
      input.indexOf("x &amp; y") + 1,
    );
    expect(textNodeDecodedOffsetToSourceOffset(textNode, 2)).toBe(
      input.indexOf("&amp;"),
    );
    expect(textNodeDecodedOffsetToSourceOffset(textNode, 3)).toBe(
      input.indexOf("&amp;") + "&amp;".length,
    );
    expect(textNodeDecodedOffsetToSourceOffset(textNode, 4)).toBe(
      input.indexOf("&amp;") + "&amp;".length + 1,
    );
    expect(textNodeDecodedOffsetToSourceOffset(textNode, 5)).toBe(
      input.indexOf("x &amp; y") + "x &amp; y".length,
    );
  });

  it("maps end boundary of a single-entity text node", () => {
    const input = "<root>&lt;</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[0] as ElementNode;
    const textNode = root.children[0] as TextNode;

    expect(textNode.decoded).toBe("<");
    expect(textNodeDecodedOffsetToSourceOffset(textNode, 0)).toBe(
      input.indexOf("&lt;"),
    );
    expect(textNodeDecodedOffsetToSourceOffset(textNode, 1)).toBe(
      input.indexOf("&lt;") + "&lt;".length,
    );
  });

  it("throws for decoded offsets outside valid range", () => {
    const input = "<root>abc</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[0] as ElementNode;
    const textNode = root.children[0] as TextNode;

    let threw = false;
    try {
      textNodeDecodedOffsetToSourceOffset(textNode, -1);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    threw = false;
    try {
      textNodeDecodedOffsetToSourceOffset(textNode, 4);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("returns text start for empty decoded text nodes", () => {
    const emptyNode: TextNode = {
      kind: "text",
      text: {
        text: "",
        start: 42,
        end: 42,
      },
      decoded: "",
      offsetMap: [],
    };

    expect(textNodeDecodedOffsetToSourceOffset(emptyNode, 0)).toBe(42);
  });

  it("provides identity decoded text and offset map for CDATA text", () => {
    const input = "<root><![CDATA[a<b>c]]></root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[0] as ElementNode;
    const cdataTextStart = input.indexOf("a<b>c");

    expect(root.children[0]).toMatch({
      kind: "text",
      text: span(input, "a<b>c"),
      decoded: "a<b>c",
      offsetMap: [
        {
          decodedOffset: 0,
          sourceOffsetStart: cdataTextStart,
          sourceOffsetEnd: cdataTextStart + "a<b>c".length,
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
