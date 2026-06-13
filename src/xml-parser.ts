import { SaxesParser } from "saxes";

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

export type XmlNode =
  | TextNode
  | ElementNode;

export type TextNode = {
  readonly kind: "text";
  readonly text: SourceSpan;
};

export type ElementNode = {
  readonly kind: "element";
  readonly children: readonly XmlNode[];
  readonly tagName: SourceSpan;
  readonly attributes: { readonly [name: string]: Attribute };
};

export type Attribute = {
  readonly name: SourceSpan;
  /// Inside the quotes, not including them.
  readonly value?: SourceSpan;
};

export interface SourceSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export function parseXmlDocument(content: string): XmlDocument | XmlParseErrors {
  const errors: XmlParseError[] = [];
  const rootNodes: XmlNode[] = [];
  const openElements: OpenElement[] = [];
  let cursor = 0;

  let currentOpenTag: CurrentOpenTag | undefined;
  let lastStructuralErrorTokenStart: number | undefined;
  let skipExplicitCloseScanCount = 0;

  const parser = new SaxesParser({
    fragment: true,
    position: true,
    xmlns: false,
  });

  parser.on("xmldecl", () => {
    cursor = scanProcessingInstructionEnd(content, cursor);
  });

  parser.on("processinginstruction", () => {
    cursor = scanProcessingInstructionEnd(content, cursor);
  });

  parser.on("comment", () => {
    cursor = scanCommentEnd(content, cursor);
  });

  parser.on("text", () => {
    const nextMarkup = content.indexOf("<", cursor);
    const end = nextMarkup === -1 ? content.length : nextMarkup;
    appendNode({
      kind: "text",
      text: makeSpan(content, cursor, end),
    });
    cursor = end;
  });

  parser.on("cdata", () => {
    const cdataStart = content.indexOf("<![CDATA[", cursor);
    const tokenStart = cdataStart === -1 ? cursor : cdataStart;
    const tokenEndMarker = content.indexOf("]]>", tokenStart);
    const tokenEnd = tokenEndMarker === -1 ? content.length : tokenEndMarker + 3;
    appendNode({
      kind: "text",
      text: makeSpan(content, tokenStart + "<![CDATA[".length, tokenEnd - 3),
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

    const scanned = scanAttribute(content, currentOpenTag.attributeCursor, attribute.name);
    currentOpenTag.attributeCursor = scanned.nextCursor;
    currentOpenTag.attributes[attribute.name] = {
      name: scanned.name,
      value: scanned.value,
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

    if (!tag.isSelfClosing && skipExplicitCloseScanCount > 0) {
      skipExplicitCloseScanCount -= 1;
    } else if (!tag.isSelfClosing) {
      const closeTag = scanCloseTag(content, cursor);
      if (closeTag) {
        cursor = closeTag.tokenEnd;
        if (closeTag.name.text !== tag.name) {
          lastStructuralErrorTokenStart = closeTag.tokenStart;
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

function scanAttribute(
  content: string,
  cursor: number,
  attributeName: string,
): {
  readonly name: SourceSpan;
  readonly value?: SourceSpan;
  readonly nextCursor: number;
  readonly error?: XmlParseError;
} {
  const nameStart = content.indexOf(attributeName, skipWhitespace(content, cursor));
  const safeNameStart = nameStart === -1 ? skipWhitespace(content, cursor) : nameStart;
  const nameEnd = safeNameStart + attributeName.length;
  let valueCursor = skipWhitespace(content, nameEnd);

  if (content[valueCursor] !== "=") {
    return {
      name: makeSpan(content, safeNameStart, nameEnd),
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
    return {
      name: makeSpan(content, safeNameStart, nameEnd),
      value: makeSpan(content, valueCursor, valueEnd),
      nextCursor: valueEnd,
      error: {
        start: safeNameStart,
        end: valueEnd,
        message: `Attribute '${attributeName}' value must be quoted`,
      },
    };
  }

  const quotedValueEnd = content.indexOf(quote, valueCursor + 1);
  const safeQuotedValueEnd = quotedValueEnd === -1 ? content.length : quotedValueEnd;
  return {
    name: makeSpan(content, safeNameStart, nameEnd),
    value: makeSpan(content, valueCursor + 1, safeQuotedValueEnd),
    nextCursor: safeQuotedValueEnd + 1,
  };
}

function findOpenElementIndex(
  openElements: readonly OpenElement[],
  tagName: string,
): number {
  for (let i = openElements.length - 1; i >= 0; i -= 1) {
    if (openElements[i]!.node.tagName.text === tagName) {
      return i;
    }
  }
  return -1;
}

function findMostRecentOpenTagName(
  openElements: readonly OpenElement[],
): string | undefined {
  return openElements.at(-1)?.node.tagName.text;
}

function stripSaxesErrorPrefix(message: string): string {
  return message.replace(/^\d+:\d+:\s*/, "");
}

function scanProcessingInstructionEnd(content: string, cursor: number): number {
  const end = content.indexOf("?>", cursor);
  return end === -1 ? content.length : end + 2;
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
): { readonly tokenStart: number; readonly name: SourceSpan; readonly tokenEnd: number } | undefined {
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

function scanUnquotedAttributeValueEnd(content: string, cursor: number): number {
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
