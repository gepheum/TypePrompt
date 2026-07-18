import { parseJson } from "../json/json-parser.js";
import type { InternalErrors } from "../util/error-types.js";
import { decodedOffsetToSourceOffset, TextNodeJoin } from "../xml/text-node-join.js";
import { CTag } from "./ctag-types.js";

export function parseCTag(content: TextNodeJoin): CTag | InternalErrors {
  if (/^(\w+)$/.test(content.decoded)) {
    const identifier = content.decoded;
    return {
      kind: "identifier",
      identifier: {
        text: identifier,
        start: decodedOffsetToSourceOffset(content, 0),
        end: decodedOffsetToSourceOffset(content, identifier.length),
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
    }
  }
}
