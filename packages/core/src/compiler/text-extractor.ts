import {
  InternalError,
  InternalErrors,
  MappedText,
} from "@typeprompt/core/util/shared-types.js";
import { joinTextNodes } from "@typeprompt/core/util/text-node-joiner.js";
import { ElementNode } from "@typeprompt/core/xml/xml-types.js";

export function extractTextContent(
  node: ElementNode,
  format: "c-tag" | "typescript" | "yaml",
):
  | {
      readonly kind: "success";
      readonly text: MappedText;
      readonly warnings: readonly InternalError[];
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
        message: `Unexpected element <${child.tag.text}>`,
      });
    }
  }
  const warnings =
    format === "c-tag"
      ? []
      : node.comments.map((comment) => ({
          span: comment,
          message: ((): string => {
            switch (format) {
              case "typescript":
                return "Use TypeScript comments instead";
              case "yaml":
                return "Use YAML comments instead";
            }
          })(),
        }));
  if (errors.length <= 0) {
    return {
      kind: "success",
      text: joinTextNodes(textNodes, node.contentStart),
      warnings,
    };
  } else {
    return {
      kind: "error",
      errors: errors,
    };
  }
}
