import {
  InternalError,
  InternalErrors,
  MappedText,
} from "../util/common-types.js";
import { joinTextNodes } from "../util/text-node-joiner.js";
import { ElementNode } from "../xml/xml-types.js";

export function extractTextContent(node: ElementNode):
  | {
      readonly kind: "success";
      readonly text: MappedText;
    }
  | InternalErrors {
  const textNodes: MappedText[] = [];
  const errors: InternalError[] = [];
  for (const child of node.children) {
    if (child.kind === "text") {
      textNodes.push(child);
    } else {
      errors.push({
        span: child.tag,
        message: `Unexpected element '<${child.tag.text}>'`,
      });
    }
  }
  if (errors.length <= 0) {
    return {
      kind: "success",
      text: joinTextNodes(textNodes, node.contentStart),
    };
  } else {
    return {
      kind: "error",
      errors: errors,
    };
  }
}
