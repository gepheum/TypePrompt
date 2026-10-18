import { parseSchema } from "../schema/schema-parser.js";
import type { SchemaParseResult } from "../schema/schema-types.js";
import type { InternalError, InternalErrors } from "../util/shared-types.js";
import {
  checkNoXmlAttributes,
  expectIdentifier,
} from "../xml/xml-attributes-checker.js";
import {
  checkAllAreKnownElements,
  checkKnownXmlAttributes,
} from "../xml/xml-entities.js";
import type { ElementNode } from "../xml/xml-types.js";
import { parseToolDescription } from "./body-parser.js";
import type { Tool, ToolDescription } from "./compiler-types.js";
import { checkTemplateOrToolSourcePath } from "./file-naming-conventions.js";
import { extractTextContent } from "./text-extractor.js";

/** Parses a <tool> element. The result has yet to be validated. */
export function parseTool(toolNode: ElementNode): Tool | InternalErrors {
  const attrs = checkKnownXmlAttributes(toolNode, {
    name: expectIdentifier({
      format: "camelCase",
      optional: false,
    }),
    namespace: expectIdentifier({
      format: "PascalCase",
      optional: true,
    }),
  });
  if (attrs.kind === "error") {
    return attrs;
  }
  const errors = [...attrs.errors];
  const warnings: InternalError[] = [];

  const { name, namespace } = attrs.attributes;

  const nameText = name.value.text;
  for (const reserved of ["shared", "meta"]) {
    if (nameText === reserved) {
      errors.push({
        span: name.nameSpan,
        message: `Tool name cannot be '${reserved}`,
      });
    }
  }

  // Raise a warning if the file path doesn't match the file naming conventions.
  warnings.push(
    ...checkTemplateOrToolSourcePath(name, namespace, toolNode.path),
  );

  let schema: SchemaParseResult<"tool"> | null = null;
  let description: ToolDescription | null = null;

  const requiredTags = ["description", "schema"] as const;
  const children = checkAllAreKnownElements(
    toolNode.children,
    requiredTags,
    " in <tool>",
    errors,
  );
  const seenTags = new Set<"description" | "schema">();
  for (const [tag, child] of children) {
    if (seenTags.has(tag)) {
      errors.push({
        span: child.tag,
        message: `Multiple <${tag}> elements in <tool>`,
      });
    } else {
      seenTags.add(tag);
    }
    switch (tag) {
      case "description": {
        errors.push(...checkNoXmlAttributes(child));
        description = parseToolDescription(child, errors);
        break;
      }
      case "schema": {
        errors.push(...checkNoXmlAttributes(child));
        const textContent = extractTextContent(child, "typescript");
        if (textContent.kind === "error") {
          errors.push(...textContent.errors);
        } else {
          warnings.push(...textContent.warnings);
          const parsed = parseSchema(textContent.text, "tool");
          if (parsed.kind === "error") {
            errors.push(...parsed.errors);
          } else {
            schema = parsed;
          }
        }
        break;
      }
      default: {
        const _: never = tag;
        throw new Error(_);
      }
    }
  }
  for (const tag of requiredTags) {
    if (seenTags.has(tag)) continue;
    errors.push({ span: toolNode.tag, message: `Missing <${tag}> element` });
  }

  if (errors.length >= 1) {
    return { kind: "error", errors };
  }

  return {
    kind: "tool",
    name: name.value,
    namespace: namespace?.value ?? null,
    description: description!,
    schema: schema!,
    warnings,
  };
}
