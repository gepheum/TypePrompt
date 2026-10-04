import { InternalError, InternalErrors } from "../util/shared-types.js";
import {
  checkXmlAttributes,
  expectIdentifier,
} from "../xml/xml-attributes-checker.js";
import { ElementNode } from "../xml/xml-types.js";
import { Namespace, SchemaOrError } from "./compiler-types.js";

import { parseSchema } from "../schema/schema-parser.js";
import { validateSchema } from "../schema/schema-validator.js";
import { DEFAULT_NAMESPACE } from "./default-namespace.js";
import { checkNamespaceSourcePath } from "./file-naming-conventions.js";
import { extractTextContent } from "./text-extractor.js";

/** Parses a top-level <namespace> element. The result is already validated. */
export function parseNamespace(
  namespaceNode: ElementNode,
  sourcePath: string,
): Namespace | InternalErrors {
  const attrs = checkXmlAttributes(namespaceNode, {
    name: expectIdentifier({
      format: "PascalCase",
      optional: false,
    }),
  });
  if (attrs.kind === "error") {
    return attrs;
  }
  const errors = [...attrs.errors];
  const warnings: InternalError[] = [];

  const { name } = attrs.attributes;

  const nameText = name.value.text;
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

  // Raise a warning if the file path doesn't match the file naming conventions.
  warnings.push(...checkNamespaceSourcePath(name, sourcePath));

  const textContent = extractTextContent(namespaceNode, "typescript");
  if (textContent.kind === "error") {
    errors.push(...textContent.errors);
    return { kind: "error", errors };
  }

  warnings.push(...textContent.warnings);

  const schema = ((): SchemaOrError => {
    const schemaParseResult = parseSchema(textContent.text);
    if (schemaParseResult.kind === "error") {
      return schemaParseResult;
    }
    return validateSchema(schemaParseResult, {
      kind: "namespace",
    });
  })();

  if (errors.length >= 1) {
    return { kind: "error", errors };
  }

  return {
    kind: "namespace",
    name: attrs.attributes.name.value,
    schema,
    warnings,
  };
}
