import { InternalErrors } from "../util/shared-types.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import { ElementNode } from "../xml/xml-types.js";
import { Meta } from "./compiler-types.js";

import { parseSchema } from "../schema/schema-parser.js";
import { validateSchema } from "../schema/schema-validator.js";
import { extractTextContent } from "./text-extractor.js";

/** Parses a top-level <meta> element. The result is already validated. */
export function parseMeta(metaNode: ElementNode): Meta | InternalErrors {
  const attrs = checkXmlAttributes(metaNode, {});
  if (attrs.kind === "error") {
    return attrs;
  }

  const textContent = extractTextContent(metaNode, "typescript");
  if (textContent.kind === "error") {
    return textContent;
  }

  const schemaParseResult = parseSchema(textContent.text);
  if (schemaParseResult.kind === "error") {
    return schemaParseResult;
  }

  const schema = validateSchema(schemaParseResult.typeDeclarations, {
    kind: "meta",
  });
  if (schema.kind === "error") {
    return schema;
  }

  return {
    kind: "meta",
    tag: metaNode.tag,
    schema: schema,
    warnings: textContent.warnings,
  };
}
