import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { TextNodeJoin } from "./text-node-join.js";
import {
  joinTextNodes,
  textNodeDecodedOffsetToSourceOffset,
} from "./text-node-join.js";
import { parseXmlDocument } from "./xml-parser.js";
import type { ElementNode, TextNode } from "./xml-types.js";

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

describe("textNodeDecodedOffsetToSourceOffset", () => {
  it("maps decoded offsets to source offsets for plain text", () => {
    const input = "<root>abc</root>";
    const result = expectSuccess(parseXmlDocument(input));
    const root = result.root.children[0] as ElementNode;
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
    const root = result.root.children[0] as ElementNode;
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
    const root = result.root.children[0] as ElementNode;
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
    const root = result.root.children[0] as ElementNode;
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
    const emptyNode: TextNodeJoin = {
      decoded: "",
      offsetMap: [{ decodedOffset: 0, sourceOffset: 42 }],
    };

    expect(textNodeDecodedOffsetToSourceOffset(emptyNode, 0)).toBe(42);
  });
});

describe("joinTextNodes", () => {
  it("returns an empty decoded string with a single offset entry for an empty list", () => {
    const result = joinTextNodes([], 42);

    expect(result).toMatch({
      decoded: "",
      offsetMap: [{ decodedOffset: 0, sourceOffset: 42 }],
    });
  });

  it("returns the single node unchanged for a one-element list", () => {
    const node: TextNodeJoin = {
      decoded: "abc",
      offsetMap: [{ decodedOffset: 0, sourceOffset: 10 }],
    };

    const result = joinTextNodes([node], 0);

    expect(result).toMatch({
      decoded: "abc",
      offsetMap: [{ decodedOffset: 0, sourceOffset: 10 }],
    });
  });

  it("concatenates decoded strings of two plain-text nodes", () => {
    const node1: TextNodeJoin = {
      decoded: "foo",
      offsetMap: [{ decodedOffset: 0, sourceOffset: 100 }],
    };
    const node2: TextNodeJoin = {
      decoded: "bar",
      offsetMap: [{ decodedOffset: 0, sourceOffset: 200 }],
    };

    const result = joinTextNodes([node1, node2], 0);

    expect(result.decoded).toBe("foobar");
    expect(result.offsetMap).toMatch([
      { decodedOffset: 0, sourceOffset: 100 },
      { decodedOffset: 3, sourceOffset: 200 },
    ]);
  });

  it("preserves all offsetMap entries from each node and shifts decoded offsets", () => {
    // node1: decoded "a<b" with an entity for "<" at decoded offset 1
    const node1: TextNodeJoin = {
      decoded: "a<b",
      offsetMap: [
        { decodedOffset: 0, sourceOffset: 10 },
        { decodedOffset: 1, sourceOffset: 11 },
        { decodedOffset: 2, sourceOffset: 15 },
      ],
    };
    // node2: plain "cd"
    const node2: TextNodeJoin = {
      decoded: "cd",
      offsetMap: [{ decodedOffset: 0, sourceOffset: 20 }],
    };

    const result = joinTextNodes([node1, node2], 0);

    expect(result.decoded).toBe("a<bcd");
    expect(result.offsetMap).toMatch([
      { decodedOffset: 0, sourceOffset: 10 },
      { decodedOffset: 1, sourceOffset: 11 },
      { decodedOffset: 2, sourceOffset: 15 },
      { decodedOffset: 3, sourceOffset: 20 },
    ]);
  });

  it("concatenates three nodes and maps offsets correctly via textNodeDecodedOffsetToSourceOffset", () => {
    const node1: TextNodeJoin = {
      decoded: "hi",
      offsetMap: [{ decodedOffset: 0, sourceOffset: 5 }],
    };
    const node2: TextNodeJoin = {
      decoded: " ",
      offsetMap: [{ decodedOffset: 0, sourceOffset: 50 }],
    };
    const node3: TextNodeJoin = {
      decoded: "world",
      offsetMap: [{ decodedOffset: 0, sourceOffset: 100 }],
    };

    const joined = joinTextNodes([node1, node2, node3], 0);

    expect(joined.decoded).toBe("hi world");
    // "hi" maps to source 5..6
    expect(textNodeDecodedOffsetToSourceOffset(joined, 0)).toBe(5);
    expect(textNodeDecodedOffsetToSourceOffset(joined, 1)).toBe(6);
    // " " maps to source 50
    expect(textNodeDecodedOffsetToSourceOffset(joined, 2)).toBe(50);
    // "world" maps to source 100..104
    expect(textNodeDecodedOffsetToSourceOffset(joined, 3)).toBe(100);
    expect(textNodeDecodedOffsetToSourceOffset(joined, 7)).toBe(104);
    // end boundary
    expect(textNodeDecodedOffsetToSourceOffset(joined, 8)).toBe(105);
  });
});
