import { InternalError } from "../util/common-types.js";

export type TextNodeJoin = {
  readonly decoded: string;
  /// Always non-empty. The first element always has `decodedOffset: 0`.
  readonly offsetMap: OffsetMap;
};

/// Segment-based mapping from decoded offsets back to source offsets.
///
/// Entries are sorted by `decodedOffset`. Each entry defines a decoded segment that
/// starts at `decodedOffset` and ends at the next entry's `decodedOffset` (or at
/// `decoded.length` for the last entry).
///
/// The decoded segment maps to the source range
/// `[sourceOffsetStart, sourceOffsetEnd)`.
export type OffsetMap = readonly OffsetMapEntry[];

export type OffsetMapEntry = {
  readonly decodedOffset: number;
  readonly sourceOffset: number;
};

/// Joins multiple non-overlapping text nodes into a single text node with a combined decoded string and offset map.
/// The resulting offsetMap entries have decoded offsets relative to the start of the joined string.
///
/// `sourceOffset` is used as the `sourceOffset` of the first entry when `textNodes` is empty.
export function joinTextNodes(
  textNodes: readonly TextNodeJoin[],
  sourceOffset: number,
): TextNodeJoin {
  if (textNodes.length === 0) {
    return { decoded: "", offsetMap: [{ decodedOffset: 0, sourceOffset }] };
  }
  let decoded = "";
  const offsetMap: OffsetMapEntry[] = [];
  let currentOffset = 0;

  for (const textNode of textNodes) {
    for (const entry of textNode.offsetMap) {
      offsetMap.push({
        decodedOffset: currentOffset + entry.decodedOffset,
        sourceOffset: entry.sourceOffset,
      });
    }
    currentOffset += textNode.decoded.length;
    decoded += textNode.decoded;
  }

  return { decoded, offsetMap };
}

/// Maps a decoded offset in a text node back to a source offset in the original source.
///
/// The offset is a boundary offset into `textNode.decoded`, in the range
/// `[0, textNode.decoded.length]`.
export function decodedToSourceOffset(
  textNode: TextNodeJoin,
  decodedOffset: number,
): number {
  if (!Number.isInteger(decodedOffset)) {
    throw new RangeError("decodedOffset must be an integer");
  }
  if (decodedOffset < 0 || decodedOffset > textNode.decoded.length) {
    throw new RangeError(
      `decodedOffset out of range: ${decodedOffset} (expected 0..${textNode.decoded.length})`,
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
  textNode: TextNodeJoin,
): (e: InternalError) => InternalError {
  return (e: InternalError) => ({
    span: {
      start: decodedToSourceOffset(textNode, e.span.start),
      end: decodedToSourceOffset(textNode, e.span.end),
    },
    message: e.message,
  });
}
