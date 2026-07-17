import { InternalErrors } from "../util/error-types.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import type { ElementNode } from "../xml/xml-types.js";
import { Template } from "./compiler-types.js";

import * as z from "zod";

export function parseTemplate(
  templateNode: ElementNode,
): Template | InternalErrors {
  // 1. Validate <template> attributes.
  const attrs = checkXmlAttributes(templateNode, {
    name: {
      schema: z.string().regex(/^[A-Z][A-Za-z0-9]*$/),
      expected: "an UpperCamelCase identifier",
    },
    namespace: {
      schema: z
        .string()
        .regex(/^[A-Z][A-Za-z0-9]*$/)
        .optional(),
      expected: "an UpperCamelCase identifier",
    },
  });
  if (attrs.kind === "error") {
    return attrs;
  }

  const { name, namespace } = attrs.attributes;

  return {
    kind: "success",
    name: name.span,
    namespace: namespace?.span ?? null,
    xmlSource: templateNode.contentSpan,
  };
}
