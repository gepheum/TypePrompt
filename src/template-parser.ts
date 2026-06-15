import { parseXmlDocument, type XmlDocument } from "./xml-parser.js";

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
  /// 0-based
  readonly line: number;
  /// 0-based codepoint offset (not UTF-16 offset)
  readonly column: number;
  // UTF-16 offset
  readonly position: number;
  readonly message: string;
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
  throw "TODO";
}

class Parser {
  readonly errors: TemplateParseError[] = [];

  parse(sourceFile: SourceFile): void {
    const xmlDocument = parseXmlDocument(sourceFile.content);
    if (xmlDocument.kind === "error") {
      for (const error of xmlDocument.errors) {
        const { line, column } = offsetToLineColumn(
          sourceFile.content,
          error.start,
        );
        this.errors.push({
          path: sourceFile.path,
          line,
          column,
          position: error.start,
          message: error.message,
        });
      }
    } else {
      this.parseTemplate(xmlDocument);
    }
  }

  private parseTemplate(xmlDocument: XmlDocument): void {
    // for (const node of xmlDocument.root.children)
  }
}

function offsetToLineColumn(
  content: string,
  offset: number,
): { readonly line: number; readonly column: number } {
  const lines = content.slice(0, offset).split("\n");
  // Spread to count Unicode codepoints rather than UTF-16 code units.
  return {
    line: lines.length - 1,
    column: [...lines[lines.length - 1]!].length,
  };
}
