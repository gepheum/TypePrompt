import { SaxesParser } from "saxes";
import { OffsetMap, OffsetMapEntry } from "./text-node-join.js";

export type XmlDocument = {
  readonly kind: "success";
  readonly content: readonly XmlNode[];
};

export type XmlParseErrors = {
  readonly kind: "error";
  readonly errors: readonly XmlParseError[];
};

export type XmlParseError = {
  readonly start: number;
  readonly end: number;
  readonly message: string;
};

export type XmlNode = TextNode | ElementNode;

export type TextNode = {
  readonly kind: "text";
  readonly sourceSpan: SourceSpan;
  /// Decoded text content (for example, "&lt;" -> "<").
  readonly decoded: string;
  /// Mapping segments from decoded offsets to source offsets.
  /// The first element is always
  //   `{ decodedOffset: 0, sourceOffset: sourceSpan.start }`
  // even if the text is empty.
  readonly offsetMap: OffsetMap;
  readonly allWhitespace: boolean;
};

export type ElementNode = {
  readonly kind: "element";
  readonly children: readonly XmlNode[];
  readonly tagName: SourceSpan;
  readonly attributes: { readonly [name: string]: Attribute };
  readonly isSelfClosing: boolean;
  /// The source offset immediately after the opening tag (or closing `/>` for
  /// self-closing elements), i.e. the position where child content begins.
  readonly contentPosition: number;
};

export type Attribute = {
  readonly name: SourceSpan;
  /// Inside the quotes, not including them.
  readonly value: SourceSpan;
  /// Decoded attribute value (for example, "&lt;" -> "<").
  readonly decodedValue: string;
};

