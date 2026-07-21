import { parseCTag } from "../ctag/ctag-parser.js";
import { JsonValue } from "../json/json-types.js";
import { parseYaml } from "../json/yaml-parser.js";
import { parseSchema } from "../schema/schema-parser.js";
import { SchemaParseResult } from "../schema/schema-types.js";
import {
  InternalError,
  InternalErrors,
  MappedText,
  TextSpan,
} from "../util/common-types.js";
import { textToSourcePosition } from "../util/position-mapper.js";
import { joinTextNodes } from "../util/text-node-joiner.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import type { ElementNode, XmlNode } from "../xml/xml-types.js";
import {
  Body,
  BodyPiece,
  Expression,
  InsertFormat,
  OutputFormat,
  Snippet,
  Template,
} from "./compiler-types.js";

import * as z from "zod";
import { parseExpression } from "./expression-parser.js";

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

    const visitInsertSnippet = (insertNode: ElementNode): void => {
      const attrs = checkXmlAttributes(insertNode, {
        snippet: {
          schema: z.string().regex(/^[A-Z][A-Za-z0-9]*$/),
          expected: "an UpperCamelCase identifier",
        },
      });
      if (attrs.kind === "error") {
        this.errors.push(...attrs.errors);
        return;
      }
      pieces.push({
        kind: "insert-snippet",
        snippet: attrs.attributes.snippet.span,
      });
    };

    const visitInsertValue = (insertNode: ElementNode): void => {
      // Insert a formatted value.
      const attrs = checkXmlAttributes(insertNode, {
        val: {
          schema: z.string(),
          expected: "a valid expression",
        },
        format: {
          schema: z.string().regex(/^[a-z][A-Za-z0-9]*$/),
          expected: "a lowerCamelCase identifier",
        },
      });
      if (attrs.kind === "error") {
        this.errors.push(...attrs.errors);
        return;
      }
      const val = parseExpression(attrs.attributes.val.span, {
        acceptIt: true,
      });
      if (val.kind === "error") {
        this.errors.push(...val.errors);
        return;
      }
      const format = attrs.attributes.format
        ? this.parseInsertFormat(attrs.attributes.format.span)
        : null;
      pieces.push({
        kind: "insert-val",
        val: val.expression,
        format: format,
      });
    };

    const visit = (child: XmlNode): void => {
      if (child.kind === "text") {
        pieces.push({ kind: "text", text: child });
        return;
      }
      const tag = child.tag.text;
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
        if (child.attributes["snippet"]) {
          visitInsertSnippet(child);
        } else {
          visitInsertValue(child);
        }
      } else {
        this.errors.push({
          span: child.tag,
          message: `Unexpected element '<${tag}>'`,
        });
      }
    };

    const visitChildren = (elem: ElementNode): void => {
      for (const child of elem.children) {
        visit(child);
      }
    };

    visitChildren(parentNode);

    return processBodyPieces(pieces, this.errors);
  }

  private extractTextContent(node: ElementNode): MappedText {
    const textNodes: MappedText[] = [];
    for (const child of node.children) {
      if (child.kind === "text") {
        textNodes.push(child);
      } else {
        this.errors.push({
          span: child.tag,
          message: `Unexpected element '<${child.tag.text}>'`,
        });
      }
    }
    return joinTextNodes(textNodes, node.contentStart);
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

  private parseInsertFormat(format: TextSpan): InsertFormat | null {
    const { text } = format;
    const kind =
      text === "text" ||
      text === "json" ||
      text === "toon" ||
      text === "csv" ||
      text === "tsv"
        ? text
        : "custom";
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

/** A piece collected from a raw XML body walk, before trim/dedent. */
type RawBodyPiece<Text = MappedText> =
  | { readonly kind: "text"; readonly text: Text }
  | { readonly kind: "c-tag"; readonly text: Text }
  | { readonly kind: "synthetic-text"; readonly text: string }
  | {
      readonly kind: "insert-val";
      readonly val: Expression;
      readonly format: InsertFormat | null;
    }
  | {
      readonly kind: "insert-snippet";
      readonly snippet: TextSpan;
    };

/** A piece collected from a raw XML body walk, before trim/dedent. */
type DedentedBodyPiece = RawBodyPiece<string>;

// ---------------------------------------------------------------------------
// Private – body trim/dedent pipeline
// ---------------------------------------------------------------------------

function processBodyPieces(
  rawPieces: readonly RawBodyPiece[],
  errorSink: InternalError[],
): BodyPiece[] {
  const firstRaw = rawPieces[0];
  const baseIndent =
    firstRaw?.kind === "text" ? computeBaseIndent(firstRaw.text) : "";

  const dedented: DedentedBodyPiece[] = [];
  for (const p of rawPieces) {
    if (p.kind === "text" || p.kind === "c-tag") {
      dedented.push({
        ...p,
        text: removeIndentAfterEol(p.text, baseIndent, errorSink),
      });
    } else if (p.kind === "synthetic-text") {
      dedented.push({ kind: "text", text: p.text });
    } else {
      dedented.push(p);
    }
  }

  trimLeadingEmptyLines(dedented);
  trimTrailingEmptyLines(dedented);

  const coalesced = coalesceText(dedented);
  return buildFinalPieces(coalesced);
}

function computeBaseIndent(firstTextNode: MappedText): string {
  const { text } = firstTextNode;
  const firstNl = text.indexOf("\n");
  if (firstNl === -1) return "";
  const firstLine = text.slice(0, firstNl);
  if (/[^ \t]/.test(firstLine)) return "";
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/[^ \t]/.test(line)) {
      const m = line.match(/^[ \t]*/);
      return m ? m[0] : "";
    }
  }
  const last = lines.at(-1) ?? "";
  const m = last.match(/^[ \t]*/);
  return m ? m[0] : "";
}

