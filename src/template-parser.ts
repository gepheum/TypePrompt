import * as zod from "zod";
import { checkNoAmbiguity } from "./casing.js";
import { Example, parseExample } from "./example-parser.js";
import { validateExample } from "./example-validator.js";
import { parseSchema, type Schema } from "./schema-parser.js";
import {
  joinTextNodes,
  textNodeDecodedOffsetToSourceOffset,
  TextNodeJoin,
} from "./text-node-join.js";
import { checkXmlAttributes } from "./xml-attributes-checker.js";
import {
  parseXmlDocument,
  type ElementNode,
  type TextNode,
  type XmlDocument,
} from "./xml-parser.js";

export type Templates = {
  readonly kind: "success";
  readonly templates: readonly Template[];
};

export type Template = {
  readonly name: string;
  /// Variant name. Can be empty.
  readonly variant: string;
  readonly content: readonly TemplatePiece[];
};

export type TemplatePiece =
  | {
      readonly kind: "text";
      readonly text: TextNodeJoin;
    }
  | {
      readonly kind: "arg";
      readonly name: string;
    };

export type TemplateParseErrors = {
  readonly kind: "error";
  readonly errors: readonly TemplateParseError[];
};

export type TemplateParseError = {
  readonly path: string;
  readonly message: string;
  readonly startPosition: Position;
  readonly endPosition: Position;
};

/// Position in a source file.
export type Position = {
  // UTF-16 offset
  readonly offset: number;
  readonly position: {
    readonly line: string;
    /// 0-based
    readonly lineNumber: number;
    /// 0-based codepoint offset (not UTF-16 offset)
    readonly columnNumber: number;
  };
};

export type SourceFile = {
  readonly path: string;
  readonly content: string;
};

export function parseTemplates(
  sourceFiles: readonly SourceFile[],
): Templates | TemplateParseErrors {
  const parser = new Parser();
  for (const sourceFile of sourceFiles) {
    parser.parse(sourceFile);
  }
  if (parser.errors.length > 0) {
    return {
      kind: "error",
      errors: parser.errors,
    };
  }
  return {
    kind: "success",
    templates: [],
  };
}

class Parser {
  readonly errors: TemplateParseError[] = [];

  parse(sourceFile: SourceFile): void {
    const context = new SourceFileContext(sourceFile, this.errors);
    const xmlDocument = parseXmlDocument(sourceFile.content);
    if (xmlDocument.kind === "error") {
      context.pushErrors(xmlDocument.errors);
    } else {
      this.doParse(xmlDocument, context);
    }
  }

  private doParse(xmlDocument: XmlDocument, context: SourceFileContext): void {
    for (const node of xmlDocument.root.children) {
      switch (node.kind) {
        case "element": {
          if (node.tagName.text === "template") {
            const template = TemplateParseFlow.parse(node, context);
            if (template) {
              // this.pushTemplate(template);
            }
          } else {
            context.pushError(
              node.tagName,
              `Unexpected element '<${node.tagName.text}>'`,
            );
          }
          break;
        }
        case "text": {
          if (!node.allWhitespace) {
            context.pushError(
              node.sourceSpan,
              "Unexpected text content at the top level",
            );
          }
          break;
        }
      }
    }
  }

  private readonly templates: {
    readonly [name: string]: {
      // It's an error to have more than one no-variant template with the same name.
      readonly noVariantTemplates: Template[];
      // It's an error to have more than one template with the same name and variant.
      readonly [variant: string]: Template[];
    };
  } = {};
}

class TemplateParseFlow {
  static parse(
    templateNode: ElementNode,
    context: SourceFileContext,
  ): Template | null {
    const flow = new TemplateParseFlow();
    const attributes = checkXmlAttributes(templateNode, {
      name: zod.string().regex(/^[A-Z][A-Za-z0-9]*$/),
      variant: zod
        .string()
        .regex(/^[A-Z][A-Za-z0-9]*$/)
        .optional(),
    });
    if (attributes.kind === "error") {
      context.pushErrors(attributes.errors);
      return null;
    }
    const name = attributes.attributes.name.value;
    const variant = attributes.attributes.variant?.value;
    for (const child of templateNode.children) {
      switch (child.kind) {
        case "element": {
          const tagName = child.tagName.text;
          if (tagName === "schema") {
            flow.parseSchema(child, context);
          } else if (tagName === "example") {
            flow.parseExample(child, context);
          } else if (tagName === "arg") {
            flow.parseArg(child, context);
          } else {
            context.pushError(
              child.tagName,
              `Unexpected element '<${child.tagName.text}>'`,
            );
          }
          break;
        }
        case "text": {
          flow.templatePieces.push({ kind: "text", text: child });
          break;
        }
      }
    }
    const { schema, examples } = flow;
    // Make sure we have a schema.
    if (schema.kind === "no-schema") {
      context.pushError(
        templateNode.tagName,
        "Missing <schema> element in template",
      );
    } else if (schema.kind === "success") {
      // Validate examples.
      for (const example of examples) {
        const typeName = example.type?.value ?? "Response";
        if (schema.schema.types[typeName] === undefined) {
          context.pushError(example.type!, `Unknown type '${typeName}'`);
        } else {
          const errors = validateExample(
            example.example,
            schema.schema,
            typeName,
          );
          context.pushErrors(
            errors.map((e) => ({
              message: e.message,
              start: e.sourceSpan.start,
              end: e.sourceSpan.end,
            })),
          );
        }
      }
    }
    context.pushErrors(
      checkNoAmbiguity(
        flow.args.map((arg) => ({
          name: arg.name,
          start: arg.sourceSpan.start,
          end: arg.sourceSpan.end,
        })),
      ),
    );
    flow.coalesceTextPieces();
    flow.trimAndDedent(context);
    return {
      name: name,
      variant: variant ?? "",
      content: flow.templatePieces,
    };
  }

