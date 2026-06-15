import {
  ElementNode,
  parseXmlDocument,
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
  /// 0-based
  readonly line: number;
  /// 0-based codepoint offset (not UTF-16 offset)
  readonly column: number;
  // UTF-16 offset
  readonly position: number;
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
    const xmlDocument = parseXmlDocument(sourceFile.content);
    if (xmlDocument.kind === "error") {
      for (const error of xmlDocument.errors) {
        this.pushError(sourceFile, error.start, error.end, error.message);
      }
    } else {
      this.parseTemplate(xmlDocument, sourceFile);
    }
  }

  private parseTemplate(
    xmlDocument: XmlDocument,
    sourceFile: SourceFile,
  ): void {
    for (const node of xmlDocument.root.children) {
      switch (node.kind) {
        case "element": {
          if (node.tagName.text === "template") {
            this.parseTemplateElement(node, sourceFile);
          } else {
            this.pushError(
              sourceFile,
              node.tagName.start,
              node.tagName.end,
              `Unexpected element '<${node.tagName.text}>'`,
            );
          }
          break;
        }
        case "text": {
          if (!node.allWhitespace) {
            this.pushError(
              sourceFile,
              node.sourceSpan.start,
              node.sourceSpan.end,
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
    sourceFile: SourceFile,
  ): void {}

  private pushError(
    sourceFile: SourceFile,
    start: number,
    end: number,
    message: string,
  ): void {
    this.errors.push({
      path: sourceFile.path,
      startPosition: offsetToPosition(sourceFile.content, start),
      endPosition: offsetToPosition(sourceFile.content, end),
      message,
    });
  }
}

function offsetToPosition(content: string, offset: number): Position {
  // Assumes \n line endings; \r\n normalization is the caller's responsibility.
  const lines = content.slice(0, offset).split("\n");
  // Spread to count Unicode codepoints rather than UTF-16 code units.
  return {
    line: lines.length - 1,
    column: [...lines[lines.length - 1]!].length,
    position: offset,
  };
}
