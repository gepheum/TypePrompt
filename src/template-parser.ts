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
  readonly templates: {
    readonly [name: string]: TemplateBundle;
  };
};

export type TemplateBundle =
  | {
      readonly kind: "no-variants";
      readonly name: string;
      readonly template: Template;
    }
  | {
      readonly kind: "variants";
      readonly name: string;
      readonly variants: {
        readonly [variant: string]: Template;
      };
    };

export type Template = {
  readonly name: string;
  /// Variant name. Can be empty.
  readonly variant: string;
  readonly content: readonly TemplatePiece[];
  readonly xmlContent: string
};

export type TemplatePiece =
  | {
      readonly kind: "text";
      readonly text: string;
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
    templates: parser.getTemplates(),
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
              this.pushTemplate(template);
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

  private pushTemplate(template: Template): void {
    const templates = this.templates;
    const existing = templates[template.name];
    if (existing) {
      if (template.variant === "") {
        existing.noVariantTemplates.push(template);
      } else {
        (existing[template.variant] ??= []).push(template);
      }
      return;
    }

    templates[template.name] = {
      noVariantTemplates: template.variant === "" ? [template] : [],
      ...(template.variant === "" ? {} : { [template.variant]: [template] }),
    };
  }

  getTemplates(): { readonly [name: string]: TemplateBundle } {
    const result: { [name: string]: TemplateBundle } = {};
    for (const [name, templatesForName] of Object.entries(this.templates)) {
      const variants = Object.fromEntries(
        Object.entries(templatesForName)
          .filter(([variantName]) => variantName !== "noVariantTemplates")
          .map(([variantName, templates]) => [variantName, templates[0]!]),
      );

      if (Object.keys(variants).length === 0) {
        const noVariantTemplate = templatesForName.noVariantTemplates[0];
        if (noVariantTemplate) {
          result[name] = {
            kind: "no-variants",
            name,
            template: noVariantTemplate,
          };
        }
      } else {
        result[name] = {
          kind: "variants",
          name,
          variants,
        };
      }
    }
    return result;
  }

  private templates: {
    [name: string]: {
      // It's an error to have more than one no-variants template with the same name.
      readonly noVariantTemplates: Template[];
      // It's an error to have more than one template with the same name and variant.
      [variant: string]: Template[];
    };
  } = {};
}

class TemplateParseFlow {
  static parse(
    templateNode: ElementNode,
    context: SourceFileContext,
  ): Template | null {
    const flow = new TemplateParseFlow(context);
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
            flow.parseSchema(child);
          } else if (tagName === "example") {
            flow.parseExample(child);
          } else if (tagName === "arg") {
            flow.parseArg(child);
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
    return {
      name: name,
      variant: variant ?? "",
      content: flow.trimAndDedent(),
      xmlContent: templateNode.contentSpan.text,
    };
  }

  private constructor(readonly context: SourceFileContext) {}

  private trimAndDedent(): TemplatePiece[] {
    const baseIndent = determineBaseIndent(this.templatePieces[0]);
    const transformed: TemplatePiece[] = [];

    for (const piece of this.templatePieces) {
      if (piece.kind === "arg") {
        transformed.push(piece);
        continue;
      }

      transformed.push({
        kind: "text",
        text: removeIndentAfterEol(piece.text, baseIndent, this.context),
      });
    }

    trimLeadingEmptyLines(transformed);
    trimTrailingEmptyLines(transformed);
    return transformed;
  }

