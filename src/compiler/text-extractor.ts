import { ErrorSink, MappedText } from "../util/common-types.js";
import { joinTextNodes } from "../util/text-node-joiner.js";
import { ElementNode } from "../xml/xml-types.js";

export function extractTextContent(
  node: ElementNode,
  errors: ErrorSink,
): MappedText {
  const textNodes: MappedText[] = [];
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
  return joinTextNodes(textNodes, node.contentStart);
}
