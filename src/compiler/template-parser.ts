import { parseCTag } from "../ctag/ctag-parser.js";
import { JsonValue } from "../json/json-types.js";
import { parseYaml } from "../json/yaml-parser.js";
import { parseSchema } from "../schema/schema-parser.js";
import { SchemaParseResult } from "../schema/schema-types.js";
import { InternalError, InternalErrors } from "../util/common-types.js";
import { joinTextNodes, TextNodeJoin } from "../xml/text-node-joiner.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import type { ElementNode } from "../xml/xml-types.js";
import { Body, OutputFormat, Snippet, Template } from "./compiler-types.js";

import * as z from "zod";

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
      xmlSource: this.templateNode.contentSpan,
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
              start: child.sourceSpan.start,
              end: child.sourceSpan.end,
              message: "Unexpected text content in <template>",
            });
          }
          break;
        }
        case "element": {
          switch (child.tagName.text) {
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
        start: this.templateNode.tagName.start,
        end: this.templateNode.tagName.end,
        message: "Missing <schema> element",
      });
    }
  }

  private parseMeta(metaNode: ElementNode): void {
    if (this.meta !== null) {
      this.errors.push({
        start: metaNode.tagName.start,
        end: metaNode.tagName.end,
        message: "Multiple <meta> elements found in <template>",
      });
    }
    const attrs = checkXmlAttributes(metaNode, {});
    if (attrs.kind === "error") {
      this.errors.push(...attrs.errors);
    }
    const textContent = this.extractTextContent(metaNode);
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
        start: schemaNode.tagName.start,
        end: schemaNode.tagName.end,
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
        const formatSpan = outputFormat.span;
        const formatText = formatSpan.text;
        const formatKind =
          formatText === "json"
            ? "json"
            : formatText === "text"
              ? "text"
              : "custom";
        this.outputFormat = {
          kind: formatKind,
          format: formatSpan,
        };
      }
    }
    const textContent = this.extractTextContent(schemaNode);
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

  private parseBody(parentNode: ElementNode): Body | InternalErrors {
    const pieces: RawBodyPiece[] = [];

    const visitChildren = (elem: ElementNode): void => {
      for (const child of elem.children) {
        if (child.kind === "text") {
          pieces.push({ kind: "text", text: child });
          continue;
        }

        const tag = child.tagName.text;

        if (tag === "c") {
          const attrs = checkXmlAttributes(child, {});
          if (attrs.kind === "error") {
            this.errors.push(...attrs.errors);
          }
          const textContent = this.extractTextContent(child);
          const cTag = parseCTag(textContent);
          if (cTag.kind === "error") {
            this.errors.push(...cTag.errors);
          } else {
            pieces.push({
              kind: "c-tag",
              text: textContent,
            });
          }
        } else if (tag === "enclosed") {
          const encAttrs = checkXmlAttributes(child, {
            tag: {
              schema: z.string().regex(/^[A-Za-z_][\w.-]*$/),
              expected: "a valid XML tag name",
            },
          });
          if (encAttrs.kind === "error") {
            this.errors.push(...encAttrs.errors);
          } else {
            const encTagName = encAttrs.attributes.tag.value;
            pieces.push({ kind: "synthetic-text", text: `<${encTagName}>` });
            visitChildren(child);
            pieces.push({ kind: "synthetic-text", text: `</${encTagName}>` });
          }
        } else if (tag === "insert") {
        } else {
          this.errors.push(child.tagName, `Unexpected element '<${tag}>'`);
        }
      }
    };

    visitChildren(parentNode);

    // TODO: convert
  }

  private extractTextContent(node: ElementNode): TextNodeJoin {
    const textNodes: TextNodeJoin[] = [];
    for (const child of node.children) {
      if (child.kind === "text") {
        textNodes.push(child);
      } else {
        this.errors.push({
          start: child.tagName.start,
          end: child.tagName.end,
          message: `Unexpected element '<${child.tagName.text}>'`,
        });
      }
    }
    return joinTextNodes(textNodes, node.contentSpan.start);
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

/** A piece collected from a raw XML body walk, before trim/dedent. */
type RawBodyPiece =
  | { readonly kind: "text"; readonly text: TextNodeJoin }
  | { readonly kind: "synthetic-text"; readonly text: string }
  | {
      readonly kind: "insert";
    }
  | { readonly kind: "c-tag"; readonly text: TextNodeJoin };