  private parseSchema(schemaNode: ElementNode): void {
    const text = getTextContent(schemaNode, this.context);
    const attributes = checkXmlAttributes(schemaNode, {
      hide: zod.enum(["false", "true"]).optional(),
    });
    if (attributes.kind === "error") {
      this.context.pushErrors(attributes.errors);
      this.schema = { kind: "error" };
      return;
    }
    if (this.schema.kind !== "no-schema") {
      this.context.pushError(
        schemaNode.tagName,
        "Multiple <schema> elements are not allowed",
      );
      this.schema = { kind: "error" };
      return;
    }
    const schema = parseSchema(text.decoded);
    if (schema.kind === "error") {
      this.context.pushErrors(
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

  private parseExample(exampleNode: ElementNode): void {
    const text = getTextContent(exampleNode, this.context);
    const attributes = checkXmlAttributes(exampleNode, {
      type: zod
        .string()
        .regex(/^[A-Z_][A-Za-z0-9]*$/)
        .optional(),
    });
    if (attributes.kind === "error") {
      this.context.pushErrors(attributes.errors);
      this.schema = { kind: "error" };
      return;
    }
    const example = parseExample(text.decoded);
    if (example.kind === "error") {
      this.context.pushErrors(
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

  private parseArg(argNode: ElementNode): void {
    if (!argNode.isSelfClosing) {
      this.context.pushError(
        argNode.tagName,
        "<arg> elements must be self-closing",
      );
      return;
    }
    const attributes = checkXmlAttributes(argNode, {
      name: zod.string().regex(/^[a-z][A-Za-z0-9]*$/),
    });
    if (attributes.kind === "error") {
      this.context.pushErrors(attributes.errors);
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

  private readonly templatePieces: TemplatePieceArg[] = [];
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

type TemplatePieceArg =
  | {
      readonly kind: "text";
      readonly text: TextNodeJoin;
    }
  | {
      readonly kind: "arg";
      readonly name: string;
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

function determineBaseIndent(firstPiece: TemplatePieceArg | undefined): string {
  if (firstPiece?.kind !== "text") {
    return "";
  }

  const firstText = firstPiece.text.decoded;
  const firstNewline = firstText.indexOf("\n");
  if (firstNewline === -1) {
    return "";
  }

  const firstLine = firstText.slice(0, firstNewline);
  if (/[^ \t]/.test(firstLine)) {
    return "";
  }

  const lines = firstText.split("\n");
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/[^ \t]/.test(line)) {
      return leadingWhitespace(line);
    }
  }

  return leadingWhitespace(lines.at(-1) ?? "");
}

function leadingWhitespace(text: string): string {
  const match = text.match(/^[ \t]*/);
  return match ? match[0] : "";
}

function removeIndentAfterEol(
  textNode: TextNodeJoin,
  baseIndent: string,
  context: SourceFileContext,
): string {
  const source = textNode.decoded;
  if (source.length === 0 || baseIndent.length === 0) {
    return source;
  }

  let output = "";
  let cursor = 0;

  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== "\n") {
      continue;
    }

    output += source.slice(cursor, i + 1);
    const next = i + 1;
    if (next >= source.length) {
      cursor = next;
      continue;
    }

    if (source[next] === "\n") {
      cursor = next;
      continue;
    }

    if (source.startsWith(baseIndent, next)) {
      cursor = next + baseIndent.length;
      continue;
    }

    const sourceOffset = textNodeDecodedOffsetToSourceOffset(textNode, next);
    context.pushError(
      { start: sourceOffset, end: sourceOffset },
      `Expected indentation '${baseIndent.replace(/\t/g, "\\t")}' after end-of-line`,
    );
    cursor = next;
  }

  output += source.slice(cursor);
  return output;
}

function trimLeadingEmptyLines(pieces: TemplatePiece[]): void {
  while (pieces.length > 0 && pieces[0]!.kind === "text") {
    const piece = pieces[0]!;
    const trimmed = trimLeadingEmptyLinesInText(piece.text);
    if (trimmed === piece.text) {
      return;
    }
    if (trimmed.length === 0) {
      pieces.shift();
      continue;
    }
    pieces[0] = { kind: "text", text: trimmed };
    return;
  }
}

function trimTrailingEmptyLines(pieces: TemplatePiece[]): void {
  while (pieces.length > 0) {
    const index = pieces.length - 1;
    const piece = pieces[index]!;
    if (piece.kind !== "text") {
      return;
    }
    const trimmed = trimTrailingEmptyLinesInText(piece.text);
    if (trimmed === piece.text) {
      return;
    }
    if (trimmed.length === 0) {
      pieces.pop();
      continue;
    }
    pieces[index] = { kind: "text", text: trimmed };
    return;
  }
}

function trimLeadingEmptyLinesInText(text: string): string {
  let current = text;
  while (true) {
    const newline = current.indexOf("\n");
    if (newline === -1) {
      return /^[ \t]*$/.test(current) ? "" : current;
    }
    const firstLine = current.slice(0, newline);
    if (/[^ \t]/.test(firstLine)) {
      return current;
    }
    current = current.slice(newline + 1);
  }
}

function trimTrailingEmptyLinesInText(text: string): string {
  let current = text;
  while (true) {
    const newline = current.lastIndexOf("\n");
    if (newline === -1) {
      return /^[ \t]*$/.test(current) ? "" : current;
    }
    const lastLine = current.slice(newline + 1);
    if (/[^ \t]/.test(lastLine)) {
      return current;
    }
    current = current.slice(0, newline);
  }
}
