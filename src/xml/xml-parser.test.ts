import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { InternalErrors, Span } from "../util/common-types.js";
import { parseXmlDocument } from "./xml-parser.js";
import type {
  XmlComment as CommentNode,
  ElementNode,
  XmlDocument,
} from "./xml-types.js";

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

function span(content: string, text: string, fromIndex = 0): Span {
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

  it("skips CDATA sections (cursor advances past closing ]]>)", () => {
    // Verify that content after the CDATA section is still parsed.
    const input = "<root><![CDATA[ignored]]>after</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.children).toMatch([
      { kind: "text", sourceSpan: span(input, "after") },
    ]);
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

describe("ElementNode.contentSpan", () => {
  it("is empty for a self-closing element", () => {
    const input = "<root/>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.contentSpan).toMatch({ text: "", start: 7, end: 7 });
  });

  it("is empty for an element with no content", () => {
    const input = "<root></root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    // <root> ends at 6, </root> starts at 6
    expect(root.contentSpan).toMatch({ text: "", start: 6, end: 6 });
  });

  it("covers text content between opening and closing tags", () => {
    const input = "<root>hello</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;

    expect(root.contentSpan).toMatch({ text: "hello", start: 6, end: 11 });
  });

  it("covers child elements and surrounding whitespace", () => {
    const input = "<outer>  <inner/>  </outer>";
    const result = expectSuccess(parseXmlDocument(input));
    const outer = result.root.children[0] as ElementNode;
    const inner = outer.children[1] as ElementNode;

    // <outer> ends at 7, </outer> starts at 19
    expect(outer.contentSpan).toMatch({
      text: "  <inner/>  ",
      start: 7,
      end: 19,
    });
    // <inner/> ends at 17 — self-closing, empty contentSpan
    expect(inner.contentSpan).toMatch({ text: "", start: 17, end: 17 });
  });

  it("starts right after the opening tag when preceded by text sibling", () => {
    const input = "text<elem>content</elem>";
    const result = expectSuccess(parseXmlDocument(input));
    const elem = result.root.children[1] as ElementNode;

    // <elem> starts at 4, ends at 10; </elem> starts at 17
    expect(elem.contentSpan).toMatch({ text: "content", start: 10, end: 17 });
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

// ---------------------------------------------------------------------------
// commentsPolicy
// ---------------------------------------------------------------------------

describe("parseXmlDocument – commentsPolicy", () => {
  it("drops comments by default (no second argument)", () => {
    const input = "<!-- hello -->text";
    const result = expectSuccess(parseXmlDocument(input));

    expect(result.root.children).toMatch([
      { kind: "text", sourceSpan: { text: "text" } },
    ]);
  });

  it("drops comments when commentsPolicy is 'drop-comments'", () => {
    const input = "<root><!-- ignored --><child/></root>";
    const result = expectSuccess(parseXmlDocument(input, "drop-comments"));
    const root = result.root.children[0] as ElementNode;

    expect(root.children).toMatch([
      { kind: "element", tagName: { text: "child" } },
    ]);
  });

  it("keeps comments when commentsPolicy is 'keep-comments'", () => {
    const input = "<!-- hello -->";
    const result = expectSuccess(parseXmlDocument(input, "keep-comments"));

    expect(result.root.children).toMatch([
      {
        kind: "comment",
        sourceSpan: { text: "<!-- hello -->", start: 0, end: 14 },
      },
    ]);
  });

  it("keeps comment sourceSpan covering the full '<!-- ... -->' token", () => {
    const input = "before<!-- my comment -->after";
    const result = expectSuccess(parseXmlDocument(input, "keep-comments"));

    const commentStart = input.indexOf("<!--");
    const commentEnd = input.indexOf("-->") + 3;
    const comment = result.root.children[1] as CommentNode;

    expect(comment).toMatch({
      kind: "comment",
      span: {
        text: "<!-- my comment -->",
        start: commentStart,
        end: commentEnd,
      },
    });
  });

  it("keeps multiple comment nodes in document order", () => {
    const input = "<!-- a --><!-- b --><!-- c -->";
    const result = expectSuccess(parseXmlDocument(input, "keep-comments"));

    expect(result.root.children).toMatch([
      { kind: "comment", sourceSpan: { text: "<!-- a -->" } },
      { kind: "comment", sourceSpan: { text: "<!-- b -->" } },
      { kind: "comment", sourceSpan: { text: "<!-- c -->" } },
    ]);
  });

  it("keeps comment nodes interleaved with element and text nodes", () => {
    const input = "<root>text<!-- note --><child/></root>";
    const result = expectSuccess(parseXmlDocument(input, "keep-comments"));
    const root = result.root.children[0] as ElementNode;

    expect(root.children).toMatch([
      { kind: "text", sourceSpan: { text: "text" } },
      { kind: "comment", sourceSpan: { text: "<!-- note -->" } },
      { kind: "element", tagName: { text: "child" } },
    ]);
  });

  it("reports an error for an unclosed comment regardless of policy", () => {
    const unclosed = "<!-- not closed";

    for (const policy of ["drop-comments", "keep-comments"] as const) {
      const result = parseXmlDocument(unclosed, policy);
      expect(result).toMatch({
        kind: "error",
        errors: [{ message: "Unclosed XML comment" }],
      });
    }
  });
});
