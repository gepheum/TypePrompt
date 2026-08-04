import * as z from "zod";
import { InternalError, InternalErrors, TextSpan } from "../util/shared-types.js";
import { checkNoXmlAttributes, checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import { ElementNode } from "../xml/xml-types.js";
import { Tool } from "./compiler-types.js";
import { SchemaParseResult } from "../schema/schema-types.js";
import { checkAllAreElements } from "../xml/xml-node-checker.js";
import { extractTextContent } from "./text-extractor.js";
import { parseSchema } from "../schema/schema-parser.js";

/** Parses a <tool> element. The result has yet to be validated. */
export function parseTool(
  toolNode: ElementNode,
): Tool | InternalErrors {
  return ToolParser.parseTool(toolNode);
}

class ToolParser {
  static parseTool(toolNode: ElementNode): Tool | InternalErrors {
    const parser = new ToolParser(toolNode);
    return parser.parse();
  }

  private constructor(readonly toolNode: ElementNode) {}

  parse(): Tool | InternalErrors {
    // 1. Validate <tool> attributes.
    const attrs = checkXmlAttributes(this.toolNode, {
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

    this.parseChildren();

    if (this.errors.length > 0) {
      return { kind: "error", errors: this.errors };
    }

    return {
      kind: "success",
      name: name.value,
      namespace: namespace?.value ?? null,
      description: this.description!,
      schema: this.schema!,
    };
  }

  private parseChildren(): void {
    const requiredTags = ["description", "schema"] as const;
    const children = checkAllAreElements(
      this.toolNode.children,
      requiredTags,
      " in <tool>",
      this.errors,
    );
    const seenTags = new Set<"description" | "schema">();
    for (const [tag, child] of children) {
      if (seenTags.has(tag)) {
        this.errors.push({
          span: child.tag,
          message: `Multiple <${tag}> elements in <tool>`,
        });
      } else {
        seenTags.add(tag);
      }
      switch (tag) {
        case "description": {
          this.parseDescription(child);
          break;
        }
        case "schema": {
          this.parseSchema(child);
          break;
        }
      }
    }
    for (const tag of requiredTags) {
      if (seenTags.has(tag)) continue;
      this.errors.push({
        span: this.toolNode.tag,
        message: `Missing <${tag}> element`,
      });
    }
  }

  private parseSchema(schemaNode: ElementNode): void {
    this.errors.push(...checkNoXmlAttributes(schemaNode));
    const textContent = extractTextContent(schemaNode);
    if (textContent.kind === "error") {
      this.errors.push(...textContent.errors);
      return;
    }
    const schema = parseSchema(textContent.text);
    if (schema.kind === "error") {
      this.errors.push(...schema.errors);
    } else {
      this.schema = schema;
    }
  }

  private parseDescription(descriptionNode: ElementNode): void {
    this.errors.push(...checkNoXmlAttributes(descriptionNode));
      const body = parseBody(descriptionNode, this.errors, {
        hasValContext: false,
      });
      this.snippets.push({
        kind: "snippet",
        name: attrs.attributes.name.value,
        body: body,
      });
  }

  private readonly errors: InternalError[] = [];
  private schema: SchemaParseResult | null = null;
  private description: TextSpan | null = null;
}