  private constructor() {}

  private coalesceTextPieces(): void {
    const coalesced: TemplatePiece[] = [];
    let pendingTextNodes: TextNodeJoin[] = [];
    const flushPendingText = (): void => {
      if (pendingTextNodes.length === 0) {
        return;
      }
      const firstSourceOffset = pendingTextNodes[0]!.offsetMap[0]!.sourceOffset;
      coalesced.push({
        kind: "text",
        text: joinTextNodes(pendingTextNodes, firstSourceOffset),
      });
      pendingTextNodes = [];
    };
    for (const piece of this.templatePieces) {
      if (piece.kind === "text") {
        pendingTextNodes.push(piece.text);
        continue;
      }
      flushPendingText();
      coalesced.push(piece);
    }
    flushPendingText();
    this.templatePieces = coalesced;
  }

  private trimAndDedent(context: SourceFileContext): void {
    const indent = this.findIndent();
    const firstTextPieceIndex = this.templatePieces.findIndex(
      (piece) => piece.kind === "text",
    );
    let lastTextPieceIndex = -1;
    for (let i = this.templatePieces.length - 1; i >= 0; i -= 1) {
      if (this.templatePieces[i]!.kind === "text") {
        lastTextPieceIndex = i;
        break;
      }
    }

    const transformed: TemplatePiece[] = [];
    for (let i = 0; i < this.templatePieces.length; i += 1) {
      const piece = this.templatePieces[i]!;
      if (piece.kind === "arg") {
        transformed.push(piece);
        continue;
      }

      const text = this.trimAndDedentTextPiece(piece.text, indent, {
        trimLeadingEmptyLines: i === firstTextPieceIndex,
        trimTrailingEmptyLines: i === lastTextPieceIndex,
        context,
      });
      if (text !== null) {
        transformed.push({ kind: "text", text });
      }
    }

    this.templatePieces = transformed;
  }

  private findIndent(): string {
    let currentIndent = "";
    for (const piece of this.templatePieces) {
      if (piece.kind === "arg") {
        return currentIndent;
      }

      for (const character of piece.text.decoded) {
        if (character === "\n") {
          currentIndent = "";
          continue;
        }
        if (character === " " || character === "\t") {
          currentIndent += character;
          continue;
        }
        return currentIndent;
      }
    }

    return currentIndent;
  }

