import { InternalError, InternalErrors } from "../util/shared-types.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import { ElementNode } from "../xml/xml-types.js";
import { Namespace } from "./compiler-types.js";

import * as z from "zod";
import { parseSchema } from "../schema/schema-parser.js";
import { validateSchema } from "../schema/schema-validator.js";
import { DEFAULT_NAMESPACE } from "./default-namespace.js";
import { extractTextContent } from "./text-extractor.js";

/** Parses a top-level <namespace> element. The result is already validated. */
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
  const { name } = attrs.attributes;

  const errors: InternalError[] = [];

  const nameText = name.value.text;
  if (nameText.toLowerCase() === "shared") {
    const caseNote = nameText === "Shared" ? "" : " (case-insensitive)";
    errors.push({
      span: name.nameSpan,
      message: "Namespace name cannot be 'Shared'".concat(caseNote),
    });
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

  const textContent = extractTextContent(namespaceNode);
  if (textContent.kind === "error") {
    errors.push(...textContent.errors);
    return { kind: "error", errors };
  }

  const schemaParseResult = parseSchema(textContent.text);
  if (schemaParseResult.kind === "error") {
    errors.push(...schemaParseResult.errors);
    return { kind: "error", errors };
  }

  const schema = validateSchema(schemaParseResult.typeDeclarations, {
    kind: "namespace",
  });
  if (schema.kind === "error") {
    errors.push(...schema.errors);
    return { kind: "error", errors };
  }

  if (errors.length > 0) {
    return { kind: "error", errors };
  }

  return {
    kind: "namespace",
    name: attrs.attributes.name.value,
    schema: schema,
  };
}
