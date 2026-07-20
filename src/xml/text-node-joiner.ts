import {
  InternalError,
  MappedText,
  OffsetMapEntry,
} from "../util/common-types.js";

/**
 * Joins multiple non-overlapping text nodes into a single text node with a combined
 * decoded string and offset map. The resulting offsetMap entries have decoded offsets
 * relative to the start of the joined string.
 *
 * `startPosition` is used as the `sourceOffset` of the first entry when `textNodes` is
 * empty.
 */
export function joinTextNodes(
  textNodes: readonly MappedText[],
  startPosition: number,
): MappedText {
  if (textNodes.length === 0) {
    return {
      text: "",
      offsetMap: [
        {
          decodedOffset: 0,
          sourceOffset: startPosition,
        },
      ],
    };
  }
  let text = "";
  const offsetMap: OffsetMapEntry[] = [];
  let currentOffset = 0;

  for (const textNode of textNodes) {
    for (const entry of textNode.offsetMap) {
      offsetMap.push({
        decodedOffset: currentOffset + entry.decodedOffset,
        sourceOffset: entry.sourceOffset,
      });
    }
    currentOffset += textNode.text.length;
    text += textNode.text;
  }

  return { text: text, offsetMap: offsetMap };
}

/**
 * Maps a position in a decoded text node to a position in the original XML file.
 */
export function decodedToSourceOffset(
  textNode: MappedText,
  decodedOffset: number,
): number {
  if (!Number.isInteger(decodedOffset)) {
    throw new RangeError("decodedOffset must be an integer");
  }
  if (decodedOffset < 0 || decodedOffset > textNode.text.length) {
    throw new RangeError(
      `decodedOffset out of range: ${decodedOffset} (expected 0..${textNode.text.length})`,
    );
  }

  const segments = textNode.offsetMap;
  let selected = 0;
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i]!.decodedOffset > decodedOffset) {
      break;
    }
    selected = i;
  }

  const segment = segments[selected]!;
  return segment.sourceOffset + (decodedOffset - segment.decodedOffset);
}

export function decodedToSourceOffsets(
  textNode: MappedText,
): (e: InternalError) => InternalError {
  return (e: InternalError) => ({
    span: {
      start: decodedToSourceOffset(textNode, e.span.start),
      end: decodedToSourceOffset(textNode, e.span.end),
    },
    message: e.message,
  });
}