  private trimAndDedentTextPiece(
    text: TextNodeJoin,
    indent: string,
    options: {
      readonly trimLeadingEmptyLines: boolean;
      readonly trimTrailingEmptyLines: boolean;
      readonly context: SourceFileContext;
    },
  ): TextNodeJoin | null {
    const lines = splitTextNodeJoinIntoLines(text);
    let firstLineIndex = 0;
    let lastLineIndex = lines.length - 1;

    if (options.trimLeadingEmptyLines) {
      while (
        firstLineIndex <= lastLineIndex &&
        isWhitespaceOnlyLine(lines[firstLineIndex]!.decoded)
      ) {
        firstLineIndex += 1;
      }
    }
    if (options.trimTrailingEmptyLines) {
      while (
        lastLineIndex >= firstLineIndex &&
        isWhitespaceOnlyLine(lines[lastLineIndex]!.decoded)
      ) {
        lastLineIndex -= 1;
      }
    }

    if (firstLineIndex > lastLineIndex) {
      return null;
    }

    const segments: TextNodeJoin[] = [];
    for (let i = firstLineIndex; i <= lastLineIndex; i += 1) {
      const line = lines[i]!;
      const lineText = line.decoded;

      if (
        lineText.length > 0 &&
        !isWhitespaceOnlyLine(lineText) &&
        indent.length > 0 &&
        !lineText.startsWith(indent)
      ) {
        const leadingWhitespaceLength = countLeadingWhitespace(lineText);
        options.context.pushError(
          {
            start: textNodeDecodedOffsetToSourceOffset(text, line.start),
            end: textNodeDecodedOffsetToSourceOffset(text, line.end),
          },
          `Expected line to start with template indent '${indent.replace(/\t/g, "\\t")}'`,
        );
        const contentStart =
          line.start + Math.min(indent.length, leadingWhitespaceLength);
        segments.push(sliceTextNodeJoin(text, contentStart, line.end));
        if (line.hasNewline && i < lastLineIndex) {
          segments.push(sliceTextNodeJoin(text, line.end, line.end + 1));
        }
        continue;
      }

      const dedentLength =
        lineText.length === 0 || isWhitespaceOnlyLine(lineText)
          ? Math.min(indent.length, lineText.length)
          : indent.length;

      const contentStart = line.start + dedentLength;
      segments.push(sliceTextNodeJoin(text, contentStart, line.end));
      if (line.hasNewline && i < lastLineIndex) {
        segments.push(sliceTextNodeJoin(text, line.end, line.end + 1));
      }
    }

    if (segments.length === 0) {
      return null;
    }
    return joinTextNodes(
      segments,
      textNodeDecodedOffsetToSourceOffset(text, lines[firstLineIndex]!.start),
    );
  }

  private parseSchema(
    schemaNode: ElementNode,
    context: SourceFileContext,
  ): void {
    const text = getTextContent(schemaNode, context);
    const attributes = checkXmlAttributes(schemaNode, {
      hide: zod.enum(["false", "true"]).optional(),
    });
    if (attributes.kind === "error") {
      context.pushErrors(attributes.errors);
      this.schema = { kind: "error" };
      return;
    }
    if (this.schema.kind !== "no-schema") {
      context.pushError(
        schemaNode.tagName,
        "Multiple <schema> elements are not allowed",
      );
      this.schema = { kind: "error" };
      return;
    }
    const schema = parseSchema(text.decoded);
    if (schema.kind === "error") {
      context.pushErrors(
        schema.errors.map((e) => ({
          start: textNodeDecodedOffsetToSourceOffset(text, e.start),
          end: textNodeDecodedOffsetToSourceOffset(text, e.end),
          message: e.message,
        })),
      );
      this.schema = { kind: "error" };
      return;
    }
    this.schema = {
      kind: "success",
      schema: schema,
      hide: attributes.attributes.hide?.value === "true",
    };
    if (attributes.attributes.hide?.value !== "true") {
      this.templatePieces.push({ kind: "text", text: text });
    }
  }

  private parseExample(
    exampleNode: ElementNode,
    context: SourceFileContext,
  ): void {
    const text = getTextContent(exampleNode, context);
    const attributes = checkXmlAttributes(exampleNode, {
      type: zod
        .string()
        .regex(/^[A-Z_][A-Za-z0-9]*$/)
        .optional(),
    });
    if (attributes.kind === "error") {
      context.pushErrors(attributes.errors);
      this.schema = { kind: "error" };
      return;
    }
    const example = parseExample(text.decoded);
    if (example.kind === "error") {
      context.pushErrors(
        example.errors.map((e) => ({
          start: textNodeDecodedOffsetToSourceOffset(text, e.start),
          end: textNodeDecodedOffsetToSourceOffset(text, e.end),
          message: e.message,
        })),
      );
      return;
    }
    this.examples.push({
      example: example,
      type: attributes.attributes.type,
    });
    this.templatePieces.push({ kind: "text", text: text });
  }

  private parseArg(argNode: ElementNode, context: SourceFileContext): void {
    if (!argNode.isSelfClosing) {
      context.pushError(argNode.tagName, "<arg> elements must be self-closing");
      return;
    }
    const attributes = checkXmlAttributes(argNode, {
      name: zod.string().regex(/^[a-z][A-Za-z0-9]*$/),
    });
    if (attributes.kind === "error") {
      context.pushErrors(attributes.errors);
      return;
    }
    this.args.push({
      name: attributes.attributes.name.value,
      sourceSpan: attributes.attributes.name,
    });
    this.templatePieces.push({
      kind: "arg",
      name: attributes.attributes.name.value,
    });
  }

  private templatePieces: TemplatePiece[] = [];
  private schema: SchemaState = { kind: "no-schema" };
  private readonly examples: ExampleState[] = [];
  private args: ArgState[] = [];
}

type SchemaState =
  | {
      readonly kind: "no-schema";
    }
  | {
      readonly kind: "error";
    }
  | {
      readonly kind: "success";
      readonly schema: Schema;
      readonly hide: boolean;
    };

