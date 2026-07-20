import { parseJson } from "../json/json-parser.js";
import type { InternalErrors } from "../util/common-types.js";
import {
  TextNodeJoin,
  textToSourcePosition,
} from "../util/text-node-joiner.js";
import { CTag } from "./ctag-types.js";

export function parseCTag(content: TextNodeJoin): CTag | InternalErrors {
  if (/^(\w+)$/.test(content.decoded)) {
    const identifier = content.decoded;
    return {
      kind: "identifier",
      identifier: {
        text: identifier,
        start: textToSourcePosition(content, 0),
        end: textToSourcePosition(content, identifier.length),
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
