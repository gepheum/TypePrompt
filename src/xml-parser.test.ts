import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { ElementNode, SourceSpan, XmlDocument, XmlParseErrors } from "./xml-parser.js";
import { parseXmlDocument } from "./xml-parser.js";

function expectSuccess(result: XmlDocument | XmlParseErrors): XmlDocument {
  if (result.kind !== "success") {
    throw new Error(`Expected success, got errors: ${JSON.stringify(result.errors)}`);
  }
  return result;
}

function expectError(result: XmlDocument | XmlParseErrors): XmlParseErrors {
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

  it("parses nested elements, attributes, text, and self-closing tags", () => {
    const input = 'before<root a="1" b=\'two\'>mid<child x="y"/>after</root>tail';
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
          attributes: {
            a: {
              name: span(input, "a", input.indexOf("a=\"1\"")),
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
    const input = '<?xml version="1.0"?><root><!--comment--><?pi target?>ok</root>';
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.content[0] as ElementNode;

    expect(root).toMatch({
      kind: "element",
      tagName: span(input, "root"),
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
              sourceOffsetEnd: input.indexOf("&amp;", input.indexOf("x &amp; y")),
            },
            {
              decodedOffset: 2,
              sourceOffsetStart: input.indexOf("&amp;", input.indexOf("x &amp; y")),
              sourceOffsetEnd: input.indexOf("&amp;", input.indexOf("x &amp; y")) + "&amp;".length,
            },
            {
              decodedOffset: 3,
              sourceOffsetStart: input.indexOf("&amp;", input.indexOf("x &amp; y")) + "&amp;".length,
              sourceOffsetEnd: input.indexOf("x &amp; y") + "x &amp; y".length,
            },
          ],
        },
      ],
    });
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

    expect(result.errors[0]).toMatch({
      message: "Attribute 'x' must have a value",
    });
  });

  it("reports an unquoted attribute value", () => {
    const result = expectError(parseXmlDocument("<a x=y></a>"));

    expect(result.errors[0]).toMatch({
      message: "Attribute 'x' value must be quoted",
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
