import { Span } from "../util/shared-types.js";
import { Type } from "./schema-types.js";

export function getFirstToken(type: Type): Span {
  switch (type.kind) {
    case "array":
      return getFirstToken(type.elementType);
    case "interface":
      return type.leftCurlyBracket;
    case "string-literal":
      return type.quotedName;
    case "type-name":
      return type.name;
    case "shared-type-name":
      return type.shared;
    case "union":
      return getFirstToken(type.members[0]!);
  }
}
