import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { createLineFinder, findLine } from "./line-finder.js";

// ---------------------------------------------------------------------------
// createLineFinder
// ---------------------------------------------------------------------------

describe("createLineFinder", () => {
  it("computes lineStarts for an empty string", () => {
    expect(createLineFinder("")).toMatch({
      content: "",
      lineStarts: [0],
    });
  });

  it("computes lineStarts for a single-line string without newline", () => {
    expect(createLineFinder("hello world")).toMatch({
      content: "hello world",
      lineStarts: [0],
    });
  });

  it("computes lineStarts for a single line with trailing newline", () => {
    expect(createLineFinder("hello\n")).toMatch({
      content: "hello\n",
      lineStarts: [0, 6],
    });
  });

  it("computes lineStarts for multi-line text with LF", () => {
    expect(createLineFinder("aaa\nbbb\nccc")).toMatch({
      content: "aaa\nbbb\nccc",
      lineStarts: [0, 4, 8],
    });
  });

  it("computes lineStarts for text with empty lines", () => {
    expect(createLineFinder("a\n\nb\n")).toMatch({
      content: "a\n\nb\n",
      lineStarts: [0, 2, 3, 5],
    });
  });

  it("computes lineStarts for text with Windows CRLF newlines", () => {
    expect(createLineFinder("foo\r\nbar\r\nbaz")).toMatch({
      content: "foo\r\nbar\r\nbaz",
      lineStarts: [0, 5, 10],
    });
  });

  it("computes lineStarts for consecutive newlines", () => {
    expect(createLineFinder("\n\n\n")).toMatch({
      content: "\n\n\n",
      lineStarts: [0, 1, 2, 3],
    });
  });
});

// ---------------------------------------------------------------------------
// findLine - single line
// ---------------------------------------------------------------------------

