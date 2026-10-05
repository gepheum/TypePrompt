import { InternalError, InternalErrors } from "../util/shared-types.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import { ElementNode } from "../xml/xml-types.js";
import { Meta, SchemaOrError } from "./compiler-types.js";

import { parseSchema } from "../schema/schema-parser.js";
import { validateSchema } from "../schema/schema-validator.js";
import { checkMetaSourcePath } from "./file-naming-conventions.js";
import { extractTextContent } from "./text-extractor.js";

/** Parses a top-level <meta> element. The result is already validated. */
export function parseMeta(metaNode: ElementNode): Meta | InternalErrors {
  const attrs = checkXmlAttributes(metaNode, {});
  const errors = [...attrs.errors];

  const warnings: InternalError[] = [];
  warnings.push(...checkMetaSourcePath(metaNode.path));

  const textContent = extractTextContent(metaNode, "typescript");
  if (textContent.kind === "error") {
    return textContent;
  }
  warnings.push(...textContent.warnings);

  const schema = ((): SchemaOrError => {
    const schemaParseResult = parseSchema(textContent.text);
    if (schemaParseResult.kind === "error") {
      return { ...schemaParseResult, definitionLinks: [] };
    }
    return validateSchema(schemaParseResult, {
      kind: "meta",
    });
  })();

  if (errors.length <= 0) {
    return {
      kind: "meta",
      tag: metaNode.tag,
      schema: schema,
      warnings: textContent.warnings,
    };
  } else {
    return { kind: "error", errors };
  }
}