type ExampleState = {
  readonly example: Example;
  readonly type: { start: number; end: number; value: string } | undefined;
};

type ArgState = {
  readonly name: string;
  readonly sourceSpan: {
    readonly start: number;
    readonly end: number;
  };
};

function getTextContent(
  node: ElementNode,
  context: SourceFileContext,
): TextNodeJoin {
  const textNodes: TextNode[] = [];
  for (const child of node.children) {
    switch (child.kind) {
      case "text": {
        textNodes.push(child);
        break;
      }
      case "element": {
        context.pushError(
          child.tagName,
          `Unexpected element '<${node.tagName.text}>'`,
        );
        break;
      }
    }
  }
  return joinTextNodes(textNodes, node.contentSpan.start);
}

class SourceFileContext {
  constructor(
    readonly sourceFile: SourceFile,
    readonly errors: TemplateParseError[],
  ) {}

  pushError(
    range: {
      readonly start: number;
      readonly end: number;
    },
    message: string,
  ): void {
    const { sourceFile } = this;
    this.errors.push({
      path: sourceFile.path,
      startPosition: new PositionImpl(sourceFile.content, range.start),
      endPosition: new PositionImpl(sourceFile.content, range.end),
      message,
    });
  }

  pushErrors(
    errors: ReadonlyArray<{
      readonly message: string;
      readonly start: number;
      readonly end: number;
    }>,
  ): void {
    for (const error of errors) {
      this.pushError({ start: error.start, end: error.end }, error.message);
    }
  }
}

class PositionImpl implements Position {
  readonly offset: number;
  private readonly _content: string;

  constructor(content: string, offset: number) {
    this._content = content;
    this.offset = offset;
  }

  get position(): {
    readonly line: string;
    readonly lineNumber: number;
    readonly columnNumber: number;
  } {
    const before = this._content.slice(0, this.offset);
    const linesBefore = before.split("\n");
    const lineNumber = linesBefore.length - 1;
    const lineStart = this.offset - linesBefore[lineNumber]!.length;
    const lineEndRaw = this._content.indexOf("\n", this.offset);
    const line = this._content.slice(
      lineStart,
      lineEndRaw === -1 ? this._content.length : lineEndRaw,
    );
    // Count codepoints rather than UTF-16 code units.
    const columnNumber = [...linesBefore[lineNumber]!].length;
    return { line, lineNumber, columnNumber };
  }

  toJSON(): {
    readonly offset: number;
    readonly position: Position["position"];
  } {
    const { offset, position } = this;
    return { offset, position };
  }
}

function splitTextNodeJoinIntoLines(
  text: TextNodeJoin,
): Array<{
  readonly start: number;
  readonly end: number;
  readonly hasNewline: boolean;
  readonly decoded: string;
}> {
  const lines: Array<{
    readonly start: number;
    readonly end: number;
    readonly hasNewline: boolean;
    readonly decoded: string;
  }> = [];
  let lineStart = 0;
  while (lineStart <= text.decoded.length) {
    const newlineIndex = text.decoded.indexOf("\n", lineStart);
    const lineEnd = newlineIndex === -1 ? text.decoded.length : newlineIndex;
    lines.push({
      start: lineStart,
      end: lineEnd,
      hasNewline: newlineIndex !== -1,
      decoded: text.decoded.slice(lineStart, lineEnd),
    });
    if (newlineIndex === -1) {
      break;
    }
    lineStart = newlineIndex + 1;
  }
  return lines;
}

function isWhitespaceOnlyLine(text: string): boolean {
  return /^[ \t]*$/.test(text);
}

function countLeadingWhitespace(text: string): number {
  let count = 0;
  while (count < text.length) {
    const character = text[count]!;
    if (character !== " " && character !== "\t") {
      break;
    }
    count += 1;
  }
  return count;
}

function sliceTextNodeJoin(
  text: TextNodeJoin,
  start: number,
  end: number,
): TextNodeJoin {
  if (start === end) {
    return {
      decoded: "",
      offsetMap: [
        {
          decodedOffset: 0,
          sourceOffset: textNodeDecodedOffsetToSourceOffset(text, start),
        },
      ],
    };
  }

  const decoded = text.decoded.slice(start, end);
  const offsetMap: {
    readonly decodedOffset: number;
    readonly sourceOffset: number;
  }[] = [
    {
      decodedOffset: 0,
      sourceOffset: textNodeDecodedOffsetToSourceOffset(text, start),
    },
  ];

  for (const entry of text.offsetMap) {
    if (entry.decodedOffset <= start || entry.decodedOffset >= end) {
      continue;
    }
    offsetMap.push({
      decodedOffset: entry.decodedOffset - start,
      sourceOffset: entry.sourceOffset,
    });
  }

  return { decoded, offsetMap };
}
