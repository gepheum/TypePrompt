import { Span } from "../util/shared-types.js";
import { Type } from "./schema-types.js";

export function getFirstToken(type: Type): Span {
  switch (type.kind) {
    case "any":
      return type.span;
    case "array":
      return getFirstToken(type.elementType);
    case "boolean-literal":
      return type.span;
    case "interface":
    case "record":
      return type.leftCurlyBracket;
    case "primitive":
      return type.primitive;
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
