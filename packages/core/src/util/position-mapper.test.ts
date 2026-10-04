import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { textToSourcePosition } from "./position-mapper.js";
import type { MappedText } from "./shared-types.js";
import { joinTextNodes } from "./text-node-joiner.js";

// ---------------------------------------------------------------------------
// textToSourcePosition
// ---------------------------------------------------------------------------

describe("textToSourcePosition - single segment (identity mapping)", () => {
  const node: MappedText = {
    path: "",
    text: "hello",
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };

  it("maps position 0 to source 0", () => {
    expect(textToSourcePosition(node, 0)).toBe(0);
  });

  it("maps a mid-string position by adding the delta", () => {
    expect(textToSourcePosition(node, 3)).toBe(3);
  });

  it("maps the end-of-string position (text.length)", () => {
    expect(textToSourcePosition(node, 5)).toBe(5);
  });
});

describe("textToSourcePosition - single segment with source offset", () => {
  const node: MappedText = {
    path: "",
    text: "hello",
    offsetMap: [{ textPosition: 0, sourcePosition: 10 }],
  };

  it("adds the source offset to position 0", () => {
    expect(textToSourcePosition(node, 0)).toBe(10);
  });

  it("adds the source offset to a mid-string position", () => {
    expect(textToSourcePosition(node, 3)).toBe(13);
  });

  it("adds the source offset to the end-of-string position", () => {
    expect(textToSourcePosition(node, 5)).toBe(15);
  });
});

describe("textToSourcePosition - multiple segments", () => {
  // text = "abcde" (5 chars)
  // segment 0: textPosition=0 → sourcePosition=100  (covers text[0..2])
  // segment 1: textPosition=3 → sourcePosition=200  (covers text[3..4])
  const node: MappedText = {
    path: "",
    text: "abcde",
    offsetMap: [
      { textPosition: 0, sourcePosition: 100 },
      { textPosition: 3, sourcePosition: 200 },
    ],
  };

  it("maps a position in the first segment", () => {
    expect(textToSourcePosition(node, 0)).toBe(100);
    expect(textToSourcePosition(node, 2)).toBe(102);
  });

  it("maps the position exactly at the second segment boundary", () => {
    expect(textToSourcePosition(node, 3)).toBe(200);
  });

  it("maps a position past the second segment boundary", () => {
    expect(textToSourcePosition(node, 4)).toBe(201);
    expect(textToSourcePosition(node, 5)).toBe(202);
  });
});

describe("textToSourcePosition - error cases", () => {
  const node: MappedText = {
    path: "",
    text: "hi",
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };

  it("throws RangeError for a negative position", () => {
    let threw = false;
    try {
      textToSourcePosition(node, -1);
    } catch (e) {
      threw = true;
      expect(e instanceof RangeError).toBe(true);
    }
    expect(threw).toBe(true);
  });

  it("throws RangeError for a position beyond text.length", () => {
    let threw = false;
    try {
      textToSourcePosition(node, 3); // text.length = 2
    } catch (e) {
      threw = true;
      expect(e instanceof RangeError).toBe(true);
    }
    expect(threw).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// joinTextNodes
// ---------------------------------------------------------------------------

describe("joinTextNodes - empty array", () => {
  it("returns empty text when given no nodes", () => {
    expect(joinTextNodes([], 0, "").text).toBe("");
  });

  it("uses startPosition as the single offsetMap entry's sourcePosition", () => {
    expect(joinTextNodes([], 42, "")).toMatch({
      offsetMap: [{ textPosition: 0, sourcePosition: 42 }],
    });
  });
});

describe("joinTextNodes - single node", () => {
  const node: MappedText = {
    path: "",
    text: "hello",
    offsetMap: [{ textPosition: 0, sourcePosition: 5 }],
  };

  it("preserves the text verbatim", () => {
    expect(joinTextNodes([node], 0, "").text).toBe("hello");
  });

  it("preserves the offsetMap entry unchanged", () => {
    expect(joinTextNodes([node], 0, "")).toMatch({
      offsetMap: [{ textPosition: 0, sourcePosition: 5 }],
    });
  });
});

describe("joinTextNodes - two nodes", () => {
  const nodeA: MappedText = {
    path: "",
    text: "abc",
    offsetMap: [{ textPosition: 0, sourcePosition: 10 }],
  };
  const nodeB: MappedText = {
    path: "",
    text: "de",
    offsetMap: [{ textPosition: 0, sourcePosition: 20 }],
  };

  it("concatenates the text of both nodes", () => {
    expect(joinTextNodes([nodeA, nodeB], 0, "").text).toBe("abcde");
  });

  it("keeps the first node's entry at textPosition 0 with its source position", () => {
    expect(joinTextNodes([nodeA, nodeB], 0, "")).toMatch({
      offsetMap: [
        { textPosition: 0, sourcePosition: 10 },
        { textPosition: 3, sourcePosition: 20 },
      ],
    });
  });

  it("produces spans that round-trip through textToSourcePosition", () => {
    const joined = joinTextNodes([nodeA, nodeB], 0, "");
    // positions in "abc" map to source 10+delta
    expect(textToSourcePosition(joined, 0)).toBe(10);
    expect(textToSourcePosition(joined, 2)).toBe(12);
    // positions in "de" map to source 20+delta
    expect(textToSourcePosition(joined, 3)).toBe(20);
    expect(textToSourcePosition(joined, 4)).toBe(21);
  });
});

describe("joinTextNodes - node with multiple offsetMap entries", () => {
  // nodeA has its own two segments; after joining, their textPositions must be
  // shifted by the length of any preceding nodes' text.
  const nodeA: MappedText = {
    path: "",
    text: "xx",
    offsetMap: [{ textPosition: 0, sourcePosition: 1 }],
  };
  const nodeB: MappedText = {
    path: "",
    text: "abc",
    offsetMap: [
      { textPosition: 0, sourcePosition: 100 },
      { textPosition: 2, sourcePosition: 200 },
    ],
  };

  it("shifts nodeB's textPositions by the length of nodeA", () => {
    const joined = joinTextNodes([nodeA, nodeB], 0, "");
    // nodeA contributes 2 chars, so nodeB's entries are shifted by 2
    expect(joined).toMatch({
      offsetMap: [
        { textPosition: 0, sourcePosition: 1 },
        { textPosition: 2, sourcePosition: 100 },
        { textPosition: 4, sourcePosition: 200 },
      ],
    });
  });

  it("round-trips positions correctly through textToSourcePosition", () => {
    const joined = joinTextNodes([nodeA, nodeB], 0, "");
    expect(textToSourcePosition(joined, 0)).toBe(1); // nodeA segment
    expect(textToSourcePosition(joined, 2)).toBe(100); // nodeB segment 0
    expect(textToSourcePosition(joined, 3)).toBe(101);
    expect(textToSourcePosition(joined, 4)).toBe(200); // nodeB segment 1
  });
});
