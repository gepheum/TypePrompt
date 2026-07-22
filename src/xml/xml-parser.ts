import type {
  InternalError,
  InternalErrors,
  MappedSpan,
  OffsetMapEntry,
  TextSpan,
} from "../util/common-types.js";
import type {
  Attribute,
  ElementNode,
  XmlComment,
  XmlDocument,
  XmlNode,
} from "./xml-types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseXmlDocument(
  content: string,
): XmlDocument | InternalErrors {
  return new XmlParser(content).parse();
}

// ---------------------------------------------------------------------------
// Parser class
// ---------------------------------------------------------------------------

class XmlParser {
  private cursor = 0;
  private readonly errors: InternalError[] = [];
  private readonly openElements: OpenElement[] = [];
  private readonly topLevelNodes: XmlNode[] = [];
  private readonly topLevelComments: XmlComment[] = [];

  constructor(private readonly content: string) {}

  parse(): XmlDocument | InternalErrors {
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
        span: {
          start: el.tag.start,
          end: el.tag.end,
        },
        message: `Unclosed tag '<${el.tag.text}>'`,
      });
      this.appendNode(el);
    }

    if (this.errors.length > 0) {
      return { kind: "error", errors: this.errors };
    }
    return { kind: "success", root:
      { topLevelNodes: this.topLevelNodes, topLevelComments: this.topLevelComments }
       };
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
      start: start,
      end: end,
      text: decoded.text,
      offsetMap: decoded.offsetMap,
      allWhitespace: /^\s*$/.test(decoded.text),
      xmlSlice: this.content.slice(start, end),
    });
    this.cursor = end;
  }

  private parseComment(): void {
    const tokenStart = this.cursor;
    this.cursor += 4; // skip '<!--'
    const endMarker = this.content.indexOf("-->", this.cursor);
    const tokenEnd = endMarker === -1 ? this.content.length : endMarker + 3;
    if (endMarker === -1) {
      this.errors.push({
        span: {
          start: tokenStart,
          end: tokenEnd,
        },
        message: "Unclosed XML comment",
      });
    } else {
      this.appendComment({ start: tokenStart, end: tokenEnd });
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
    RE_XML_NAME.lastIndex = nameStart;
    const tagNameMatch = RE_XML_NAME.exec(this.content);
    if (tagNameMatch === null) {
      // '<' not followed by a valid name-start char – emit as literal text.
      this.appendNode({
        ...this.decodeXmlText(tokenStart, tokenStart + 1),
        kind: "text",
        allWhitespace: false,
        xmlSlice: "<",
      });
      this.cursor = tokenStart + 1;
      return;
    }
    this.cursor = RE_XML_NAME.lastIndex;
    const nameEnd = this.cursor;
    const tagName = this.content.slice(nameStart, nameEnd);
    const tag: TextSpan = { text: tagName, start: nameStart, end: nameEnd };

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
      if (!RE_NAME_START_CHAR.test(ch)) {
        this.cursor += 1;
        continue;
      }
      const attr = this.parseAttribute();
      if (attr !== null && !(attr.name.text in attributes)) {
        attributes[attr.name.text] = attr;
      }
    }

    const openingTagEnd = this.cursor;

    const element: OpenElement = {
      kind: "element",
      tag: tag,
      start: tokenStart,
      end: openingTagEnd,
      attributes: attributes,
      children: [],
      comments: [],
      contentStart: openingTagEnd,
      isSelfClosing: isSelfClosing,
      xmlSlice: isSelfClosing
        ? this.content.slice(tokenStart, openingTagEnd)
        : "",
    };
    if (isSelfClosing) {
      this.appendNode(element);
    } else {
      this.openElements.push(element);
    }
  }

  private parseAttribute(): Attribute | null {
    const nameStart = this.cursor;
    RE_XML_NAME.lastIndex = nameStart;
    const attrNameMatch = RE_XML_NAME.exec(this.content);
    if (attrNameMatch === null) {
      return null;
    }
    this.cursor = RE_XML_NAME.lastIndex;
    const nameEnd = this.cursor;
    const name = this.content.slice(nameStart, nameEnd);
    const nameSpan = {
      text: name,
      start: nameStart,
      end: nameEnd,
    };

    this.skipWhitespace();

    if (this.content[this.cursor] !== "=") {
      this.errors.push({
        span: nameSpan,
        message: "Attribute must have a value",
      });
      const value = this.decodeXmlText(nameEnd, nameEnd);
      return {
        name: nameSpan,
        value: value,
      };
    }

    this.cursor += 1; // skip '='
    this.skipWhitespace();

    const quote = this.content[this.cursor];
    if (quote !== '"' && quote !== "'") {
      const valueStart = this.cursor;
      RE_UNQUOTED_ATTR_VALUE.lastIndex = valueStart;
      RE_UNQUOTED_ATTR_VALUE.exec(this.content);
      const valueEnd = RE_UNQUOTED_ATTR_VALUE.lastIndex;
      this.cursor = valueEnd;
      const valueSpan = this.decodeXmlText(valueStart, valueEnd);
      this.errors.push({
        span: nameSpan,
        message: "Attribute value must be quoted",
      });
      return {
        name: nameSpan,
        value: valueSpan,
      };
    }

    this.cursor += 1; // skip opening quote
    const valueStart = this.cursor;
    const attrValueRe =
      quote === '"' ? RE_DOUBLE_QUOTED_ATTR_VALUE : RE_SINGLE_QUOTED_ATTR_VALUE;
    attrValueRe.lastIndex = valueStart;
    attrValueRe.exec(this.content);
    const valueEnd = attrValueRe.lastIndex;
    this.cursor = valueEnd;
    if (this.content[this.cursor] === quote) {
      this.cursor += 1; // skip closing quote
    }
    const valueSpan = this.decodeXmlText(valueStart, valueEnd);
    return { name: nameSpan, value: valueSpan };
  }

  private parseCloseTag(): void {
    const tokenStart = this.cursor;
    this.cursor += 2; // skip '</'

    this.skipWhitespace();
    RE_XML_NAME.lastIndex = this.cursor;
    const closeNameMatch = RE_XML_NAME.exec(this.content);
    const name = closeNameMatch !== null ? closeNameMatch[0] : "";
    if (closeNameMatch !== null) {
      this.cursor = RE_XML_NAME.lastIndex;
    }

    this.skipWhitespace();
    if (this.content[this.cursor] === ">") {
      this.cursor += 1;
    }
    const tokenEnd = this.cursor;

    if (this.openElements.length <= 0) {
      this.errors.push({
        span: { start: tokenStart, end: tokenEnd },
        message: `Unexpected closing tag '</${name}>'`,
      });
      return;
    }

    const top = this.openElements.at(-1)!;

    if (top.tag.text === name) {
      this.openElements.pop();
      top.end = tokenEnd;
      top.xmlSlice = this.content.slice(top.start, tokenEnd);
      this.appendNode(top);
      return;
    }

    // Mismatch – search for a matching ancestor.
    let foundIndex = -1;
    for (let i = this.openElements.length - 2; i >= 0; i--) {
      if (this.openElements[i]!.tag.text === name) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex === -1) {
      this.errors.push({
        span: {
          start: tokenStart,
          end: tokenEnd,
        },
        message: `Unexpected closing tag '</${name}>'`,
      });
      return;
    }

    const topTag = top.tag.text;
    this.errors.push({
      span: {
        start: tokenStart,
        end: tokenEnd,
      },
      message: `Mismatched closing tag '</${name}>'; expected '</${topTag}>'`,
    });

    // Implicitly close all elements above the matched ancestor.
    while (this.openElements.length > foundIndex + 1) {
      const el = this.openElements.pop()!;
      this.appendNode(el);
    }

    // Close the matched element with the actual content span.
    const matched = this.openElements.pop()!;
    this.appendNode(matched);
  }

  // -------------------------------------------------------------------------
  // Entity decoding
  // -------------------------------------------------------------------------

  private decodeXmlText(start: number, end: number): MappedSpan {
    const raw = this.content.slice(start, end);
    if (raw.length === 0) {
      return {
        text: "",
        start: start,
        end: end,
        offsetMap: [{ textPosition: 0, sourcePosition: start }],
      };
    }

    const offsetMap: OffsetMapEntry[] = [];
    const decodedParts: string[] = [];
    let decodedOffset = 0;
    let i = 0;

    while (i < raw.length) {
      if (raw[i] !== "&") {
        RE_NON_AMP.lastIndex = i;
        RE_NON_AMP.exec(raw);
        const chunkEnd = RE_NON_AMP.lastIndex;
        const chunk = raw.slice(i, chunkEnd);
        decodedParts.push(chunk);
        // Emit a new segment only when the decoded offset differs from the
        // last entity-end marker (avoids duplicate adjacent entries).
        const last = offsetMap.at(-1);
        if (last === undefined || last.textPosition !== decodedOffset) {
          offsetMap.push({
            textPosition: decodedOffset,
            sourcePosition: start + i,
          });
        }
        decodedOffset += chunk.length;
        i = chunkEnd;
        continue;
      }

      // '&' found – look for the closing ';'.
      const semicolon = raw.indexOf(";", i + 1);
      if (semicolon === -1) {
        // No ';' – treat '&' as a literal character.
        const last = offsetMap.at(-1);
        if (last === undefined || last.textPosition !== decodedOffset) {
          offsetMap.push({
            textPosition: decodedOffset,
            sourcePosition: start + i,
          });
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
        offsetMap.push({
          textPosition: decodedOffset,
          sourcePosition: start + i,
        });
        decodedParts.push(result.value);
        decodedOffset += result.value.length;
        offsetMap.push({
          textPosition: decodedOffset,
          sourcePosition: start + semicolon + 1,
        });
        i = semicolon + 1;
      } else {
        // Unknown or malformed entity – record an error and keep the raw text.
        this.errors.push({
          span: {
            start: start + i,
            end: start + semicolon + 1,
          },
          message:
            result.kind === "malformed"
              ? "malformed character entity."
              : "undefined entity.",
        });
        const rawEntity = raw.slice(i, semicolon + 1);
        const last = offsetMap.at(-1);
        if (last === undefined || last.textPosition !== decodedOffset) {
          offsetMap.push({
            textPosition: decodedOffset,
            sourcePosition: start + i,
          });
        }
        decodedParts.push(rawEntity);
        decodedOffset += rawEntity.length;
        i = semicolon + 1;
      }
    }

    return {
      text: decodedParts.join(""),
      start: start,
      end: end,
      offsetMap,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private appendNode(node: XmlNode): void {
    const parent = this.openElements.at(-1);
    if (parent !== undefined) {
      parent.children.push(node);
    } else {
      this.topLevelNodes.push(node);
    }
  }

  private appendComment(comment: XmlComment): void {
    const parent = this.openElements.at(-1);
    if (parent !== undefined) {
      parent.comments.push(comment);
    } else {
      this.topLevelComments.push(comment);
    }
  }

  private skipWhitespace(): void {
    RE_OPT_WHITESPACE.lastIndex = this.cursor;
    RE_OPT_WHITESPACE.exec(this.content);
    this.cursor = RE_OPT_WHITESPACE.lastIndex;
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

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type OpenElement = ElementNode & {
  end: number;
  readonly children: XmlNode[];
  readonly comments: XmlComment[];
  xmlSlice: string;
};

type EntityDecodeResult =
  | { readonly kind: "ok"; readonly value: string }
  | { readonly kind: "undefined" }
  | { readonly kind: "malformed" };

// ---------------------------------------------------------------------------
// Sticky regex constants (lastIndex must be set before each use)
// ---------------------------------------------------------------------------

/** Skips zero or more whitespace characters. Always matches. */
const RE_OPT_WHITESPACE = /\s*/y;
/** Matches a complete XML Name token. */
const RE_XML_NAME = /[A-Za-z_:\u0080-\uFFFF][A-Za-z0-9_:\-.\u0080-\uFFFF]*/y;
/** Matches a run of non-'&' characters (used inside entity-decode loop). */
const RE_NON_AMP = /[^&]*/y;
/** Matches an unquoted attribute value (stops at whitespace, >, /, <). */
const RE_UNQUOTED_ATTR_VALUE = /[^\s>/<]*/y;
/** Matches the body of a double-quoted attribute value. */
const RE_DOUBLE_QUOTED_ATTR_VALUE = /[^"<]*/y;
/** Matches the body of a single-quoted attribute value. */
const RE_SINGLE_QUOTED_ATTR_VALUE = /[^'<]*/y;
/** Non-sticky test for XML name-start characters. */
const RE_NAME_START_CHAR = /[A-Za-z_:\u0080-\uFFFF]/;
