import { parseJson } from "../json/json-parser.js";
import { textToSourcePosition } from "../util/position-mapper.js";
import type { InternalErrors, MappedText } from "../util/shared-types.js";
import type { CTag } from "./ctag-types.js";

export function parseCTag(content: MappedText): CTag | InternalErrors {
  if (/^(\w+)$/.test(content.text)) {
    const identifier = content.text;
    return {
      kind: "identifier",
      identifier: {
        path: content.path,
        text: identifier,
        start: textToSourcePosition(content, 0),
        end: textToSourcePosition(content, identifier.length),
      },
    };
  } else if (
    /^"(\w+)"$/.test(content.text) ||
    /^'(\w+)'$/.test(content.text) ||
    /^`(\w+)`$/.test(content.text)
  ) {
    // Quoted identifier.
    const identifier = content.text.slice(1, -1);
    return {
      kind: "identifier",
      identifier: {
        path: content.path,
        text: identifier,
        start: textToSourcePosition(content, 1),
        end: textToSourcePosition(content, content.text.length - 1),
      },
    };
  } else {
    const json = parseJson(content, "loose");
    if (json.kind === "error") {
      return json;
    }
    return {
      kind: "json",
      json: json,
    };
  }
}
