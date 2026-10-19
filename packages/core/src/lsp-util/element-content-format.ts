import type { KnownAttribute, KnownTag } from "../xml/xml-entities.js";
import type { ElementNode } from "../xml/xml-types.js";

/** Format expected inside an XML element. */
export type ElementContentFormat =
  | "yaml"
  | "schema"
  | "rendered-xml"  // Children may include text nodes
  | "unrendered-xml"  // Children may not include text nodes
  ;

export function getElementContentFormat(
  node: ElementNode,
  depth: number,
): "yaml" | "schema" | "rendered-xml" | "unrendered-xml" {
  // Cast to KnownTag so we can have an exhaustive switch.
  // We still need to handle 'default'.
  const tag = node.tag.text as KnownTag;
  switch (tag) {
    case "namespace":
    case "schema":
      return "schema";
    case "meta":
      return depth <= 0 ? "schema" : "yaml";
    case "tools":
    case "examples":
      return "yaml";
    case "system":
    case "user":
    case "description":
    case "then":
    case "else":
    case "on":
      return "rendered-xml";
    case "snippet": {
      return node.attributes["if" satisfies KnownAttribute] ||
        node.attributes["switch" satisfies KnownAttribute]
        ? "unrendered-xml"
        : "rendered-xml";
    }
    case "c":
    case "enclosed":
    case "insert":
    case "template":
    case "tool":
    case "variant":
      return "unrendered-xml";
    default: {
      const _: never = tag;
      return "unrendered-xml";
    }
  }
}
