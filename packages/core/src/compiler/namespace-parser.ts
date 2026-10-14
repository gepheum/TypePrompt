import type { ValidationErrors } from "../util/shared-types.js";
import {
  checkXmlAttributes,
  expectIdentifier,
} from "../xml/xml-attributes-checker.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { Namespace, SchemaOrError } from "./compiler-types.js";

import { parseSchema } from "../schema/schema-parser.js";
import { validateSchema } from "../schema/schema-validator.js";
import { ValidationResultBuilder } from "../util/validation-result-builder.js";
import { DEFAULT_NAMESPACE } from "./default-namespace.js";
import { checkNamespaceSourcePath } from "./file-naming-conventions.js";
import { extractTextContent } from "./text-extractor.js";

/** Parses a top-level <namespace> element. The result is already validated. */
export function parseNamespace(
  namespaceNode: ElementNode,
): Namespace | ValidationErrors {
  const validationResult = new ValidationResultBuilder();
  const { definitionLinks, errors } = validationResult;

  const attrs = checkXmlAttributes(namespaceNode, {
    name: expectIdentifier({
      format: "PascalCase",
      optional: false,
    }),
  });

  errors.push(...attrs.errors);
  if (attrs.kind === "error") {
    return validationResult.asErrors();
  }

  const { name } = attrs.attributes;
  const nameText = name.value.text;

  // Raise a warning if the file path doesn't match the file naming conventions.
  const warnings = [...checkNamespaceSourcePath(name, namespaceNode.path)];

  for (const reserved of ["Meta", "Schema"]) {
    if (nameText.toLowerCase() === reserved.toLowerCase()) {
      const caseNote = nameText === reserved ? "" : " (case-insensitive)";
      errors.push({
        span: name.nameSpan,
        message: `Namespace name cannot be '${reserved}'${caseNote}`,
      });
    }
  }
  if (
    nameText.toLowerCase() === DEFAULT_NAMESPACE.toLowerCase() &&
    nameText !== DEFAULT_NAMESPACE
  ) {
    errors.push({
      span: name.nameSpan,
      message: `Use proper casing: '${DEFAULT_NAMESPACE}' instead of '${nameText}'`,
    });
  }

  const textContent = extractTextContent(namespaceNode, "typescript");
  if (textContent.kind === "error") {
    errors.push(...textContent.errors);
    return validationResult.asErrors();
  }

  warnings.push(...textContent.warnings);

  let schema: SchemaOrError;
  const schemaParseResult = parseSchema(textContent.text, "namespace");
  if (schemaParseResult.kind === "error") {
    schema = { ...schemaParseResult, definitionLinks: [] };
  } else {
    schema = validateSchema(schemaParseResult, null);
    definitionLinks.push(...schema.definitionLinks);
  }

  if (errors.length <= 0) {
    return {
      kind: "namespace",
      name: attrs.attributes.name.value,
      schema,
      warnings,
    };
  } else {
    return validationResult.asErrors();
  }
}
