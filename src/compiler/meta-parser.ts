import { InternalErrors } from "../util/common-types.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import { ElementNode } from "../xml/xml-types.js";
import { Meta } from "./compiler-types.js";

import { parseSchema } from "../schema/schema-parser.js";
import { extractTextContent } from "./text-extractor.js";

export function parseMeta(metaNode: ElementNode): Meta | InternalErrors {
  const attrs = checkXmlAttributes(metaNode, {});
  if (attrs.kind === "error") {
    return attrs;
  }

  const textContent = extractTextContent(metaNode);
  if (textContent.kind === "error") {
    return textContent;
  }

  const schema = parseSchema(textContent.text);
  if (schema.kind === "error") {
    return schema;
  }

  return {
    kind: "meta",
    tag: metaNode.tag,
    schema: schema,
  };
}
