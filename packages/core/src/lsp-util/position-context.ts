import { tokenizeSchema } from "../schema/schema-parser.js";
import { createLineFinder, findLine } from "../util/line-finder.js";
import type { Span } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode, XmlComment } from "../xml/xml-types.js";
import {
  getElementContentFormat,
  type ElementContentFormat,
} from "./element-content-format.js";

export type PositionCommentContext = {
  readonly kind: "xml" | "jsdoc" | "block" | "line";
  readonly span: Span;
  readonly text: string;
  readonly isUnclosed: boolean;
};

export type PositionContext = {
  readonly offset: number;
  readonly lineNumber: number;
  readonly colNumber: number;

  /** Current line text without trailing \r or \n. */
  readonly lineText: string;
  readonly textBeforeOnLine: string;
  readonly textAfterOnLine: string;
  readonly lineIndent: number;

  /** Previous non-whitespace line text and indent (0 if no previous line). */
  readonly prevNonEmptyLineText: string;
  readonly prevNonEmptyLineIndent: number;

  /** XML hierarchy */
  readonly currentElement: ElementNode | null;
  readonly parentElements: readonly ElementNode[];
  readonly depth: number;
  readonly contentFormat: ElementContentFormat;
  readonly isInsideSchema: boolean;
  readonly isSchemaZone: boolean;

  /** Comment context if cursor is inside a comment */
  readonly comment: PositionCommentContext | null;

  /** Immediate cursor surroundings */
  readonly isBetweenTags: {
    readonly openTagName: string;
    readonly closeTagName: string;
  } | null;
  readonly isBetweenBrackets: {
    readonly open: string;
    readonly close: string;
  } | null;
  readonly isBetweenXmlComment: boolean;
};

const BRACKET_PAIRS: { readonly [left: string]: string } = {
  "{": "}",
  "[": "]",
  "(": ")",
};

/**
 * Computes semantic, syntactic, and structural context at a given position in a
 * document.
 */
