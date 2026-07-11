import type {
  InternalError,
  InternalErrors,
  SourceSpan,
} from "../util/error-types.js";
import type { OffsetMapEntry } from "./text-node-join.js";
import type {
  Attribute,
  CommentsPolicy,
  TextNode,
  XmlComment,
  XmlDocument,
  XmlNode,
} from "./xml-types.js";

export type {
  Attribute,
  XmlComment as CommentNode,
  CommentsPolicy,
  ElementNode,
  TextNode,
  XmlDocument,
  XmlNode,
} from "./xml-types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseXmlDocument(
  content: string,
): XmlDocument<"drop-comments"> | InternalErrors;
export function parseXmlDocument<C extends CommentsPolicy>(
  content: string,
  commentsPolicy: C,
): XmlDocument<C> | InternalErrors;
export function parseXmlDocument<C extends CommentsPolicy>(
  content: string,
  commentsPolicy?: C,
): XmlDocument<CommentsPolicy> | InternalErrors {
  return new XmlParser(
    content,
    (commentsPolicy ?? "drop-comments") as CommentsPolicy,
  ).parse();
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface OpenElement {
  readonly node: {
    readonly kind: "element";
    readonly children: XmlNode<CommentsPolicy>[];
    readonly tagName: SourceSpan;
    readonly attributes: Record<string, Attribute>;
    readonly isSelfClosing: boolean;
  };
  readonly openingTagStart: number;
  readonly openingTagEnd: number;
}

type EntityDecodeResult =
  | { readonly kind: "ok"; readonly value: string }
  | { readonly kind: "undefined" }
  | { readonly kind: "malformed" };

// ---------------------------------------------------------------------------
// Parser class
// ---------------------------------------------------------------------------

class XmlParser {
  private cursor = 0;
  private readonly errors: InternalError[] = [];
  private readonly openElements: OpenElement[] = [];
  private readonly rootNodes: XmlNode<CommentsPolicy>[] = [];

  constructor(
    private readonly content: string,
    private readonly commentsPolicy: CommentsPolicy,
  ) {}

  parse(): XmlDocument<CommentsPolicy> | InternalErrors {
    while (this.cursor < this.content.length) {
      if (this.content[this.cursor] !== "<") {
        this.parseText();
      } else if (this.content.startsWith("<!--", this.cursor)) {
        this.parseComment();
      } else if (this.content.startsWith("<![CDATA[", this.cursor)) {
        this.parseCDATA();
      } else if (this.content.startsWith("<?", this.cursor)) {
        this.parseProcessingInstruction();
      } else if (this.content.startsWith("</", this.cursor)) {
        this.parseCloseTag();
      } else {
        this.parseOpenTag();
      }
    }

    // Report unclosed tags innermost-first, closing them into their parents.
    while (this.openElements.length > 0) {
      const el = this.openElements.pop()!;
      this.errors.push({
        start: el.openingTagStart,
        end: el.openingTagEnd,
        message: `Unclosed tag '<${el.node.tagName.text}>'`,
      });
      this.appendNode(
        this.completeElement(el, el.openingTagEnd, el.openingTagEnd),
      );
    }

    if (this.errors.length > 0) {
      return { kind: "error", errors: this.errors };
    }
    return { kind: "success", root: { children: this.rootNodes } };
  }

  // -------------------------------------------------------------------------
  // Token parsers
  // -------------------------------------------------------------------------

  private parseText(): void {
    const start = this.cursor;
    let end = this.content.indexOf("<", start);
    if (end === -1) {
      end = this.content.length;
    }
    const decoded = this.decodeXmlText(start, end);
    this.appendNode({
      kind: "text",
      sourceSpan: this.makeSpan(start, end),
      decoded: decoded.decoded,
      offsetMap: decoded.offsetMap,
      allWhitespace: /^\s*$/.test(decoded.decoded),
    } satisfies TextNode);
    this.cursor = end;
  }

  private parseComment(): void {
    const tokenStart = this.cursor;
    this.cursor += 4; // skip '<!--'
    const endMarker = this.content.indexOf("-->", this.cursor);
    const tokenEnd = endMarker === -1 ? this.content.length : endMarker + 3;
    if (endMarker === -1) {
      this.errors.push({
        start: tokenStart,
        end: tokenEnd,
        message: "Unclosed XML comment",
      });
    } else if (this.commentsPolicy === "keep-comments") {
      this.appendNode({
        kind: "comment",
        sourceSpan: this.makeSpan(tokenStart, tokenEnd),
      } satisfies XmlComment as XmlNode<CommentsPolicy>);
    }
    this.cursor = tokenEnd;
  }

  private parseCDATA(): void {
    this.cursor += 9; // skip '<![CDATA['
    const endMarker = this.content.indexOf("]]>", this.cursor);
    this.cursor = endMarker === -1 ? this.content.length : endMarker + 3;
  }

  private parseProcessingInstruction(): void {
    this.cursor += 2; // skip '<?'
    const endMarker = this.content.indexOf("?>", this.cursor);
    this.cursor = endMarker === -1 ? this.content.length : endMarker + 2;
  }

  private parseOpenTag(): void {
    const tokenStart = this.cursor;
    this.cursor += 1; // skip '<'

    const nameStart = this.cursor;
    if (!this.isNameStartChar(this.content[this.cursor] ?? "")) {
      // '<' not followed by a valid name-start char – emit as literal text.
      this.appendNode({
        kind: "text",
        sourceSpan: this.makeSpan(tokenStart, tokenStart + 1),
        decoded: "<",
        offsetMap: [{ decodedOffset: 0, sourceOffset: tokenStart }],
        allWhitespace: false,
      } satisfies TextNode);
      this.cursor = tokenStart + 1;
      return;
    }
    while (
      this.cursor < this.content.length &&
      this.isNameChar(this.content[this.cursor]!)
    ) {
      this.cursor += 1;
    }
    const nameEnd = this.cursor;
    const tagNameSpan = this.makeSpan(nameStart, nameEnd);

    const attributes: Record<string, Attribute> = {};
    let isSelfClosing = false;

    while (this.cursor < this.content.length) {
      this.skipWhitespace();
      const ch = this.content[this.cursor];
      if (ch === undefined) {
        break;
      }
      if (ch === ">") {
        this.cursor += 1;
        break;
      }
      if (ch === "/") {
        if (this.content[this.cursor + 1] === ">") {
          isSelfClosing = true;
          this.cursor += 2;
          break;
        }
        this.cursor += 1;
        continue;
      }
      if (!this.isNameStartChar(ch)) {
        this.cursor += 1;
        continue;
      }
      const attr = this.parseAttribute();
      if (attr !== null && !(attr.name.text in attributes)) {
        attributes[attr.name.text] = attr;
      }
    }

    const openingTagEnd = this.cursor;

    if (isSelfClosing) {
      this.appendNode({
        kind: "element",
        children: [],
        tagName: tagNameSpan,
        attributes,
        isSelfClosing: true,
        contentSpan: this.makeSpan(openingTagEnd, openingTagEnd),
      } as XmlNode<CommentsPolicy>);
    } else {
      this.openElements.push({
        node: {
          kind: "element",
          children: [],
          tagName: tagNameSpan,
          attributes,
          isSelfClosing: false,
        },
        openingTagStart: tokenStart,
        openingTagEnd,
      });
    }
  }

  private parseAttribute(): Attribute | null {
    const nameStart = this.cursor;
    while (
      this.cursor < this.content.length &&
      this.isNameChar(this.content[this.cursor]!)
    ) {
      this.cursor += 1;
    }
    const nameEnd = this.cursor;
    if (nameEnd === nameStart) {
      return null;
    }
    const nameSpan = this.makeSpan(nameStart, nameEnd);

    this.skipWhitespace();

    if (this.content[this.cursor] !== "=") {
      this.errors.push({
        start: nameStart,
        end: nameEnd,
        message: `Attribute '${nameSpan.text}' must have a value`,
      });
      return {
        name: nameSpan,
        value: this.makeSpan(nameEnd, nameEnd),
        decodedValue: "",
      };
    }

    this.cursor += 1; // skip '='
    this.skipWhitespace();

    const quote = this.content[this.cursor];
    if (quote !== '"' && quote !== "'") {
      const valueStart = this.cursor;
      while (this.cursor < this.content.length) {
        const c = this.content[this.cursor]!;
        if (/\s/.test(c) || c === ">" || c === "/" || c === "<") {
          break;
        }
        this.cursor += 1;
      }
      const valueEnd = this.cursor;
      const valueSpan = this.makeSpan(valueStart, valueEnd);
      this.errors.push({
        start: nameStart,
        end: valueEnd,
        message: `Attribute '${nameSpan.text}' value must be quoted`,
      });
      const decoded = this.decodeXmlText(valueStart, valueEnd);
      return {
        name: nameSpan,
        value: valueSpan,
        decodedValue: decoded.decoded,
      };
    }

    this.cursor += 1; // skip opening quote
    const valueStart = this.cursor;
    while (this.cursor < this.content.length) {
      const c = this.content[this.cursor]!;
      if (c === quote || c === "<") {
        break;
      }
      this.cursor += 1;
    }
    const valueEnd = this.cursor;
    if (this.content[this.cursor] === quote) {
      this.cursor += 1; // skip closing quote
    }
    const valueSpan = this.makeSpan(valueStart, valueEnd);
    const decoded = this.decodeXmlText(valueStart, valueEnd);
    return { name: nameSpan, value: valueSpan, decodedValue: decoded.decoded };
  }

  private parseCloseTag(): void {
    const tokenStart = this.cursor;
    this.cursor += 2; // skip '</'

    this.skipWhitespace();
    const nameStart = this.cursor;
    while (
      this.cursor < this.content.length &&
      this.isNameChar(this.content[this.cursor]!)
    ) {
      this.cursor += 1;
    }
    const name = this.content.slice(nameStart, this.cursor);

    this.skipWhitespace();
    if (this.content[this.cursor] === ">") {
      this.cursor += 1;
    }
    const tokenEnd = this.cursor;

    if (this.openElements.length === 0) {
      this.errors.push({
        start: tokenStart,
        end: tokenEnd,
        message: `Unexpected closing tag '</${name}>'`,
      });
      return;
    }

    const top = this.openElements[this.openElements.length - 1]!;

    if (top.node.tagName.text === name) {
      this.openElements.pop();
      this.appendNode(this.completeElement(top, top.openingTagEnd, tokenStart));
      return;
    }

    // Mismatch – search for a matching ancestor.
    let foundIndex = -1;
    for (let i = this.openElements.length - 2; i >= 0; i--) {
      if (this.openElements[i]!.node.tagName.text === name) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex === -1) {
      this.errors.push({
        start: tokenStart,
        end: tokenEnd,
        message: `Unexpected closing tag '</${name}>'`,
      });
      return;
    }

    this.errors.push({
      start: tokenStart,
      end: tokenEnd,
      message: `Mismatched closing tag '</${name}>'; expected '</${top.node.tagName.text}>'`,
    });

    // Implicitly close all elements above the matched ancestor.
    while (this.openElements.length > foundIndex + 1) {
      const el = this.openElements.pop()!;
      this.appendNode(
        this.completeElement(el, el.openingTagEnd, el.openingTagEnd),
      );
    }

    // Close the matched element with the actual content span.
    const matched = this.openElements.pop()!;
    this.appendNode(
      this.completeElement(matched, matched.openingTagEnd, tokenStart),
    );
  }

  // -------------------------------------------------------------------------
  // Entity decoding
  // -------------------------------------------------------------------------

  private decodeXmlText(
    sourceStart: number,
    sourceEnd: number,
  ): {
    readonly decoded: string;
    readonly offsetMap: readonly OffsetMapEntry[];
  } {
    const raw = this.content.slice(sourceStart, sourceEnd);
    if (raw.length === 0) {
      return {
        decoded: "",
        offsetMap: [{ decodedOffset: 0, sourceOffset: sourceStart }],
      };
    }

    const offsetMap: OffsetMapEntry[] = [];
    const decodedParts: string[] = [];
    let decodedOffset = 0;
    let i = 0;

    while (i < raw.length) {
      if (raw[i] !== "&") {
        const chunkStart = i;
        while (i < raw.length && raw[i] !== "&") {
          i += 1;
        }
        const chunk = raw.slice(chunkStart, i);
        decodedParts.push(chunk);
        // Emit a new segment only when the decoded offset differs from the
        // last entity-end marker (avoids duplicate adjacent entries).
        const last = offsetMap.at(-1);
        if (last === undefined || last.decodedOffset !== decodedOffset) {
          offsetMap.push({
            decodedOffset,
            sourceOffset: sourceStart + chunkStart,
          });
        }
        decodedOffset += chunk.length;
        continue;
      }

      // '&' found – look for the closing ';'.
      const semicolon = raw.indexOf(";", i + 1);
      if (semicolon === -1) {
        // No ';' – treat '&' as a literal character.
        const last = offsetMap.at(-1);
        if (last === undefined || last.decodedOffset !== decodedOffset) {
          offsetMap.push({ decodedOffset, sourceOffset: sourceStart + i });
        }
        decodedParts.push("&");
        decodedOffset += 1;
        i += 1;
        continue;
      }

      const entityBody = raw.slice(i + 1, semicolon);
      const result = decodeXmlEntityResult(entityBody);

      if (result.kind === "ok") {
        // Valid entity: bracket it with two offset map entries.
        offsetMap.push({ decodedOffset, sourceOffset: sourceStart + i });
        decodedParts.push(result.value);
        decodedOffset += result.value.length;
        offsetMap.push({
          decodedOffset,
          sourceOffset: sourceStart + semicolon + 1,
        });
        i = semicolon + 1;
      } else {
        // Unknown or malformed entity – record an error and keep the raw text.
        this.errors.push({
          start: sourceStart + i,
          end: sourceStart + semicolon + 1,
          message:
            result.kind === "malformed"
              ? "malformed character entity."
              : "undefined entity.",
        });
        const rawEntity = raw.slice(i, semicolon + 1);
        const last = offsetMap.at(-1);
        if (last === undefined || last.decodedOffset !== decodedOffset) {
          offsetMap.push({ decodedOffset, sourceOffset: sourceStart + i });
        }
        decodedParts.push(rawEntity);
        decodedOffset += rawEntity.length;
        i = semicolon + 1;
      }
    }

    return { decoded: decodedParts.join(""), offsetMap };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private completeElement(
    el: OpenElement,
    contentStart: number,
    contentEnd: number,
  ): XmlNode<CommentsPolicy> {
    return {
      ...el.node,
      contentSpan: this.makeSpan(contentStart, contentEnd),
    } as XmlNode<CommentsPolicy>;
  }

  private appendNode(node: XmlNode<CommentsPolicy>): void {
    const parent = this.openElements.at(-1);
    if (parent !== undefined) {
      parent.node.children.push(node);
    } else {
      this.rootNodes.push(node);
    }
  }

  private makeSpan(start: number, end: number): SourceSpan {
    return { text: this.content.slice(start, end), start, end };
  }

  private skipWhitespace(): void {
    while (
      this.cursor < this.content.length &&
      /\s/.test(this.content[this.cursor]!)
    ) {
      this.cursor += 1;
    }
  }

  /** True for characters that may begin an XML name. */
  private isNameStartChar(ch: string): boolean {
    return /[A-Za-z_:]/.test(ch) || ch.charCodeAt(0) > 0x7f;
  }

  /** True for characters that may continue an XML name. */
  private isNameChar(ch: string): boolean {
    return /[A-Za-z0-9_:\-.·]/.test(ch) || ch.charCodeAt(0) > 0x7f;
  }
}

// ---------------------------------------------------------------------------
// Entity decoding helpers (module-level, pure)
// ---------------------------------------------------------------------------

function decodeXmlEntityResult(entityBody: string): EntityDecodeResult {
  switch (entityBody) {
    case "lt":
      return { kind: "ok", value: "<" };
    case "gt":
      return { kind: "ok", value: ">" };
    case "amp":
      return { kind: "ok", value: "&" };
    case "quot":
      return { kind: "ok", value: '"' };
    case "apos":
      return { kind: "ok", value: "'" };
    default:
      break;
  }

  if (entityBody.startsWith("#x") || entityBody.startsWith("#X")) {
    const hex = entityBody.slice(2);
    if (hex.length === 0 || !/^[0-9A-Fa-f]+$/.test(hex)) {
      return { kind: "malformed" };
    }
    const codePoint = Number.parseInt(hex, 16);
    const str = codePointToString(codePoint);
    return str === undefined
      ? { kind: "malformed" }
      : { kind: "ok", value: str };
  }

  if (entityBody.startsWith("#")) {
    const dec = entityBody.slice(1);
    if (dec.length === 0 || !/^[0-9]+$/.test(dec)) {
      return { kind: "malformed" };
    }
    const codePoint = Number.parseInt(dec, 10);
    const str = codePointToString(codePoint);
    return str === undefined
      ? { kind: "malformed" }
      : { kind: "ok", value: str };
  }

  return { kind: "undefined" };
}

/** Reject code points forbidden by the XML character entity rules. */
function codePointToString(codePoint: number): string | undefined {
  if (!Number.isInteger(codePoint)) {
    return undefined;
  }
  if (codePoint < 0 || codePoint > 0x10ffff) {
    return undefined;
  }
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    return undefined;
  }
  return String.fromCodePoint(codePoint);
}
