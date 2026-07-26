import { InternalErrors } from "../util/shared-types.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import { ElementNode } from "../xml/xml-types.js";
import { Namespace } from "./compiler-types.js";

import * as z from "zod";
import { parseSchema } from "../schema/schema-parser.js";
import { validateSchema } from "../schema/schema-validator.js";
import { extractTextContent } from "./text-extractor.js";

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

  const schemaParseResult = parseSchema(textContent.text);
  if (schemaParseResult.kind === "error") {
    return schemaParseResult;
  }

  const schema = validateSchema(schemaParseResult.typeDeclarations, {
    kind: "namespace",
  });
  if (schema.kind === "error") {
    return schema;
  }

  return {
    kind: "namespace",
    name: attrs.attributes.name.valueSpan,
    schema: schema,
  };
}
