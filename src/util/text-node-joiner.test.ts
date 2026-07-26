import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode, TextNode } from "../xml/xml-types.js";
import { MappedText } from "./shared-types.js";
import { textToSourcePosition } from "./position-mapper.js";
import { joinTextNodes } from "./text-node-joiner.js";

function expectSuccess(
  result: ReturnType<typeof parseXmlDocument>,
): Extract<ReturnType<typeof parseXmlDocument>, { kind: "success" }> {
  if (result.kind !== "success") {
    throw new Error(
      `Expected success, got errors: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result;
}

describe("textToSourcePosition", () => {
  it("maps text positions to source positions for plain text", () => {
    const input = "<root>abc</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.topLevelNodes[0] as ElementNode;
    const textNode = root.children[0] as TextNode;

    expect(textToSourcePosition(textNode, 0)).toBe(input.indexOf("abc"));
    expect(textToSourcePosition(textNode, 1)).toBe(input.indexOf("abc") + 1);
    expect(textToSourcePosition(textNode, 2)).toBe(input.indexOf("abc") + 2);
    expect(textToSourcePosition(textNode, 3)).toBe(input.indexOf("abc") + 3);
  });

  it("maps text offsets to source positions across entity and raw segments", () => {
    const input = "<root>x &amp; y</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.topLevelNodes[0] as ElementNode;
    const textNode = root.children[0] as TextNode;

    // decoded: "x & y", source: "x &amp; y"
    expect(textToSourcePosition(textNode, 0)).toBe(input.indexOf("x &amp; y"));
    expect(textToSourcePosition(textNode, 1)).toBe(
      input.indexOf("x &amp; y") + 1,
    );
    expect(textToSourcePosition(textNode, 2)).toBe(input.indexOf("&amp;"));
    expect(textToSourcePosition(textNode, 3)).toBe(
      input.indexOf("&amp;") + "&amp;".length,
    );
    expect(textToSourcePosition(textNode, 4)).toBe(
      input.indexOf("&amp;") + "&amp;".length + 1,
    );
    expect(textToSourcePosition(textNode, 5)).toBe(
      input.indexOf("x &amp; y") + "x &amp; y".length,
    );
  });

  it("maps end boundary of a single-entity text node", () => {
    const input = "<root>&lt;</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.topLevelNodes[0] as ElementNode;
    const textNode = root.children[0] as TextNode;

    expect(textNode.text).toBe("<");
    expect(textToSourcePosition(textNode, 0)).toBe(input.indexOf("&lt;"));
    expect(textToSourcePosition(textNode, 1)).toBe(
      input.indexOf("&lt;") + "&lt;".length,
    );
  });

  it("throws for text positions outside valid range", () => {
    const input = "<root>abc</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.topLevelNodes[0] as ElementNode;
    const textNode = root.children[0] as TextNode;

    let threw = false;
    try {
      textToSourcePosition(textNode, -1);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    threw = false;
    try {
      textToSourcePosition(textNode, 4);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("returns text start for empty decoded text nodes", () => {
    const emptyNode: MappedText = {
      text: "",
      offsetMap: [{ textPosition: 0, sourcePosition: 42 }],
    };

    expect(textToSourcePosition(emptyNode, 0)).toBe(42);
  });
});

describe("joinTextNodes", () => {
  it("returns an empty text with a single offset entry for an empty list", () => {
    const result = joinTextNodes([], 42);

    expect(result).toMatch({
      text: "",
      offsetMap: [{ textPosition: 0, sourcePosition: 42 }],
    });
  });

  it("returns the single node unchanged for a one-element list", () => {
    const node: MappedText = {
      text: "abc",
      offsetMap: [{ textPosition: 0, sourcePosition: 10 }],
    };

    const result = joinTextNodes([node], 0);

    expect(result).toMatch({
      text: "abc",
      offsetMap: [{ textPosition: 0, sourcePosition: 10 }],
    });
  });

  it("concatenates decoded strings of two plain-text nodes", () => {
    const node1: MappedText = {
      text: "foo",
      offsetMap: [{ textPosition: 0, sourcePosition: 100 }],
    };
    const node2: MappedText = {
      text: "bar",
      offsetMap: [{ textPosition: 0, sourcePosition: 200 }],
    };

    const result = joinTextNodes([node1, node2], 0);

    expect(result.text).toBe("foobar");
    expect(result.offsetMap).toMatch([
      { textPosition: 0, sourcePosition: 100 },
      { textPosition: 3, sourcePosition: 200 },
    ]);
  });

  it("preserves all offsetMap entries from each node and shifts decoded offsets", () => {
    // node1: decoded "a<b" with an entity for "<" at decoded offset 1
    const node1: MappedText = {
      text: "a<b",
      offsetMap: [
        { textPosition: 0, sourcePosition: 10 },
        { textPosition: 1, sourcePosition: 11 },
        { textPosition: 2, sourcePosition: 15 },
      ],
    };
    // node2: plain "cd"
    const node2: MappedText = {
      text: "cd",
      offsetMap: [{ textPosition: 0, sourcePosition: 20 }],
    };

    const result = joinTextNodes([node1, node2], 0);

    expect(result.text).toBe("a<bcd");
    expect(result.offsetMap).toMatch([
      { textPosition: 0, sourcePosition: 10 },
      { textPosition: 1, sourcePosition: 11 },
      { textPosition: 2, sourcePosition: 15 },
      { textPosition: 3, sourcePosition: 20 },
    ]);
  });

  it("concatenates three nodes and maps offsets correctly via textToSourcePosition", () => {
    const node1: MappedText = {
      text: "hi",
      offsetMap: [{ textPosition: 0, sourcePosition: 5 }],
    };
    const node2: MappedText = {
      text: " ",
      offsetMap: [{ textPosition: 0, sourcePosition: 50 }],
    };
    const node3: MappedText = {
      text: "world",
      offsetMap: [{ textPosition: 0, sourcePosition: 100 }],
    };

    const joined = joinTextNodes([node1, node2, node3], 0);

    expect(joined.text).toBe("hi world");
    // "hi" maps to source 5..6
    expect(textToSourcePosition(joined, 0)).toBe(5);
    expect(textToSourcePosition(joined, 1)).toBe(6);
    // " " maps to source 50
    expect(textToSourcePosition(joined, 2)).toBe(50);
    // "world" maps to source 100..104
    expect(textToSourcePosition(joined, 3)).toBe(100);
    expect(textToSourcePosition(joined, 7)).toBe(104);
    // end boundary
    expect(textToSourcePosition(joined, 8)).toBe(105);
  });
});
