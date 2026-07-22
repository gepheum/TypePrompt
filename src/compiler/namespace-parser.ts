import { InternalError, InternalErrors } from "../util/common-types.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import { ElementNode } from "../xml/xml-types.js";
import { Namespace } from "./compiler-types.js";

import * as z from "zod";
import { extractTextContent } from "./text-extractor.js";
import { parseSchema } from "../schema/schema-parser.js";

export function parseNamespace(
  namespaceNode: ElementNode,
): Namespace | InternalErrors {
  const attrs = checkXmlAttributes(namespaceNode, {
    name: {
      schema: z.string().regex(/^[A-Z][A-Za-z0-9]*$/),
      expected: "an UpperCamelCase identifier",
    },
  });
  if (attrs.kind === "error") {
    return attrs;
  }

  const textContent = extractTextContent(namespaceNode);
  if (textContent.kind === "error") {
    return textContent;
  }

  const schema = parseSchema(textContent.text);
  if (schema.kind === "error") {
    return schema;
  }

  return {
    kind: "namespace",
    name: attrs.attributes.name.span,
    schema: schema,
  };
}
