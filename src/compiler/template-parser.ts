import { JsonValue } from "../json/json-types.js";
import { parseYaml } from "../json/yaml-parser.js";
import { parseSchema } from "../schema/schema-parser.js";
import { SchemaParseResult } from "../schema/schema-types.js";
import { InternalError, InternalErrors } from "../util/error-types.js";
import {
  decodedOffsetsToSourceOffsets,
  joinTextNodes,
  TextNodeJoin,
} from "../xml/text-node-join.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import type { ElementNode } from "../xml/xml-types.js";
import { Body, BodyPiece, OutputFormat, Snippet, Template } from "./compiler-types.js";

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
    const meta = parseYaml(textContent.decoded);
    if (meta.kind === "error") {
      this.errors.push(
        ...meta.errors.map(decodedOffsetsToSourceOffsets(textContent)),
      );
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
    const schema = parseSchema(textContent.decoded);
    if (schema.kind === "error") {
      this.errors.push(
        ...schema.errors.map(decodedOffsetsToSourceOffsets(textContent)),
      );
    } else {
      this.schema = schema;
    }
  }

  private parseSnippet(snippetNode: ElementNode): void {
    // TODO
  }

  private parseBody(parentNode: ElementNode): Body | InternalErrors {
    const pieces: BodyPiece[] = [];

    const visitChildren = (elem: ElementNode): void => {
      for (const child of elem.children) {
        if (child.kind === "text") {
          pieces.push({ kind: "text", text: child });
          continue;
        }

        const tag = child.tagName.text;

        if (tag === "e") {
          const textNodes: TextNodeJoin[] = [];
          const eSnap = context.snapshot();
          for (const eChild of child.children) {
            if (eChild.kind === "text") {
              textNodes.push(eChild);
            } else {
              context.pushError(
                eChild.tagName,
                "<e> elements cannot contain child elements",
              );
            }
          }
          const joined = joinTextNodes(textNodes, child.contentSpan.start);

          if (!context.hasNewErrors(eSnap)) {
            const exResult = parseCTag(joined.decoded);
            if (exResult.kind === "error") {
              if (exResult.errors.length > 0) {
                context.pushErrors(
                  exResult.errors.map((e) => ({
                    start: textNodeDecodedOffsetToSourceOffset(joined, e.start),
                    end: textNodeDecodedOffsetToSourceOffset(joined, e.end),
                    message: e.message,
                  })),
                );
              } else {
                context.pushError(
                  child.tagName,
                  "Invalid example in <e> element",
                );
              }
            } else {
              const valErrors = validateCTag(exResult, schema);
              if (valErrors.length > 0) {
                context.pushErrors(
                  valErrors.map((e) => ({
                    start: textNodeDecodedOffsetToSourceOffset(joined, e.start),
                    end: textNodeDecodedOffsetToSourceOffset(joined, e.end),
                    message: e.message,
                  })),
                );
              }
            }
            // Always emit the text content (even on validation error).
            pieces.push({ kind: "text", text: joined });
          }
        } else if (tag === "arg") {
          if (!child.isSelfClosing) {
            context.pushError(
              child.tagName,
              "<arg> elements must be self-closing",
            );
            continue;
          }
          const argAttrs = checkXmlAttributes(child, {
            name: {
              schema: zod.string().regex(/^[a-z][A-Za-z0-9]*$/),
              expected: "a lowerCamelCase identifier",
            },
            format: {
              schema: zod.enum(["json", "toon"]).optional(),
              expected: "'json' or 'toon'",
            },
          });
          if (argAttrs.kind === "error") {
            context.pushErrors(argAttrs.errors);
            continue;
          }

          const argName = argAttrs.attributes.name.value;
          const formatAttr = argAttrs.attributes.format;
          const format: "json" | "toon" | null = formatAttr?.value ?? null;

          const declaration = argDeclarations?.find((d) => d.name === argName);
          if (argDeclarations !== null && declaration === undefined) {
            context.pushError(
              argAttrs.attributes.name,
              `Undeclared arg '${argName}'`,
            );
          } else {
            const declaredType = declaration?.typeName ?? null;
            if (format !== null && declaredType === null) {
              context.pushError(
                formatAttr!,
                "format can only be specified for an arg that has a declared type",
              );
            } else if (format === null && declaredType !== null) {
              context.pushError(
                argAttrs.attributes.name,
                `'format' attribute is required for arg '${argName}'`,
              );
            }
          }

          pieces.push({
            kind: "arg",
            name: argName,
            nameSpan: argAttrs.attributes.name,
            format,
          });
        } else if (tag === "enclosed") {
          const encAttrs = checkXmlAttributes(child, {
            tag: {
              schema: zod.string().regex(/^[A-Za-z_][\w.-]*$/),
              expected: "a valid XML tag name",
            },
          });
          if (encAttrs.kind === "error") {
            context.pushErrors(encAttrs.errors);
            continue;
          }
          const encTagName = encAttrs.attributes.tag.value;
          pieces.push({ kind: "synthetic-text", text: `<${encTagName}>` });
          visitChildren(child);
          pieces.push({ kind: "synthetic-text", text: `</${encTagName}>` });
        } else {
          context.pushError(child.tagName, `Unexpected element '<${tag}>'`);
        }
      }
    };

    visitChildren(bodyNode);
    return context.hasNewErrors(snap) ? null : pieces;
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