export function getPositionContext(
  content: string,
  offset: number,
): PositionContext {
  offset = Math.max(0, Math.min(offset, content.length));
  const lineFinder = createLineFinder(content);
  const lineMatch = findLine(offset, lineFinder);

  const lineNumber = lineMatch.line.zeroBasedLineNumber;
  const colNumber = lineMatch.zeroBasedColNumber;
  const lineText = lineMatch.line.line;
  const textBeforeOnLine = lineText.slice(0, colNumber);
  const textAfterOnLine = lineText.slice(colNumber);

  const indentMatch = /^[ \t]*/.exec(lineText);
  const lineIndent = indentMatch ? indentMatch[0].length : 0;

  // Previous non-empty line
  let prevNonEmptyLineText = "";
  let prevNonEmptyLineIndent = 0;
  for (let i = lineNumber - 1; i >= 0; i--) {
    const start = lineFinder.lineStarts[i]!;
    const nextStart =
      i + 1 < lineFinder.lineStarts.length
        ? lineFinder.lineStarts[i + 1]!
        : content.length;
    const rawLine = content.slice(start, nextStart).replace(/[\r\n]+$/, "");
    if (/\S/.test(rawLine)) {
      prevNonEmptyLineText = rawLine;
      const match = /^[ \t]*/.exec(rawLine);
      prevNonEmptyLineIndent = match ? match[0].length : 0;
      break;
    }
  }

  // XML Element hierarchy
  const parsed = parseXmlDocument(content, "path");

  function findInnermost(
    node: ElementNode,
    currentDepth: number,
    parents: ElementNode[],
  ): {
    currentElement: ElementNode;
    parentElements: ElementNode[];
    depth: number;
  } {
    for (const child of node.children) {
      if (
        child.kind === "element" &&
        offset >= child.start &&
        offset <= child.end
      ) {
        return findInnermost(child, currentDepth + 1, [...parents, node]);
      }
    }
    return {
      currentElement: node,
      parentElements: parents,
      depth: currentDepth,
    };
  }

  const { currentElement, parentElements, depth } =
    parsed.root && offset >= parsed.root.start && offset <= parsed.root.end
      ? findInnermost(parsed.root, 0, [])
      : {
          currentElement: null,
          parentElements: [] as ElementNode[],
          depth: 0,
        };

  const contentFormat: ElementContentFormat = currentElement
    ? getElementContentFormat(currentElement, depth)
    : "unrendered-xml";

  const isInsideSchema =
    contentFormat === "schema" &&
    Boolean(
      currentElement &&
      offset >= currentElement.contentStart &&
      (!currentElement.closingTag || offset <= currentElement.closingTag.start),
    );

  // Check comment context
  let comment: PositionCommentContext | null = null;

  // 1. Check XML comments
  const allXmlComments: XmlComment[] = [...parsed.topLevelComments];
  function collectXmlComments(element: ElementNode): void {
    allXmlComments.push(...element.comments);
    for (const child of element.children) {
      if (child.kind === "element") {
        collectXmlComments(child);
      }
    }
  }
  if (parsed.root) {
    collectXmlComments(parsed.root);
  }

  for (const c of allXmlComments) {
    if (offset >= c.start && offset <= c.end) {
      const isUnclosed = !c.xmlSlice.endsWith("-->");
      comment = {
        kind: "xml",
        span: c,
        text: c.xmlSlice,
        isUnclosed,
      };
      break;
    }
  }

  // 2. If not XML comment and inside schema block, check schema comments
  if (!comment && contentFormat === "schema" && currentElement) {
    for (const child of currentElement.children) {
      if (
        child.kind === "text" &&
        offset >= child.start &&
        offset <= child.end
      ) {
        const tokens = tokenizeSchema(child);
        for (const t of tokens) {
          if (
            t.kind === "comment" &&
            offset >= t.span.start &&
            offset <= t.span.end
          ) {
            const text = content.slice(t.span.start, t.span.end);
            let kind: "jsdoc" | "block" | "line" = "line";
            let isUnclosed = false;
            if (text.startsWith("/**")) {
              kind = "jsdoc";
              isUnclosed = !text.endsWith("*/");
            } else if (text.startsWith("/*")) {
              kind = "block";
              isUnclosed = !text.endsWith("*/");
            }
            comment = {
              kind,
              span: t.span,
              text,
              isUnclosed,
            };
            break;
          }
        }
        if (comment) break;
      }
    }
  }

  // Check isBetweenTags: e.g. `<system>|</system>`
  const openTagMatch = /<([_a-zA-Z0-9\-:]+)(?:\s+[^>]*)?>$/.exec(
    textBeforeOnLine,
  );
  const closeTagMatch = /^<\/([_a-zA-Z0-9\-:]+)>/.exec(textAfterOnLine);
  let isBetweenTags: {
    readonly openTagName: string;
    readonly closeTagName: string;
  } | null = null;
  if (openTagMatch && closeTagMatch) {
    isBetweenTags = {
      openTagName: openTagMatch[1]!,
      closeTagName: closeTagMatch[1]!,
    };
  }

  // Check isBetweenBrackets: e.g. `{|}`, `[|]`, `(|)`
  const trimmedBefore = textBeforeOnLine.trimEnd();
  const trimmedAfter = textAfterOnLine.trimStart();
  const lastChar = trimmedBefore.slice(-1);
  const firstChar = trimmedAfter.slice(0, 1);
  let isBetweenBrackets: {
    readonly open: string;
    readonly close: string;
  } | null = null;
  if (lastChar && BRACKET_PAIRS[lastChar] === firstChar) {
    const afterLastChar = textBeforeOnLine.slice(
      textBeforeOnLine.lastIndexOf(lastChar) + 1,
    );
    const beforeFirstChar = textAfterOnLine.slice(
      0,
      textAfterOnLine.indexOf(firstChar),
    );
    if (/^\s*$/.test(afterLastChar) && /^\s*$/.test(beforeFirstChar)) {
      isBetweenBrackets = { open: lastChar, close: firstChar };
    }
  }

  const isBetweenXmlComment =
    /<!--\s*$/.test(textBeforeOnLine) && /^\s*-->/.test(textAfterOnLine);

  return {
    offset,
    lineNumber,
    colNumber,
    lineText,
    textBeforeOnLine,
    textAfterOnLine,
    lineIndent,
    prevNonEmptyLineText,
    prevNonEmptyLineIndent,
    currentElement,
    parentElements,
    depth,
    contentFormat,
    isInsideSchema,
    isSchemaZone: isInsideSchema,
    comment,
    isBetweenTags,
    isBetweenBrackets,
    isBetweenXmlComment,
  };
}
