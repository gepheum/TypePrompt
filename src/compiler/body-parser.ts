import { ErrorSink, MappedText, TextSpan } from "../util/common-types.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import { ElementNode, XmlNode } from "../xml/xml-types.js";
import { Body, BodyPiece, Expression, InsertFormat } from "./compiler-types.js";

import * as z from "zod";
import { parseCTag } from "../ctag/ctag-parser.js";
import { CTag } from "../ctag/ctag-types.js";
import { textToSourcePosition } from "../util/position-mapper.js";
import { parseExpression } from "./expression-parser.js";
import { extractTextContent } from "./text-extractor.js";

export function parseBody(parentNode: ElementNode, errors: ErrorSink): Body {
  const rawPieces: RawBodyPiece[] = [];

  const visitInsertSnippet = (insertNode: ElementNode): void => {
    const attrs = checkXmlAttributes(insertNode, {
      snippet: {
        schema: z.string().regex(/^[A-Z][A-Za-z0-9]*$/),
        expected: "an UpperCamelCase identifier",
      },
    });
    if (attrs.kind === "error") {
      errors.push(...attrs.errors);
      return;
    }
    rawPieces.push({
      kind: "insert-snippet",
      snippet: attrs.attributes.snippet.valueSpan,
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
        schema: z.enum(["text", "json", "toon", "csv", "tsv"]).optional(),
        expected: "a lowerCamelCase identifier",
      },
    });
    if (attrs.kind === "error") {
      errors.push(...attrs.errors);
      return;
    }
    const val = parseExpression(attrs.attributes.val.valueSpan, {
      acceptIt: true,
    });
    if (val.kind === "error") {
      errors.push(...val.errors);
      return;
    }
    const format = attrs.attributes.format?.value ?? null;
    rawPieces.push({
      kind: "insert-val",
      val: val.expression,
      format: format,
    });
  };

  const visit = (child: XmlNode): void => {
    if (child.kind === "text") {
      rawPieces.push({ kind: "text", text: child });
      return;
    }
    const tag = child.tag.text;
    if (tag === "c") {
      const attrs = checkXmlAttributes(child, {});
      if (attrs.kind === "error") {
        errors.push(...attrs.errors);
      }
      const textContent = extractTextContent(child);
      if (textContent.kind === "error") {
        errors.push(...textContent.errors);
        return;
      }
      const cTag = parseCTag(textContent.text);
      if (cTag.kind === "error") {
        errors.push(...cTag.errors);
      } else {
        rawPieces.push({
          kind: "c-tag",
          text: textContent.text,
          cTag: cTag,
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
        errors.push(...encAttrs.errors);
      } else {
        const encTagName = encAttrs.attributes.tag.value;
        rawPieces.push({ kind: "synthetic-text", text: `<${encTagName}>` });
        visitChildren(child);
        rawPieces.push({ kind: "synthetic-text", text: `</${encTagName}>` });
      }
    } else if (tag === "insert") {
      if (child.attributes["snippet"]) {
        visitInsertSnippet(child);
      } else {
        visitInsertValue(child);
      }
    } else {
      errors.push({
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

  const dedented = dedentRawPieces(rawPieces, errors);
  return toBodyPieces(dedented);
}

/** A piece collected from a raw XML body walk, before trim/dedent. */
type RawBodyPiece<Text = MappedText> =
  | { readonly kind: "text"; readonly text: Text }
  | { readonly kind: "c-tag"; readonly text: Text; readonly cTag: CTag }
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
type DedentedPiece = RawBodyPiece<string>;

function dedentRawPieces(
  rawPieces: readonly RawBodyPiece[],
  errors: ErrorSink,
): DedentedPiece[] {
  const firstRaw = rawPieces[0];
  const baseIndent =
    firstRaw?.kind === "text" ? computeBaseIndent(firstRaw.text) : "";

  const dedented: DedentedPiece[] = [];
  for (const p of rawPieces) {
    if (p.kind === "text" || p.kind === "c-tag") {
      let text = removeIndentAfterEol(p.text, baseIndent, errors);
      if (p.kind === "text" && text.startsWith("\n") && dedented.length <= 0) {
        // Remove the first newline if it's the first piece.
        text = text.slice(1);
      }
      dedented.push({
        ...p,
        text: text,
      });
    } else if (p.kind === "synthetic-text") {
      dedented.push({ kind: "text", text: p.text });
    } else {
      dedented.push(p);
    }
  }

  return dedented;
}

function computeBaseIndent(firstTextNode: MappedText): string {
  const { text } = firstTextNode;
  const firstNl = text.indexOf("\n");
  if (firstNl === -1) {
    return "";
  }
  const firstLine = text.slice(0, firstNl);
  if (/[^ \t]/.test(firstLine)) {
    return "";
  }
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
  errors: ErrorSink,
): string {
  const { text } = textNode;
  if (text.length === 0 || baseIndent.length === 0) return text;
  let out = "";
  let cursor = 0;
  while (true) {
    const eolIndex = text.indexOf("\n", cursor);
    if (eolIndex < 0) {
      break;
    }
    out += text.slice(cursor, eolIndex).trimEnd().concat("\n");
    cursor = eolIndex + 1; // Move after the newline
    if (cursor >= text.length) {
      break;
    }
    const whiteLineMatch = /^[ \t]*\n/.exec(text.slice(cursor));
    if (whiteLineMatch) {
      // A line with only whitespaces. Skip them.
      cursor += whiteLineMatch[0].length - 1;
      continue;
    }
    if (text.startsWith(baseIndent, cursor)) {
      cursor += baseIndent.length;
    } else {
      const pos = textToSourcePosition(textNode, cursor);
      const formattedIndent = baseIndent.replace(/\t/g, "\\t");
      errors.push({
        span: { start: pos, end: pos },
        message: `Indentation error; expected: '${formattedIndent}'`,
      });
    }
  }
  out += text.slice(cursor);
  return out;
}

function toBodyPieces(dedentedPieces: readonly DedentedPiece[]): BodyPiece[] {
  let lastLineState: { allWhitespace: boolean; indent: string } | undefined;
  const updateLastLineState = (text: string): void => {
    const lastEol = text.lastIndexOf("\n");
    if (lastEol < 0) {
      // Single line
      const indent = /^[ \t]*/.exec(text)![0];
      const allWhitespace = indent.length === text.length;
      if (lastLineState === undefined) {
        lastLineState = { allWhitespace, indent };
      } else if (lastLineState?.allWhitespace) {
        const newIndent = lastLineState.indent + indent;
        lastLineState = { allWhitespace, indent: newIndent };
      }
    } else {
      // Multiple lines
      const lastLine = text.slice(lastEol + 1);
      const indent = /^[ \t]*/.exec(lastLine)![0];
      const allWhitespace = indent.length === lastLine.length;
      lastLineState = { allWhitespace, indent };
    }
  };

  const result: BodyPiece[] = [];

  for (const dedentedPiece of dedentedPieces) {
    switch (dedentedPiece.kind) {
      case "text": {
        let { text } = dedentedPiece;
        if (result.length <= 0 && text.startsWith("\n")) {
          // Trim leading newline.
          text = text.slice(1);
        }
        if (text.length) {
          result.push({ kind: "text", text });
          updateLastLineState(text);
        }
        break;
      }
      case "c-tag": {
        result.push(dedentedPiece);
        updateLastLineState(dedentedPiece.text);
        break;
      }
      case "synthetic-text": {
        const { text } = dedentedPiece;
        result.push({ kind: "text", text });
        updateLastLineState(text);
        break;
      }
      case "insert-snippet":
      case "insert-val": {
        if (lastLineState?.allWhitespace) {
          lastLineState = { ...lastLineState, allWhitespace: false };
        }
        const indent = lastLineState?.indent ?? "";
        result.push({ ...dedentedPiece, indent });
        break;
      }
    }
  }

  // Trim trailing newline.
  const lastPiece = result.at(-1);
  if (lastPiece?.kind === "text") {
    let { text } = lastPiece;
    if (text.endsWith("\n")) {
      text = text.slice(0, -1);
      result.pop();
      if (text.length) {
        result.push({ kind: "text", text });
      }
    }
  }

  return result;
}