function removeIndentAfterEol(
  textNode: MappedText,
  baseIndent: string,
  errorSink: InternalError[],
): string {
  const { text } = textNode;
  if (text.length === 0 || baseIndent.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "\n") continue;
    out += text.slice(cursor, i + 1);
    const next = i + 1;
    if (next >= text.length) {
      cursor = next;
      continue;
    }
    if (text[next] === "\n") {
      cursor = next;
      continue;
    }
    // If the rest of the string is only whitespace (e.g. indentation before a
    // child element tag), strip the base indent from it but do not error.
    if (/^[ \t]*$/.test(text.slice(next))) {
      if (text.startsWith(baseIndent, next)) {
        cursor = next + baseIndent.length;
      } else {
        // Less indent than base — but it's trailing whitespace, just pass through.
        cursor = next;
      }
      continue;
    }
    if (text.startsWith(baseIndent, next)) {
      cursor = next + baseIndent.length;
    } else {
      const pos = textToSourcePosition(textNode, next);
      const formattedIndent = baseIndent.replace(/\t/g, "\\t");
      errorSink.push({
        span: { start: pos, end: pos },
        message: `Expected indentation '${formattedIndent}' after end-of-line`,
      });
      cursor = next;
    }
  }
  out += text.slice(cursor);
  return out;
}

function trimLeadingEmptyLines(pieces: DedentedBodyPiece[]): void {
  while (pieces.length > 0 && pieces[0]!.kind === "text") {
    const trimmed = trimLeadingEmpty(pieces[0]!.text);
    if (trimmed === pieces[0]!.text) return;
    if (trimmed.length === 0) {
      pieces.shift();
      continue;
    }
    pieces[0] = { kind: "text", text: trimmed };
    return;
  }
}

function trimTrailingEmptyLines(pieces: DedentedBodyPiece[]): void {
  while (pieces.length > 0) {
    const idx = pieces.length - 1;
    const p = pieces[idx]!;
    if (p.kind !== "text") return;
    const trimmed = trimTrailingEmpty(p.text);
    if (trimmed === p.text) return;
    if (trimmed.length === 0) {
      pieces.pop();
      continue;
    }
    pieces[idx] = { kind: "text", text: trimmed };
    return;
  }
}

function trimLeadingEmpty(text: string): string {
  let cur = text;
  while (true) {
    const nl = cur.indexOf("\n");
    if (nl === -1) return /^[ \t]*$/.test(cur) ? "" : cur;
    if (/[^ \t]/.test(cur.slice(0, nl))) return cur;
    cur = cur.slice(nl + 1);
  }
}

function trimTrailingEmpty(text: string): string {
  let cur = text;
  while (true) {
    const nl = cur.lastIndexOf("\n");
    if (nl === -1) return /^[ \t]*$/.test(cur) ? "" : cur;
    if (/[^ \t]/.test(cur.slice(nl + 1))) return cur;
    cur = cur.slice(0, nl);
  }
}

function coalesceText(
  pieces: readonly DedentedBodyPiece[],
): DedentedBodyPiece[] {
  const result: DedentedBodyPiece[] = [];
  for (const p of pieces) {
    if (p.kind === "text") {
      const prev = result.at(-1);
      if (prev?.kind === "text") {
        result[result.length - 1] = { kind: "text", text: prev.text + p.text };
        continue;
      }
    }
    result.push(p);
  }
  return result;
}

function buildFinalPieces(pieces: readonly DedentedBodyPiece[]): BodyPiece[] {
  return pieces.map((p, i) => {
    switch (p.kind) {
      case "text": {
        return p;
      }
      case "synthetic-text":
      case "c-tag": {
        return {
          kind: "text",
          text: p.text,
        };
      }
      case "insert-val":
      case "insert-snippet": {
        const indent = computeArgIndent(pieces.slice(0, i));
        return {
          ...p,
          indent: indent,
        };
      }
    }
  });
}

function computeArgIndent(preceding: readonly DedentedBodyPiece[]): string {
  for (let i = preceding.length - 1; i >= 0; i--) {
    const p = preceding[i]!;
    if (p.kind !== "text") continue;
    const nl = p.text.lastIndexOf("\n");
    if (nl !== -1) {
      const m = p.text.slice(nl + 1).match(/^([ \t]*)/);
      return m ? m[1]! : "";
    }
  }
  return "";
}
