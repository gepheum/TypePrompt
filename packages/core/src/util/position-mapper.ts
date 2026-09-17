import { MappedText } from "./shared-types.js";

/**
 * Maps a position in a decoded text node to a position in the original XML file.
 */
export function textToSourcePosition(
  textNode: MappedText,
  textPosition: number,
): number {
  if (textPosition < 0 || textPosition > textNode.text.length) {
    throw new RangeError(
      `textPosition out of range: ${textPosition} (expected 0..${textNode.text.length})`,
    );
  }

  const segments = textNode.offsetMap;
  let selected = 0;
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i]!.textPosition > textPosition) {
      break;
    }
    selected = i;
  }

  const segment = segments[selected]!;
  return segment.sourcePosition + (textPosition - segment.textPosition);
}
