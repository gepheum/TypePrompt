export type LineFinderData = {
  readonly content: string;
  /** Array where index `i` holds the character index where line `i` begins. */
  readonly lineStarts: readonly number[];
};

export type Line = {
  readonly zeroBasedLineNumber: number;
  readonly line: string;
  /**
   * Number of UTF-16 characters between the start of `content` and the start of
   * the line.
   */
  readonly linePosition: number;
};

export type LineMatch = {
  readonly line: Line;
  readonly zeroBasedColNumber: number;
};

/** Pre-computes line start offsets for `content`. */
export function createLineFinder(content: string): LineFinderData {
  const lineStarts: number[] = [0];
  let index = content.indexOf('\n');

  while (index !== -1) {
    lineStarts.push(index + 1);
    index = content.indexOf('\n', index + 1);
  }

  return { content, lineStarts };
}

/** Finds the line and column metrics for a given UTF-16 position. */
export function findLine(position: number, data: LineFinderData): LineMatch {
  const { content, lineStarts } = data;
  const clampedPosition = Math.max(0, Math.min(position, content.length));

  // Binary search to find the highest line index whose lineStart <= clampedPosition
  let low = 0;
  let high = lineStarts.length - 1;
  let lineIndex = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lineStarts[mid]! <= clampedPosition) {
      lineIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineStart = lineStarts[lineIndex]!;
  const nextLineStart =
    lineIndex + 1 < lineStarts.length ? lineStarts[lineIndex + 1]! : content.length;

  // Extract the line text, stripping trailing newline characters (\r\n or \n)
  let lineEnd = nextLineStart;
  if (lineEnd > lineStart && content.charCodeAt(lineEnd - 1) === 10 /* '\n' */) {
    lineEnd--;
    if (lineEnd > lineStart && content.charCodeAt(lineEnd - 1) === 13 /* '\r' */) {
      lineEnd--;
    }
  }

  return {
    line: {
      zeroBasedLineNumber: lineIndex,
      line: content.slice(lineStart, lineEnd),
      linePosition: lineStart,
    },
    zeroBasedColNumber: clampedPosition - lineStart,
  };
}
