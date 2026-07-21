import { JsonValue } from "../json/json-types.js";
import { parseYaml } from "../json/yaml-parser.js";
import { parseSchema } from "../schema/schema-parser.js";
import { SchemaParseResult } from "../schema/schema-types.js";
import {
  InternalError,
  InternalErrors,
  TextSpan,
} from "../util/common-types.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import type { ElementNode } from "../xml/xml-types.js";
import { Body, OutputFormat, Snippet, Template } from "./compiler-types.js";

import * as z from "zod";
import { extractTextContent } from "./text-extractor.js";

export function parseTemplate(
  templateNode: ElementNode,
): Template | InternalErrors {
  return TemplateParser.parseTemplate(templateNode);
}

class TemplateParser {
  static parseTemplate(templateNode: ElementNode): Template | InternalErrors {
    const parser = new TemplateParser(templateNode);
    return parser.parse();
  }

  private constructor(readonly templateNode: ElementNode) {}

  parse(): Template | InternalErrors {
    // 1. Validate <template> attributes.
    const attrs = checkXmlAttributes(this.templateNode, {
      name: {
        schema: z.string().regex(/^[A-Z][A-Za-z0-9]*$/),
        expected: "an UpperCamelCase identifier",
      },
      namespace: {
        schema: z
          .string()
          .regex(/^[A-Z][A-Za-z0-9]*$/)
          .optional(),
        expected: "an UpperCamelCase identifier",
      },
      with: {
        schema: z.enum(["variants"]).optional(),
        expected: "'variants'",
      },
    });
    if (attrs.kind === "error") {
      return attrs;
    }

    const { name, namespace } = attrs.attributes;
    const hasVariants = attrs.attributes.with?.value === "variants";

    this.parseChildren({ hasVariants });

    if (this.errors.length > 0) {
      return { kind: "error", errors: this.errors };
    }

    return {
      kind: "success",
      name: name.span,
      namespace: namespace?.span ?? null,
      meta: this.meta,
      schema: this.schema!,
      outputFormat: this.outputFormat,
      snippets: this.snippets,
    };
  }

  private parseChildren(args: { hasVariants: boolean }): void {
    for (const child of this.templateNode.children) {
      switch (child.kind) {
        case "text": {
          if (!child.allWhitespace) {
            this.errors.push({
              span: child,
              message: "Unexpected text content in <template>",
            });
          }
          break;
        }
        case "element": {
          switch (child.tag.text) {
            case "meta": {
              this.parseMeta(child);
              break;
            }
            case "schema": {
              this.parseSchema(child);
              break;
            }
            case "snippet": {
              this.parseSnippet(child);
              break;
            }
            default: {
              break;
            }
          }
          break;
        }
      }
    }
    const { schema } = this;
    if (schema === null) {
      this.errors.push({
        span: this.templateNode.tag,
        message: "Missing <schema> element",
      });
    }
  }

  private parseMeta(metaNode: ElementNode): void {
    if (this.meta !== null) {
      this.errors.push({
        span: metaNode.tag,
        message: "Multiple <meta> elements found in <template>",
      });
    }
    const attrs = checkXmlAttributes(metaNode, {});
    if (attrs.kind === "error") {
      this.errors.push(...attrs.errors);
    }
    const textContent = extractTextContent(metaNode, this.errors);
    const meta = parseYaml(textContent);
    if (meta.kind === "error") {
      this.errors.push(...meta.errors);
    } else {
      this.meta = meta;
    }
  }

  private parseSchema(schemaNode: ElementNode): void {
    if (this.meta !== null) {
      this.errors.push({
        span: schemaNode.tag,
        message: "Multiple <schema> elements found in <template>",
      });
    }
    const attrs = checkXmlAttributes(schemaNode, {
      "output-format": {
        schema: z
          .string()
          .regex(/^[a-z][A-Za-z0-9]*$/)
          .optional(),
        expected: "a lowerCamelCase identifier",
      },
    });
    if (attrs.kind === "error") {
      this.errors.push(...attrs.errors);
    } else {
      const outputFormat = attrs.attributes["output-format"];
      if (outputFormat) {
        this.outputFormat = this.parseOutputFormat(outputFormat.span);
      }
    }
    const textContent = extractTextContent(schemaNode, this.errors);
    const schema = parseSchema(textContent);
    if (schema.kind === "error") {
      this.errors.push(...schema.errors);
    } else {
      this.schema = schema;
    }
  }

  private parseSnippet(snippetNode: ElementNode): void {
    // TODO
  }

  private parseOutputFormat(format: TextSpan): OutputFormat | null {
    const { text } = format;
    if (!/^[a-z][A-Za-z0-9]*$/.test(text)) {
      this.errors.push({
        span: format,
        message: "Expected: lowerCamelCase identifier",
      });
      return null;
    }
    const kind = text === "json" || text === "text" ? text : "custom";
    return {
      kind: kind,
      format: format,
    };
  }

  private readonly errors: InternalError[] = [];
  private meta: JsonValue<"strict"> | null = null;
  private schema: SchemaParseResult | null = null;
  private outputFormat: OutputFormat | null = null;
  private snippets: Snippet[] = [];
}

class PromptContentBuilder {
  system: Body | undefined;
  user: Body | undefined;
  examples: JsonValue<"strict"> | undefined;
}