describe("findLine - single line", () => {
  const data = createLineFinder("hello world");

  it("finds position 0 at start of line", () => {
    expect(findLine(0, data)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "hello world",
        linePosition: 0,
      },
      zeroBasedColNumber: 0,
    });
  });

  it("finds mid-string position", () => {
    expect(findLine(6, data)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "hello world",
        linePosition: 0,
      },
      zeroBasedColNumber: 6,
    });
  });

  it("finds position at end of line (content.length)", () => {
    expect(findLine(11, data)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "hello world",
        linePosition: 0,
      },
      zeroBasedColNumber: 11,
    });
  });

  it("handles empty content", () => {
    const emptyData = createLineFinder("");
    expect(findLine(0, emptyData)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "",
        linePosition: 0,
      },
      zeroBasedColNumber: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// findLine - multi-line with LF (\n)
// ---------------------------------------------------------------------------

describe("findLine - multi-line with LF", () => {
  // Line 0: "first" (pos 0..5, \n at pos 5)
  // Line 1: "second line" (pos 6..17, \n at pos 17)
  // Line 2: "third" (pos 18..23)
  const data = createLineFinder("first\nsecond line\nthird");

  it("finds position at start of first line (pos 0)", () => {
    expect(findLine(0, data)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "first",
        linePosition: 0,
      },
      zeroBasedColNumber: 0,
    });
  });

  it("finds position at newline character of first line (pos 5)", () => {
    expect(findLine(5, data)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "first",
        linePosition: 0,
      },
      zeroBasedColNumber: 5,
    });
  });

  it("finds position at start of second line (pos 6)", () => {
    expect(findLine(6, data)).toMatch({
      line: {
        zeroBasedLineNumber: 1,
        line: "second line",
        linePosition: 6,
      },
      zeroBasedColNumber: 0,
    });
  });

  it("finds position in middle of second line (pos 13)", () => {
    expect(findLine(13, data)).toMatch({
      line: {
        zeroBasedLineNumber: 1,
        line: "second line",
        linePosition: 6,
      },
      zeroBasedColNumber: 7,
    });
  });

  it("finds position at newline character of second line (pos 17)", () => {
    expect(findLine(17, data)).toMatch({
      line: {
        zeroBasedLineNumber: 1,
        line: "second line",
        linePosition: 6,
      },
      zeroBasedColNumber: 11,
    });
  });

  it("finds position at start of third line (pos 18)", () => {
    expect(findLine(18, data)).toMatch({
      line: {
        zeroBasedLineNumber: 2,
        line: "third",
        linePosition: 18,
      },
      zeroBasedColNumber: 0,
    });
  });

  it("finds position at end of third line (pos 23)", () => {
    expect(findLine(23, data)).toMatch({
      line: {
        zeroBasedLineNumber: 2,
        line: "third",
        linePosition: 18,
      },
      zeroBasedColNumber: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// findLine - trailing newline and empty lines
// ---------------------------------------------------------------------------

describe("findLine - trailing newline and empty lines", () => {
  // Line 0: "alpha" (pos 0..5, \n at pos 5)
  // Line 1: ""      (pos 6..7, \n at pos 6)
  // Line 2: "beta"  (pos 7..12, \n at pos 11)
  // Line 3: ""      (pos 12)
  const data = createLineFinder("alpha\n\nbeta\n");

  it("finds position on first line", () => {
    expect(findLine(2, data)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "alpha",
        linePosition: 0,
      },
      zeroBasedColNumber: 2,
    });
  });

  it("finds position on empty line in middle (pos 6)", () => {
    expect(findLine(6, data)).toMatch({
      line: {
        zeroBasedLineNumber: 1,
        line: "",
        linePosition: 6,
      },
      zeroBasedColNumber: 0,
    });
  });

  it("finds position on third line (pos 8)", () => {
    expect(findLine(8, data)).toMatch({
      line: {
        zeroBasedLineNumber: 2,
        line: "beta",
        linePosition: 7,
      },
      zeroBasedColNumber: 1,
    });
  });

  it("finds position on trailing empty line (pos 12)", () => {
    expect(findLine(12, data)).toMatch({
      line: {
        zeroBasedLineNumber: 3,
        line: "",
        linePosition: 12,
      },
      zeroBasedColNumber: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// findLine - Windows CRLF (\r\n)
// ---------------------------------------------------------------------------

describe("findLine - Windows CRLF", () => {
  // Line 0: "first" (pos 0..7, \r\n at 5..7)
  // Line 1: "second" (pos 7..15, \r\n at 13..15)
  // Line 2: "third" (pos 15..20)
  const data = createLineFinder("first\r\nsecond\r\nthird");

  it("strips trailing \\r\\n from line 0 text and finds mid-line col", () => {
    expect(findLine(3, data)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "first",
        linePosition: 0,
      },
      zeroBasedColNumber: 3,
    });
  });

  it("finds position at \\r character on line 0 (pos 5)", () => {
    expect(findLine(5, data)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "first",
        linePosition: 0,
      },
      zeroBasedColNumber: 5,
    });
  });

  it("finds position at \\n character on line 0 (pos 6)", () => {
    expect(findLine(6, data)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "first",
        linePosition: 0,
      },
      zeroBasedColNumber: 6,
    });
  });

  it("strips trailing \\r\\n from line 1 text and finds start of line 1 (pos 7)", () => {
    expect(findLine(7, data)).toMatch({
      line: {
        zeroBasedLineNumber: 1,
        line: "second",
        linePosition: 7,
      },
      zeroBasedColNumber: 0,
    });
  });

  it("finds position on line 2 (pos 17)", () => {
    expect(findLine(17, data)).toMatch({
      line: {
        zeroBasedLineNumber: 2,
        line: "third",
        linePosition: 15,
      },
      zeroBasedColNumber: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// findLine - clamping behavior
// ---------------------------------------------------------------------------

describe("findLine - clamping behavior", () => {
  const data = createLineFinder("abc\ndef");

  it("clamps negative position to 0", () => {
    expect(findLine(-10, data)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "abc",
        linePosition: 0,
      },
      zeroBasedColNumber: 0,
    });
  });

  it("clamps out-of-bounds position to content.length", () => {
    expect(findLine(100, data)).toMatch({
      line: {
        zeroBasedLineNumber: 1,
        line: "def",
        linePosition: 4,
      },
      zeroBasedColNumber: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// findLine - binary search on many lines
// ---------------------------------------------------------------------------

describe("findLine - binary search across multiple lines", () => {
  const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}`);
  const text = lines.join("\n");
  const data = createLineFinder(text);

  it("finds position on first line (line 0)", () => {
    expect(findLine(2, data)).toMatch({
      line: {
        zeroBasedLineNumber: 0,
        line: "Line 0",
        linePosition: 0,
      },
      zeroBasedColNumber: 2,
    });
  });

  it("finds position in middle lines (line 9)", () => {
    // Length of each "Line X\n" for 0..9 is 7 chars
    const pos = 9 * 7 + 3; // "Line 9", offset 3 -> 'e'
    expect(findLine(pos, data)).toMatch({
      line: {
        zeroBasedLineNumber: 9,
        line: "Line 9",
        linePosition: 9 * 7,
      },
      zeroBasedColNumber: 3,
    });
  });

  it("finds position on double-digit line (line 15)", () => {
    // Lines 0..9: 10 lines * 7 chars = 70 chars
    // Lines 10..14: 5 lines * 8 chars ("Line 10\n") = 40 chars
    // Line 15 starts at 110
    const lineStart = 70 + 40;
    expect(findLine(lineStart + 5, data)).toMatch({
      line: {
        zeroBasedLineNumber: 15,
        line: "Line 15",
        linePosition: lineStart,
      },
      zeroBasedColNumber: 5,
    });
  });

  it("finds position on last line (line 19)", () => {
    // Line 19 starts at 70 + 9 * 8 = 142
    const lineStart = 70 + 9 * 8;
    expect(findLine(lineStart, data)).toMatch({
      line: {
        zeroBasedLineNumber: 19,
        line: "Line 19",
        linePosition: lineStart,
      },
      zeroBasedColNumber: 0,
    });
  });
});