export interface SourceSpan {
  /// Escape sequences are *not* decoded.
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/// Parses XML as a fragment and reconstructs precise source spans for nodes.
///
/// We use saxes for XML correctness and error recovery, then keep a cursor into
/// the original source to capture raw spans and decoded text metadata.
export function parseXmlDocument(
  content: string,
): XmlDocument | XmlParseErrors {
  const errors: XmlParseError[] = [];
  const rootNodes: XmlNode[] = [];
  const openElements: OpenElement[] = [];
  let cursor = 0;

  let currentOpenTag: CurrentOpenTag | undefined;
  let skipExplicitCloseScanCount = 0;

  const parser = new SaxesParser({
    fragment: true,
    position: true,
    xmlns: false,
  });

  parser.on("xmldecl", () => {
    cursor = parser.position;
  });

  parser.on("processinginstruction", () => {
    cursor = parser.position;
  });

  parser.on("comment", () => {
    cursor = scanCommentEnd(content, cursor);
  });

  parser.on("text", () => {
    const nextMarkup = content.indexOf("<", cursor);
    const end = nextMarkup === -1 ? content.length : nextMarkup;
    const decodedText = decodeXmlTextWithOffsetMap(content, cursor, end);
    appendNode({
      kind: "text",
      sourceSpan: makeSpan(content, cursor, end),
      decoded: decodedText.decoded,
      offsetMap: decodedText.offsetMap,
      allWhitespace: /^\s*$/.test(decodedText.decoded),
    });
    cursor = end;
  });

  parser.on("cdata", () => {
    const cdataStart = content.indexOf("<![CDATA[", cursor);
    const tokenStart = cdataStart === -1 ? cursor : cdataStart;
    const tokenEndMarker = content.indexOf("]]>", tokenStart);
    const tokenEnd =
      tokenEndMarker === -1 ? content.length : tokenEndMarker + 3;
    const textStart = tokenStart + "<![CDATA[".length;
    const textEnd = tokenEnd - 3;
    const decoded = content.slice(textStart, textEnd);
    appendNode({
      kind: "text",
      sourceSpan: makeSpan(content, textStart, textEnd),
      decoded,
      offsetMap: [{ decodedOffset: 0, sourceOffset: textStart }],
      allWhitespace: /^\s*$/.test(decoded),
    });
    cursor = tokenEnd;
  });

  parser.on("opentagstart", (tag) => {
    const tokenStart = content.indexOf(`<${tag.name}`, cursor);
    const nameStart = tokenStart === -1 ? cursor : tokenStart + 1;
    const nameEnd = nameStart + tag.name.length;
    currentOpenTag = {
      tokenStart: tokenStart === -1 ? cursor : tokenStart,
      tagName: makeSpan(content, nameStart, nameEnd),
      attributes: {},
      attributeCursor: nameEnd,
    };
  });

  parser.on("attribute", (attribute) => {
    if (!currentOpenTag) {
      return;
    }

    const scanned = scanAttribute(
      content,
      currentOpenTag.attributeCursor,
      attribute.name,
    );
    currentOpenTag.attributeCursor = scanned.nextCursor;
    currentOpenTag.attributes[attribute.name] = {
      name: scanned.name,
      value: scanned.value,
      decodedValue: scanned.decodedValue,
    };
    if (scanned.error) {
      errors.push(scanned.error);
    }
  });

  parser.on("opentag", (tag) => {
    if (!currentOpenTag) {
      return;
    }

    const tokenEnd = scanTagEnd(content, currentOpenTag.attributeCursor);
    openElements.push({
      node: {
        kind: "element",
        children: [],
        tagName: currentOpenTag.tagName,
        attributes: currentOpenTag.attributes,
        isSelfClosing: tag.isSelfClosing,
        contentPosition: tokenEnd,
      },
      openingTagStart: currentOpenTag.tokenStart,
      openingTagEnd: tokenEnd,
    });
    cursor = tokenEnd;

    if (tag.isSelfClosing) {
      // Wait for the matching `closetag` event to pop and append.
    }

    currentOpenTag = undefined;
  });

  parser.on("closetag", (tag) => {
    const element = openElements.pop();
    if (!element) {
      return;
    }

    // During recovery, saxes can emit an explicit `closetag` after reporting an
    // unexpected close tag. This counter prevents duplicate close-tag scans.
    if (!tag.isSelfClosing && skipExplicitCloseScanCount > 0) {
      skipExplicitCloseScanCount -= 1;
    } else if (!tag.isSelfClosing) {
      const closeTag = scanCloseTag(content, cursor);
      if (closeTag) {
        cursor = closeTag.tokenEnd;
        if (closeTag.name.text !== tag.name) {
          errors.push({
            start: closeTag.tokenStart,
            end: closeTag.tokenEnd,
            message: `Mismatched closing tag '</${closeTag.name.text}>'; expected '</${tag.name}>'`,
          });
        }
      }
    }

    appendNode(element.node);
  });

  parser.on("error", (error) => {
    const message = stripSaxesErrorPrefix(error.message);

    if (
      message === "attribute without value." ||
      message === "unquoted attribute value."
    ) {
      return;
    }

    if (
      message === "an XML declaration must be at the start of the document." &&
      content.startsWith("<?xml")
    ) {
      return;
    }

    if (message === "unexpected close tag.") {
      skipExplicitCloseScanCount += 1;
      return;
    }

    if (message.startsWith("unmatched closing tag: ")) {
      const closeTag = scanCloseTag(content, cursor);
      const rawName = message
        .slice("unmatched closing tag: ".length)
        .replace(/\.$/, "");
      errors.push({
        start: closeTag?.tokenStart ?? cursor,
        end: closeTag?.tokenEnd ?? cursor,
        message: `Unexpected closing tag '</${closeTag?.name.text ?? rawName}>'`,
      });
      return;
    }

    if (message.startsWith("unclosed tag: ")) {
      const unclosed = openElements.at(-1);
      const rawName = message.slice("unclosed tag: ".length);
      errors.push({
        start: unclosed?.openingTagStart ?? Math.max(0, parser.position - 1),
        end: unclosed?.openingTagEnd ?? parser.position,
        message: `Unclosed tag '<${unclosed?.node.tagName.text ?? rawName}>'`,
      });
      return;
    }

    errors.push({
      start: Math.max(0, parser.position - 1),
      end: parser.position,
      message,
    });
  });

  parser.write(content).close();

  if (errors.length > 0) {
    return {
      kind: "error",
      errors,
    };
  }

  return {
    kind: "success",
    content: rootNodes,
  };

  function appendNode(node: XmlNode): void {
    const parent = openElements.at(-1);
    if (parent) {
      parent.node.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }
}

interface OpenElement {
  readonly node: {
    readonly kind: "element";
    readonly children: XmlNode[];
    readonly tagName: SourceSpan;
    readonly attributes: { readonly [name: string]: Attribute };
    readonly isSelfClosing: boolean;
    readonly contentPosition: number;
  };
  readonly openingTagStart: number;
  readonly openingTagEnd: number;
}

interface CurrentOpenTag {
  readonly tokenStart: number;
  readonly tagName: SourceSpan;
  readonly attributes: Record<string, Attribute>;
  attributeCursor: number;
}

function makeSpan(content: string, start: number, end: number): SourceSpan {
  return {
    text: content.slice(start, end),
    start,
    end,
  };
}

/// Decodes XML entities in text and builds a conservative segment map from
/// decoded offsets back to source ranges.
function decodeXmlTextWithOffsetMap(
  content: string,
  sourceStart: number,
  sourceEnd: number,
): { readonly decoded: string; readonly offsetMap: OffsetMap } {
  const raw = content.slice(sourceStart, sourceEnd);
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
    const char = raw[i]!;
    if (char !== "&") {
      const chunkStart = i;
      while (i < raw.length && raw[i] !== "&") {
        i += 1;
      }
      const chunk = raw.slice(chunkStart, i);
      decodedParts.push(chunk);
      const lastEntry = offsetMap.at(-1);
      if (!lastEntry || lastEntry.decodedOffset !== decodedOffset) {
        offsetMap.push({
          decodedOffset,
          sourceOffset: sourceStart + chunkStart,
        });
      }
      decodedOffset += chunk.length;
      continue;
    }

    const semicolon = raw.indexOf(";", i + 1);
    if (semicolon === -1) {
      const chunkStart = i;
      i += 1;
      const chunk = raw.slice(chunkStart, i);
      decodedParts.push(chunk);
      offsetMap.push({
        decodedOffset,
        sourceOffset: sourceStart + chunkStart,
      });
      decodedOffset += chunk.length;
      continue;
    }

    const entityBody = raw.slice(i + 1, semicolon);
    const decodedEntity = decodeXmlEntity(entityBody);
    if (decodedEntity === undefined) {
      const chunk = raw.slice(i, semicolon + 1);
      decodedParts.push(chunk);
      offsetMap.push({
        decodedOffset,
        sourceOffset: sourceStart + i,
      });
      decodedOffset += chunk.length;
      i = semicolon + 1;
      continue;
    }

    // Known entity: two entries to capture the source length gap.
    decodedParts.push(decodedEntity);
    offsetMap.push({ decodedOffset, sourceOffset: sourceStart + i });
    decodedOffset += decodedEntity.length;
    offsetMap.push({
      decodedOffset,
      sourceOffset: sourceStart + semicolon + 1,
    });
    i = semicolon + 1;
  }

  return {
    decoded: decodedParts.join(""),
    offsetMap,
  };
}

function decodeXmlEntity(entityBody: string): string | undefined {
  switch (entityBody) {
    case "lt":
      return "<";
    case "gt":
      return ">";
    case "amp":
      return "&";
    case "quot":
      return '"';
    case "apos":
      return "'";
    default:
      break;
  }

  if (entityBody.startsWith("#x") || entityBody.startsWith("#X")) {
    const codePoint = Number.parseInt(entityBody.slice(2), 16);
    return codePointToString(codePoint);
  }

  if (entityBody.startsWith("#")) {
    const codePoint = Number.parseInt(entityBody.slice(1), 10);
    return codePointToString(codePoint);
  }

  return undefined;
}

/// Reject invalid XML code points to match XML character entity constraints.
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

function scanAttribute(
  content: string,
  cursor: number,
  attributeName: string,
): {
  readonly name: SourceSpan;
  readonly value: SourceSpan;
  readonly decodedValue: string;
  readonly nextCursor: number;
  readonly error?: XmlParseError;
} {
  const nameStart = content.indexOf(
    attributeName,
    skipWhitespace(content, cursor),
  );
  const safeNameStart =
    nameStart === -1 ? skipWhitespace(content, cursor) : nameStart;
  const nameEnd = safeNameStart + attributeName.length;
  let valueCursor = skipWhitespace(content, nameEnd);

  if (content[valueCursor] !== "=") {
    return {
      name: makeSpan(content, safeNameStart, nameEnd),
      value: makeSpan(content, valueCursor, valueCursor),
      decodedValue: "",
      nextCursor: valueCursor,
      error: {
        start: safeNameStart,
        end: valueCursor,
        message: `Attribute '${attributeName}' must have a value`,
      },
    };
  }

  valueCursor = skipWhitespace(content, valueCursor + 1);
  const quote = content[valueCursor];

  if (quote !== '"' && quote !== "'") {
    const valueEnd = scanUnquotedAttributeValueEnd(content, valueCursor);
    const value = makeSpan(content, valueCursor, valueEnd);
    return {
      name: makeSpan(content, safeNameStart, nameEnd),
      value,
      decodedValue: decodeXmlTextWithOffsetMap(content, value.start, value.end)
        .decoded,
      nextCursor: valueEnd,
      error: {
        start: safeNameStart,
        end: valueEnd,
        message: `Attribute '${attributeName}' value must be quoted`,
      },
    };
  }

  const quotedValueEnd = content.indexOf(quote, valueCursor + 1);
  const safeQuotedValueEnd =
    quotedValueEnd === -1 ? content.length : quotedValueEnd;
  const value = makeSpan(content, valueCursor + 1, safeQuotedValueEnd);
  return {
    name: makeSpan(content, safeNameStart, nameEnd),
    value,
    decodedValue: decodeXmlTextWithOffsetMap(content, value.start, value.end)
      .decoded,
    nextCursor: safeQuotedValueEnd + 1,
  };
}

function stripSaxesErrorPrefix(message: string): string {
  return message.replace(/^\d+:\d+:\s*/, "");
}

function scanCommentEnd(content: string, cursor: number): number {
  const end = content.indexOf("-->", cursor);
  return end === -1 ? content.length : end + 3;
}

function scanTagEnd(content: string, cursor: number): number {
  let quote: '"' | "'" | undefined;
  for (let i = cursor; i < content.length; i += 1) {
    const char = content[i]!;
    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") {
      return i + 1;
    }
  }
  return content.length;
}

function scanCloseTag(
  content: string,
  cursor: number,
):
  | {
      readonly tokenStart: number;
      readonly name: SourceSpan;
      readonly tokenEnd: number;
    }
  | undefined {
  const tokenStart = content.indexOf("</", cursor);
  if (tokenStart === -1) {
    return undefined;
  }

  let nameEnd = tokenStart + 2;
  while (nameEnd < content.length) {
    const char = content[nameEnd]!;
    if (char === ">" || /\s/.test(char)) {
      break;
    }
    nameEnd += 1;
  }

  const closeBracket = content.indexOf(">", nameEnd);
  return {
    tokenStart,
    name: makeSpan(content, tokenStart + 2, nameEnd),
    tokenEnd: closeBracket === -1 ? content.length : closeBracket + 1,
  };
}

function skipWhitespace(content: string, cursor: number): number {
  let i = cursor;
  while (i < content.length && /\s/.test(content[i]!)) {
    i += 1;
  }
  return i;
}

function scanUnquotedAttributeValueEnd(
  content: string,
  cursor: number,
): number {
  let i = cursor;
  while (i < content.length) {
    const char = content[i]!;
    if (/\s/.test(char) || char === ">" || char === "/") {
      break;
    }
    i += 1;
  }
  return i;
}
