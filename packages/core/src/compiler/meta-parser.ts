import type { ValidationErrors } from "../util/shared-types.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { Meta, SchemaOrError } from "./compiler-types.js";

import { parseSchema } from "../schema/schema-parser.js";
import { validateSchema } from "../schema/schema-validator.js";
import { ValidationResultBuilder } from "../util/validation-result-builder.js";
import { checkMetaSourcePath } from "./file-naming-conventions.js";
import { extractTextContent } from "./text-extractor.js";

/** Parses a top-level <meta> element. The result is already validated. */
export function parseMeta(metaNode: ElementNode): Meta | ValidationErrors {
  const validationResult = new ValidationResultBuilder();
  const { definitionLinks, errors } = validationResult;

  const attrs = checkXmlAttributes(metaNode, {});
  errors.push(...attrs.errors);

  const warnings = [...checkMetaSourcePath(metaNode.path)];

  const textContent = extractTextContent(metaNode, "typescript");
  if (textContent.kind === "error") {
    errors.push(...textContent.errors);
    return validationResult.asErrors();
  }
  warnings.push(...textContent.warnings);

  let schema: SchemaOrError;
  const schemaParseResult = parseSchema(textContent.text, "meta");
  if (schemaParseResult.kind === "error") {
    schema = { ...schemaParseResult, definitionLinks: [] };
  } else {
    schema = validateSchema(schemaParseResult, null);
    definitionLinks.push(...schema.definitionLinks);
  }

  if (errors.length <= 0) {
    return {
      kind: "meta",
      tag: metaNode.tag,
      schema,
      warnings: textContent.warnings,
    };
  } else {
    return validationResult.asErrors();
  }
}
