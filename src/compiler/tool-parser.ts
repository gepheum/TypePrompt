import * as z from "zod";
import { parseSchema } from "../schema/schema-parser.js";
import { SchemaParseResult } from "../schema/schema-types.js";
import { InternalError, InternalErrors } from "../util/shared-types.js";
import {
  checkNoXmlAttributes,
  checkXmlAttributes,
} from "../xml/xml-attributes-checker.js";
import { checkAllAreElements } from "../xml/xml-node-checker.js";
import { ElementNode } from "../xml/xml-types.js";
import { parseToolDescription } from "./body-parser.js";
import { Tool, ToolDescription } from "./compiler-types.js";
import { extractTextContent } from "./text-extractor.js";

/** Parses a <tool> element. The result has yet to be validated. */
export function parseTool(toolNode: ElementNode): Tool | InternalErrors {
  const attrs = checkXmlAttributes(toolNode, {
    name: {
      schema: z.string().regex(/^[a-z][A-Za-z0-9]*$/),
      expected: "a lowerCamelCase identifier",
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
  const errors: InternalError[] = [];

  let schema: SchemaParseResult | null = null;
  let description: ToolDescription | null = null;

  const requiredTags = ["description", "schema"] as const;
  const children = checkAllAreElements(
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
        const textContent = extractTextContent(child);
        if (textContent.kind === "error") {
          errors.push(...textContent.errors);
        } else {
          const parsed = parseSchema(textContent.text);
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

  if (errors.length > 0) {
    return { kind: "error", errors };
  }

  return {
    kind: "success",
    name: name.value,
    namespace: namespace?.value ?? null,
    description: description!,
    schema: schema!,
  };
}
