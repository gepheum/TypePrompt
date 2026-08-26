import { Span } from "../util/shared-types.js";
import { FieldType } from "./schema-types.js";

export function getFirstToken(type: FieldType): Span {
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
    case "optional":
      return getFirstToken(type.innerType);
    case "primitive":
      return type.primitive;
    case "shared-type-name":
      return type.shared;
    case "string-literal":
      return type.quotedName;
    case "type-name":
      return type.name;
    case "union":
      return getFirstToken(type.members[0]!);
  }
}
