import { ErrorSink } from "../util/shared-types.js";
import { ElementNode, XmlNode } from "./xml-types.js";

export function checkAllAreElements<Tags extends readonly string[]>(
  nodes: readonly XmlNode[],
  tags: Tags,
  errors: ErrorSink,
  messageSuffix: string,
): ReadonlyArray<[Tags[number], ElementNode]> {
  if (!messageSuffix.startsWith(" ")) {
    throw new Error("messageSuffix must start with a space");
  }
  const tagSet = new Set(tags);
  const result: Array<[Tags[number], ElementNode]> = [];
  for (const node of nodes) {
    if (node.kind === "text") {
      if (!node.allWhitespace) {
        errors.push({
          span: node,
          message: "Unexpected text content".concat(messageSuffix),
        });
      }
      continue;
    }
    const tag = node.tag.text;
    if (tagSet.has(tag)) {
      result.push([tag as Tags[number], node]);
    } else {
      errors.push({
        span: node.tag,
        message: `Unexpected element <${tag}>${messageSuffix}`,
        suggestions: tags,
      });
      continue;
    }
  }
  return result;
}
