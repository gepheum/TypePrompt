import { JsonValue } from "../json/json-types.js";
import { parseYaml } from "../json/yaml-parser.js";
import { parseSchema } from "../schema/schema-parser.js";
import { SchemaParseResult } from "../schema/schema-types.js";
import {
  ErrorSink,
  InternalError,
  InternalErrors,
  Span,
  TextSpan,
} from "../util/common-types.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import type { ElementNode } from "../xml/xml-types.js";
import {
  Body,
  OutputFormat,
  PromptContent,
  PromptContents,
  PromptVariant,
  Snippet,
  Template,
} from "./compiler-types.js";

import * as z from "zod";
import { parseBody } from "./body-parser.js";
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
    const contents = this.buildPromptContents({ hasVariants });

    if (this.errors.length > 0) {
      return { kind: "error", errors: this.errors };
    }

    return {
      kind: "success",
      tag: this.templateNode.tag,
      name: name.valueSpan,
      namespace: namespace?.valueSpan ?? null,
      meta: this.meta,
      schema: this.schema!,
      outputFormat: this.outputFormat,
      contents: contents!,
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
            case "system":
            case "user":
            case "examples": {
              if (args.hasVariants) {
                this.errors.push({
                  span: child.tag,
                  message: `Unexpected <${child.tag.text}> element in <template with="variants">'`,
                  hint: "Move into a <variant> element",
                });
              } else {
                this.noVariantsPrompt.parse(child, this.errors);
              }
              break;
            }
            case "variant": {
              if (args.hasVariants) {
                this.parseVariant(child);
              } else {
                this.errors.push({
                  span: child.tag,
                  message: '<template> is missing with="variants" attribute',
                });
              }
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
    const textContent = extractTextContent(metaNode);
    if (textContent.kind === "error") {
      this.errors.push(...textContent.errors);
      return;
    }
    const meta = parseYaml(textContent.text);
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
        this.outputFormat = this.parseOutputFormat(outputFormat.valueSpan);
      }
    }
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

  private parseVariant(variantNode: ElementNode): void {
    const attrs = checkXmlAttributes(variantNode, {
      name: {
        schema: z.string().regex(/^[a-z][A-Za-z0-9]*$/),
        expected: "a lowerCamelCase identifier",
      },
    });
    if (attrs.kind === "error") {
      this.errors.push(...attrs.errors);
      return;
    }
    const variant = attrs.attributes.name.valueSpan;
    const promptBuilder = new PromptBuilder();
    for (const child of variantNode.children) {
      if (child.kind === "element") {
        promptBuilder.parse(child, this.errors);
      } else if (!child.allWhitespace) {
        this.errors.push({
          span: child,
          message: "Unexpected text content in <variant>",
        });
      }
    }
    const prompt = promptBuilder.build(variantNode.tag, this.errors);
    if (prompt !== null) {
      this.promptVariants.push({
        variant: variant,
        content: prompt,
      });
    }
  }

  private buildPromptContents(args: {
    hasVariants: boolean;
  }): PromptContents | null {
    if (args.hasVariants) {
      return {
        kind: "variants",
        variants: this.promptVariants,
      };
    } else {
      const templateTag = this.templateNode.tag;
      const content = this.noVariantsPrompt.build(templateTag, this.errors);
      if (content === null) {
        return null;
      }
      return {
        kind: "no-variants",
        content: content,
      };
    }
  }

  private readonly errors: InternalError[] = [];
  private meta: JsonValue<"strict"> | null = null;
  private schema: SchemaParseResult | null = null;
  private outputFormat: OutputFormat | null = null;
  private readonly noVariantsPrompt = new PromptBuilder();
  private readonly promptVariants: PromptVariant[] = [];
  private readonly snippets: Snippet[] = [];
}

class PromptBuilder {
  system: Body | undefined;
  user: Body | undefined;
  examples: JsonValue<"strict"> | undefined;

  parse(e: ElementNode, errors: ErrorSink): void {
    const tag = e.tag.text;
    switch (tag) {
      case "system":
      case "user": {
        if (this[tag] !== undefined) {
          errors.push({
            span: e.tag,
            message: `Multiple <${tag}> elements`,
          });
        }
        this[tag] = parseBody(e, errors);
        break;
      }
      case "examples": {
        if (this.examples !== undefined) {
          errors.push({
            span: e.tag,
            message: "Multiple <examples> elements",
          });
        }
        const textContent = extractTextContent(e);
        if (textContent.kind === "error") {
          errors.push(...textContent.errors);
        } else {
          const examples = parseYaml(textContent.text);
          if (examples.kind === "error") {
            errors.push(...examples.errors);
          } else {
            this.examples = examples;
          }
        }
        break;
      }
      default: {
        errors.push({
          span: e.tag,
          message: `Unexpected element <${tag}>`,
        });
        break;
      }
    }
  }

  build(parentTag: Span, errors: ErrorSink): PromptContent | null {
    const { system, user, examples } = this;
    if (system === undefined) {
      errors.push({
        span: parentTag,
        message: "Missing <system> element",
      });
      return null;
    }
    if (user === undefined) {
      errors.push({
        span: parentTag,
        message: "Missing <user> element",
      });
      return null;
    }
    return {
      system: system,
      user: user,
      examples: examples ?? null,
    };
  }
}
