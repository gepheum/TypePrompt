import { MappedText, OffsetMapEntry } from "./shared-types.js";

/**
 * Joins multiple non-overlapping text nodes into a single text node with a combined
 * decoded string and offset map. The resulting `offsetMap` entries have decoded
 * offsets relative to the start of the joined string.
 *
 * `startPosition` is used as the `sourceOffset` of the first entry when `textNodes` is
 * empty.
 */
export function joinTextNodes(
  textNodes: readonly MappedText[],
  startPosition: number,
  path: string,
): MappedText {
  if (textNodes.length <= 0) {
    return {
      path,
      text: "",
      offsetMap: [
        {
          textPosition: 0,
          sourcePosition: startPosition,
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
        textPosition: currentOffset + entry.textPosition,
        sourcePosition: entry.sourcePosition,
      });
    }
    currentOffset += textNode.text.length;
    text += textNode.text;
  }

  return { path, text: text, offsetMap: offsetMap };
}
