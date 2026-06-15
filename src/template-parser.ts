import * as zod from "zod";
import { joinTextNodes, TextNodeJoin } from "./text-node-join.js";
import { checkXmlAttributes } from "./xml-attributes-checker.js";
import {
  ElementNode,
  parseXmlDocument,
  TextNode,
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
      for (const error of xmlDocument.errors) {
        context.pushError(error, error.message);
      }
    } else {
      this.parseTemplate(xmlDocument, context);
    }
  }

  private parseTemplate(
    xmlDocument: XmlDocument,
    context: SourceFileContext,
  ): void {
    for (const node of xmlDocument.root.children) {
      switch (node.kind) {
        case "element": {
          if (node.tagName.text === "template") {
            this.parseTemplateElement(node, context);
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

  private parseTemplateElement(
    node: ElementNode,
    context: SourceFileContext,
  ): void {}
}

class TemplateParser {
  constructor(
    private readonly templateNode: ElementNode,
    private readonly context: SourceFileContext,
  ) {}

  parse(): void {
    const { templateNode, context } = this;
    const attributes = checkXmlAttributes(this.templateNode, {
      name: zod.string().regex(/^[A-Z_][A-Za-z0-9]*$/),
      variant: zod
        .string()
        .regex(/^[A-Z_][A-Za-z0-9]*$/)
        .optional(),
    });
    if (attributes.kind === "error") {
      for (const error of attributes.errors) {
        context.pushError(error, error.message);
      }
      return;
    }
    const { name, variant } = attributes.attributes;
    const textNodes: TextNode[] = [];
    for (const child of templateNode.children) {
      switch (child.kind) {
        case "element": {
          const tagName = child.tagName.text;
          if (tagName === "schema") {
            const textContent = getTextContent(child, context);
            if (textContent !== null) {
              // TODO
            }
          } else if (tagName === "example") {
            const textContent = getTextContent(child, context);
            if (textContent !== null) {
              // TODO
            }
          } else {
            context.pushError(
              child.tagName,
              `Unexpected element '<${child.tagName.text}>'`,
            );
          }
          break;
        }
        case "text": {
          textNodes.push(child);
          break;
        }
      }
    }
  }
}

function getTextContent(
  node: ElementNode,
  context: SourceFileContext,
): TextNodeJoin | null {
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
  return joinTextNodes(textNodes, node.contentPosition);
}

class SourceFileContext {
  constructor(
    readonly sourceFile: SourceFile,
    readonly errors: TemplateParseError[],
  ) {}

  pushError(
    position: {
      readonly start: number;
      readonly end: number;
    },
    message: string,
  ): void {
    const { sourceFile } = this;
    this.errors.push({
      path: sourceFile.path,
      startPosition: new PositionImpl(sourceFile.content, position.start),
      endPosition: new PositionImpl(sourceFile.content, position.end),
      message,
    });
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

  toJSON() {
    const { offset, position } = this;
    return { offset, position };
  }
}
