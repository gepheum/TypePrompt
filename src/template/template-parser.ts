import * as zod from "zod";
import { parseExample } from "../example/example-parser.js";
import { validateExample } from "../example/example-validator.js";
import { parseSchema } from "../schema/schema-parser.js";
import type { Schema } from "../schema/schema-types.js";
import { checkNoAmbiguity } from "../util/casing.js";
import {
  joinTextNodes,
  textNodeDecodedOffsetToSourceOffset,
  type TextNodeJoin,
} from "../xml/text-node-join.js";
import { checkXmlAttributes } from "../xml/xml-attributes-checker.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import type {
  Position,
  SourceFile,
  Template,
  TemplateArg,
  TemplateFileParseResult,
  TemplateParseError,
  TemplateParseErrors,
  TemplatePiece,
} from "./template-types.js";
export type {
  Position,
  SourceFile,
  TemplateParseError,
  TemplateParseErrors,
} from "./template-types.js";

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

export function parseTemplateFile(
  sourceFile: SourceFile,
): TemplateFileParseResult | TemplateParseErrors {
  const context = new SourceFileContext(sourceFile);

  const xmlDoc = parseXmlDocument(sourceFile.content);
  if (xmlDoc.kind === "error") {
    context.pushErrors(xmlDoc.errors);
    return context.buildErrors();
  }

  const metas: Schema[] = [];
  const templates: Template[] = [];

  for (const node of xmlDoc.root.children) {
    if (node.kind === "text") {
      if (!node.allWhitespace) {
        context.pushError(node.sourceSpan, "Unexpected text at the top level");
      }
      continue;
    }
    const tag = node.tagName.text;
    if (tag === "meta") {
      const schema = parseTopLevelMetaElement(node, context);
      if (schema !== null) {
        metas.push(schema);
      }
    } else if (tag === "template") {
      const template = parseTemplateElement(node, context);
      if (template !== null) {
        templates.push(template);
      }
    } else {
      context.pushError(node.tagName, `Unexpected element '<${tag}>'`);
    }
  }

  if (context.hasErrors()) {
    return context.buildErrors();
  }
  return { kind: "success", path: sourceFile.path, templates, metas };
}

// ---------------------------------------------------------------------------
// Private – internal types used during parsing
// ---------------------------------------------------------------------------

type ArgDeclaration = {
  readonly name: string;
  readonly nameSpan: { readonly start: number; readonly end: number };
  readonly typeName: string | null;
  readonly doc: string;
};

/** A piece collected from a raw XML body walk, before trim/dedent. */
type RawBodyPiece =
  | { readonly kind: "text"; readonly text: TextNodeJoin }
  | { readonly kind: "synthetic-text"; readonly text: string }
  | {
      readonly kind: "arg";
      readonly name: string;
      readonly nameSpan: { readonly start: number; readonly end: number };
      readonly format: "json" | "toon" | null;
    };

/** A piece after dedenting, before final TemplatePiece construction. */
type DedentedPiece =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "arg";
      readonly name: string;
      readonly nameSpan: { readonly start: number; readonly end: number };
      readonly format: "json" | "toon" | null;
    };

// ---------------------------------------------------------------------------
// Private – top-level element parsers
// ---------------------------------------------------------------------------

function parseTopLevelMetaElement(
  metaNode: ElementNode,
  context: SourceFileContext,
): Schema | null {
  const attrs = checkXmlAttributes(metaNode, {});
  if (attrs.kind === "error") {
    context.pushErrors(attrs.errors);
  }
  const text = extractTextContent(metaNode, context);
  const schema = parseSchema(text.decoded, { kind: "meta" });
  if (schema.kind === "error") {
    context.pushErrors(
      schema.errors.map((e) => ({
        start: textNodeDecodedOffsetToSourceOffset(text, e.start),
        end: textNodeDecodedOffsetToSourceOffset(text, e.end),
        message: e.message,
      })),
    );
    return null;
  }
  return schema;
}

function parseTemplateElement(
  templateNode: ElementNode,
  context: SourceFileContext,
): Template | null {
  // Snapshot first — errors from here onward belong to this template.
  const snap = context.snapshot();

  // 1. Validate <template> attributes.
  const attrs = checkXmlAttributes(templateNode, {
    name: {
      schema: zod.string().regex(/^[A-Z][A-Za-z0-9]*$/),
      expected: "an UpperCamelCase identifier",
    },
    namespace: {
      schema: zod
        .string()
        .regex(/^[A-Z][A-Za-z0-9]*$/)
        .optional(),
      expected: "an UpperCamelCase identifier",
    },
  });
  if (attrs.kind === "error") {
    context.pushErrors(attrs.errors);
  }
  const name = attrs.kind === "success" ? attrs.attributes.name.value : "";
  const namespace =
    attrs.kind === "success"
      ? (attrs.attributes.namespace?.value ?? "Default")
      : "Default";

  // 2. Partition children.
  let metaElem: ElementNode | null = null;
  let schemaElem: ElementNode | null = null;
  let argsElem: ElementNode | null = null;
  const bodyElems: ElementNode[] = [];

  for (const child of templateNode.children) {
    if (child.kind === "text") {
      if (!child.allWhitespace) {
        context.pushError(
          child.sourceSpan,
          "Unexpected text inside <template>",
        );
      }
      continue;
    }
    const tag = child.tagName.text;
    if (tag === "meta") {
      if (metaElem !== null) {
        context.pushError(
          child.tagName,
          "Multiple <meta> elements are not allowed",
        );
      } else {
        metaElem = child;
      }
    } else if (tag === "schema") {
      if (schemaElem !== null) {
        context.pushError(
          child.tagName,
          "Multiple <schema> elements are not allowed",
        );
      } else {
        schemaElem = child;
      }
    } else if (tag === "args") {
      if (argsElem !== null) {
        context.pushError(
          child.tagName,
          "Multiple <args> elements are not allowed",
        );
      } else {
        argsElem = child;
      }
    } else if (tag === "body") {
      bodyElems.push(child);
    } else {
      context.pushError(child.tagName, `Unexpected element '<${tag}>'`);
    }
  }

  // 3. Required elements.
  if (schemaElem === null) {
    context.pushError(templateNode.tagName, "Missing <schema> element");
  }
  if (bodyElems.length === 0) {
    context.pushError(templateNode.tagName, "Missing <body> element");
  }

  // 4. <meta> must be self-closing.
  if (metaElem !== null && !metaElem.isSelfClosing) {
    context.pushError(metaElem.tagName, "<meta> element must be self-closing");
  }

  // 5. Variant consistency.
  const hasAnyVariant = bodyElems.some(
    (b) => b.attributes["variant"] !== undefined,
  );
  if (hasAnyVariant && argsElem === null) {
    context.pushError(
      templateNode.tagName,
      "Variant <body> elements require an explicit <args> declaration",
    );
  }
  if (bodyElems.length > 1) {
    const variantNames: Array<{ name: string; start: number; end: number }> =
      [];
    for (const bodyElem of bodyElems) {
      if (bodyElem.attributes["variant"] === undefined) {
        context.pushError(
          bodyElem.tagName,
          "Each <body> element must have a 'variant' attribute when using multiple bodies",
        );
      } else {
        const attr = bodyElem.attributes["variant"]!;
        variantNames.push({
          name: attr.decodedValue,
          start: attr.value.start,
          end: attr.value.end,
        });
      }
    }
    context.pushErrors(
      checkNoAmbiguity(variantNames, { exactMatchIsConflict: true }),
    );
  }

  // 6. Parse <args>.
  let argDeclarations: ArgDeclaration[] | null = null;
  if (argsElem !== null) {
    argDeclarations = parseArgsElement(argsElem, context);
  }
  const argTypeNames =
    argDeclarations?.flatMap((d) =>
      d.typeName !== null ? [d.typeName] : [],
    ) ?? [];

  // 7. Parse <schema>.
  let schema: Schema | null = null;
  if (schemaElem !== null) {
    schema = parseSchemaElement(schemaElem, argTypeNames, context);
  }

  // Abort on structural/schema errors – schema is required for body validation.
  if (context.hasNewErrors(snap)) return null;
  if (schema === null || bodyElems.length === 0) return null;

  // 8. Parse <body> elements.
  const parsedBodies: Array<{
    variant: string | null;
    pieces: TemplatePiece[];
  }> = [];
  const inferredArgFirstSpan = new Map<
    string,
    { start: number; end: number }
  >();
  const inferredArgAllOccurrences: Array<{
    name: string;
    start: number;
    end: number;
  }> = [];

  for (const bodyElem of bodyElems) {
    const variantAttr = bodyElem.attributes["variant"];
    const variant = variantAttr?.decodedValue ?? null;

    const rawPieces = parseBodyContent(
      bodyElem,
      schema,
      argDeclarations,
      context,
    );
    if (rawPieces === null) continue;

    if (argDeclarations === null) {
      for (const p of rawPieces) {
        if (p.kind === "arg") {
          inferredArgAllOccurrences.push({ name: p.name, ...p.nameSpan });
          if (!inferredArgFirstSpan.has(p.name)) {
            inferredArgFirstSpan.set(p.name, p.nameSpan);
          }
        }
      }
    } else {
      // Check that every declared arg is used at least once in this body.
      const usedArgNames = new Set<string>();
      for (const p of rawPieces) {
        if (p.kind === "arg") usedArgNames.add(p.name);
      }
      const bodyDesc =
        variant !== null ? `<body variant="${variant}">` : "<body>";
      for (const decl of argDeclarations) {
        if (!usedArgNames.has(decl.name)) {
          context.pushError(
            decl.nameSpan,
            `Arg '${decl.name}' is not used in ${bodyDesc}`,
          );
        }
      }
    }

    parsedBodies.push({
      variant,
      pieces: processBodyPieces(rawPieces, context),
    });
  }

  if (context.hasNewErrors(snap)) return null;

  // 9. Determine template args and check ambiguity.
  let templateArgs: TemplateArg[];
  if (argDeclarations !== null) {
    context.pushErrors(
      checkNoAmbiguity(
        argDeclarations.map((d) => ({
          name: d.name,
          start: d.nameSpan.start,
          end: d.nameSpan.end,
        })),
      ),
    );
    templateArgs = argDeclarations.map((d) => ({
      name: d.name,
      typeName: d.typeName,
      doc: d.doc,
    }));
  } else {
    context.pushErrors(checkNoAmbiguity(inferredArgAllOccurrences));
    templateArgs = Array.from(inferredArgFirstSpan.keys()).map((n) => ({
      name: n,
      typeName: null,
      doc: "",
    }));
  }

  if (context.hasNewErrors(snap)) return null;

  // 10. Build Template.content.
  let content: Template["content"];
  if (parsedBodies.length === 1 && parsedBodies[0]!.variant === null) {
    content = { kind: "no-variants", body: parsedBodies[0]!.pieces };
  } else {
    const bodies: { [v: string]: readonly TemplatePiece[] } = {};
    for (const { variant, pieces } of parsedBodies) {
      if (variant !== null) {
        bodies[variant] = pieces;
      }
    }
    content = { kind: "variants", bodies };
  }

  return {
    name,
    namespace,
    metaNode: metaElem,
    schema,
    args: templateArgs,
    content,
    xmlContent: templateNode.contentSpan.text,
  };
}

// ---------------------------------------------------------------------------
// Private – child element parsers
// ---------------------------------------------------------------------------

function parseArgsElement(
  argsNode: ElementNode,
  context: SourceFileContext,
): ArgDeclaration[] | null {
  const attrs = checkXmlAttributes(argsNode, {});
  if (attrs.kind === "error") {
    context.pushErrors(attrs.errors);
  }

  const declarations: ArgDeclaration[] = [];
  const snap = context.snapshot();

  for (const child of argsNode.children) {
    if (child.kind === "text") {
      if (!child.allWhitespace) {
        context.pushError(child.sourceSpan, "Unexpected text inside <args>");
      }
      continue;
    }
    if (child.tagName.text !== "arg") {
      context.pushError(
        child.tagName,
        `Unexpected element '<${child.tagName.text}>' in <args>`,
      );
      continue;
    }
    if (!child.isSelfClosing) {
      context.pushError(child.tagName, "<arg> elements must be self-closing");
      continue;
    }
    const argAttrs = checkXmlAttributes(child, {
      name: {
        schema: zod.string().regex(/^[a-z][A-Za-z0-9]*$/),
        expected: "a lowerCamelCase identifier",
      },
      doc: { schema: zod.string().optional(), expected: "a string" },
      type: {
        schema: zod
          .string()
          .regex(/^[A-Z][A-Za-z0-9]*$/)
          .optional(),
        expected: "an UpperCamelCase identifier",
      },
    });
    if (argAttrs.kind === "error") {
      context.pushErrors(argAttrs.errors);
      continue;
    }
    if (argAttrs.attributes.name.value.toLowerCase() === "variant") {
      context.pushError(
        argAttrs.attributes.name,
        `Arg name 'variant' is reserved`,
      );
      continue;
    }
    declarations.push({
      name: argAttrs.attributes.name.value,
      nameSpan: argAttrs.attributes.name,
      typeName: argAttrs.attributes.type?.value ?? null,
      doc: argAttrs.attributes.doc?.value ?? "",
    });
  }

  return context.hasNewErrors(snap) ? null : declarations;
}

function parseSchemaElement(
  schemaNode: ElementNode,
  argTypeNames: readonly string[],
  context: SourceFileContext,
): Schema | null {
  const attrs = checkXmlAttributes(schemaNode, {});
  if (attrs.kind === "error") {
    context.pushErrors(attrs.errors);
  }
  const snap = context.snapshot();
  const text = extractTextContent(schemaNode, context);
  if (context.hasNewErrors(snap)) return null;
  const result = parseSchema(text.decoded, { kind: "template", argTypeNames });
  if (result.kind === "error") {
    context.pushErrors(
      result.errors.map((e) => ({
        start: textNodeDecodedOffsetToSourceOffset(text, e.start),
        end: textNodeDecodedOffsetToSourceOffset(text, e.end),
        message: e.message,
      })),
    );
    return null;
  }
  return result;
}

function parseBodyContent(
  bodyNode: ElementNode,
  schema: Schema,
  argDeclarations: ArgDeclaration[] | null,
  context: SourceFileContext,
): RawBodyPiece[] | null {
  const attrs = checkXmlAttributes(bodyNode, {
    variant: { schema: zod.string().optional(), expected: "a string" },
  });
  if (attrs.kind === "error") {
    context.pushErrors(attrs.errors);
  }

  const pieces: RawBodyPiece[] = [];
  const snap = context.snapshot();

  const visitChildren = (elem: ElementNode): void => {
    for (const child of elem.children) {
      if (child.kind === "text") {
        pieces.push({ kind: "text", text: child });
        continue;
      }

      const tag = child.tagName.text;

      if (tag === "e") {
        const textNodes: TextNodeJoin[] = [];
        const eSnap = context.snapshot();
        for (const eChild of child.children) {
          if (eChild.kind === "text") {
            textNodes.push(eChild);
          } else {
            context.pushError(
              eChild.tagName,
              "<e> elements cannot contain child elements",
            );
          }
        }
        const joined = joinTextNodes(textNodes, child.contentSpan.start);

        if (!context.hasNewErrors(eSnap)) {
          const exResult = parseExample(joined.decoded);
          if (exResult.kind === "error") {
            if (exResult.errors.length > 0) {
              context.pushErrors(
                exResult.errors.map((e) => ({
                  start: textNodeDecodedOffsetToSourceOffset(joined, e.start),
                  end: textNodeDecodedOffsetToSourceOffset(joined, e.end),
                  message: e.message,
                })),
              );
            } else {
              context.pushError(
                child.tagName,
                "Invalid example in <e> element",
              );
            }
          } else {
            const valErrors = validateExample(exResult, schema);
            if (valErrors.length > 0) {
              context.pushErrors(
                valErrors.map((e) => ({
                  start: textNodeDecodedOffsetToSourceOffset(joined, e.start),
                  end: textNodeDecodedOffsetToSourceOffset(joined, e.end),
                  message: e.message,
                })),
              );
            }
          }
          // Always emit the text content (even on validation error).
          pieces.push({ kind: "text", text: joined });
        }
      } else if (tag === "arg") {
        if (!child.isSelfClosing) {
          context.pushError(
            child.tagName,
            "<arg> elements must be self-closing",
          );
          continue;
        }
        const argAttrs = checkXmlAttributes(child, {
          name: {
            schema: zod.string().regex(/^[a-z][A-Za-z0-9]*$/),
            expected: "a lowerCamelCase identifier",
          },
          format: {
            schema: zod.enum(["json", "toon"]).optional(),
            expected: "'json' or 'toon'",
          },
        });
        if (argAttrs.kind === "error") {
          context.pushErrors(argAttrs.errors);
          continue;
        }

        const argName = argAttrs.attributes.name.value;
        const formatAttr = argAttrs.attributes.format;
        const format: "json" | "toon" | null = formatAttr?.value ?? null;

        const declaration = argDeclarations?.find((d) => d.name === argName);
        if (argDeclarations !== null && declaration === undefined) {
          context.pushError(
            argAttrs.attributes.name,
            `Undeclared arg '${argName}'`,
          );
        } else {
          const declaredType = declaration?.typeName ?? null;
          if (format !== null && declaredType === null) {
            context.pushError(
              formatAttr!,
              "format can only be specified for an arg that has a declared type",
            );
          } else if (format === null && declaredType !== null) {
            context.pushError(
              argAttrs.attributes.name,
              `'format' attribute is required for arg '${argName}'`,
            );
          }
        }

        pieces.push({
          kind: "arg",
          name: argName,
          nameSpan: argAttrs.attributes.name,
          format,
        });
      } else if (tag === "enclosed") {
        const encAttrs = checkXmlAttributes(child, {
          tag: {
            schema: zod.string().regex(/^[A-Za-z_][\w.-]*$/),
            expected: "a valid XML tag name",
          },
        });
        if (encAttrs.kind === "error") {
          context.pushErrors(encAttrs.errors);
          continue;
        }
        const encTagName = encAttrs.attributes.tag.value;
        pieces.push({ kind: "synthetic-text", text: `<${encTagName}>` });
        visitChildren(child);
        pieces.push({ kind: "synthetic-text", text: `</${encTagName}>` });
      } else {
        context.pushError(child.tagName, `Unexpected element '<${tag}>'`);
      }
    }
  };

  visitChildren(bodyNode);
  return context.hasNewErrors(snap) ? null : pieces;
}

// ---------------------------------------------------------------------------
// Private – body trim/dedent pipeline
// ---------------------------------------------------------------------------

function processBodyPieces(
  rawPieces: readonly RawBodyPiece[],
  context: SourceFileContext,
): TemplatePiece[] {
  const firstRaw = rawPieces[0];
  const baseIndent =
    firstRaw?.kind === "text" ? computeBaseIndent(firstRaw.text) : "";

  const dedented: DedentedPiece[] = [];
  for (const p of rawPieces) {
    if (p.kind === "text") {
      dedented.push({
        kind: "text",
        text: removeIndentAfterEol(p.text, baseIndent, context),
      });
    } else if (p.kind === "synthetic-text") {
      dedented.push({ kind: "text", text: p.text });
    } else {
      dedented.push(p);
    }
  }

  trimLeadingEmptyLines(dedented);
  trimTrailingEmptyLines(dedented);

  const coalesced = coalesceText(dedented);
  return buildFinalPieces(coalesced);
}

function computeBaseIndent(firstTextNode: TextNodeJoin): string {
  const src = firstTextNode.decoded;
  const firstNl = src.indexOf("\n");
  if (firstNl === -1) return "";
  const firstLine = src.slice(0, firstNl);
  if (/[^ \t]/.test(firstLine)) return "";
  const lines = src.split("\n");
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
  textNode: TextNodeJoin,
  baseIndent: string,
  context: SourceFileContext,
): string {
  const src = textNode.decoded;
  if (src.length === 0 || baseIndent.length === 0) return src;
  let out = "";
  let cursor = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "\n") continue;
    out += src.slice(cursor, i + 1);
    const next = i + 1;
    if (next >= src.length) {
      cursor = next;
      continue;
    }
    if (src[next] === "\n") {
      cursor = next;
      continue;
    }
    // If the rest of the string is only whitespace (e.g. indentation before a
    // child element tag), strip the base indent from it but do not error.
    if (/^[ \t]*$/.test(src.slice(next))) {
      if (src.startsWith(baseIndent, next)) {
        cursor = next + baseIndent.length;
      } else {
        // Less indent than base — but it's trailing whitespace, just pass through.
        cursor = next;
      }
      continue;
    }
    if (src.startsWith(baseIndent, next)) {
      cursor = next + baseIndent.length;
    } else {
      const so = textNodeDecodedOffsetToSourceOffset(textNode, next);
      context.pushError(
        { start: so, end: so },
        `Expected indentation '${baseIndent.replace(/\t/g, "\\t")}' after end-of-line`,
      );
      cursor = next;
    }
  }
  out += src.slice(cursor);
  return out;
}

function trimLeadingEmptyLines(pieces: DedentedPiece[]): void {
  while (pieces.length > 0 && pieces[0]!.kind === "text") {
    const trimmed = trimLeadingEmpty(pieces[0]!.text);
    if (trimmed === pieces[0]!.text) return;
    if (trimmed.length === 0) {
      pieces.shift();
      continue;
    }
    pieces[0] = { kind: "text", text: trimmed };
    return;
  }
}

function trimTrailingEmptyLines(pieces: DedentedPiece[]): void {
  while (pieces.length > 0) {
    const idx = pieces.length - 1;
    const p = pieces[idx]!;
    if (p.kind !== "text") return;
    const trimmed = trimTrailingEmpty(p.text);
    if (trimmed === p.text) return;
    if (trimmed.length === 0) {
      pieces.pop();
      continue;
    }
    pieces[idx] = { kind: "text", text: trimmed };
    return;
  }
}

function trimLeadingEmpty(text: string): string {
  let cur = text;
  while (true) {
    const nl = cur.indexOf("\n");
    if (nl === -1) return /^[ \t]*$/.test(cur) ? "" : cur;
    if (/[^ \t]/.test(cur.slice(0, nl))) return cur;
    cur = cur.slice(nl + 1);
  }
}

function trimTrailingEmpty(text: string): string {
  let cur = text;
  while (true) {
    const nl = cur.lastIndexOf("\n");
    if (nl === -1) return /^[ \t]*$/.test(cur) ? "" : cur;
    if (/[^ \t]/.test(cur.slice(nl + 1))) return cur;
    cur = cur.slice(0, nl);
  }
}

function coalesceText(pieces: readonly DedentedPiece[]): DedentedPiece[] {
  const result: DedentedPiece[] = [];
  for (const p of pieces) {
    if (p.kind === "text") {
      const prev = result.at(-1);
      if (prev?.kind === "text") {
        result[result.length - 1] = { kind: "text", text: prev.text + p.text };
        continue;
      }
    }
    result.push(p);
  }
  return result;
}

function buildFinalPieces(pieces: readonly DedentedPiece[]): TemplatePiece[] {
  return pieces.map((p, i) => {
    if (p.kind === "text") {
      return p;
    } else {
      return {
        kind: "arg",
        name: p.name,
        indent: computeArgIndent(pieces.slice(0, i)),
        format: p.format,
      };
    }
  });
}

function computeArgIndent(preceding: readonly DedentedPiece[]): string {
  for (let i = preceding.length - 1; i >= 0; i--) {
    const p = preceding[i]!;
    if (p.kind !== "text") continue;
    const nl = p.text.lastIndexOf("\n");
    if (nl !== -1) {
      const m = p.text.slice(nl + 1).match(/^([ \t]*)/);
      return m ? m[1]! : "";
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Private – utilities
// ---------------------------------------------------------------------------

function extractTextContent(
  node: ElementNode,
  context: SourceFileContext,
): TextNodeJoin {
  const textNodes: TextNodeJoin[] = [];
  for (const child of node.children) {
    if (child.kind === "text") {
      textNodes.push(child);
    } else {
      context.pushError(
        child.tagName,
        `Unexpected element '<${child.tagName.text}>'`,
      );
    }
  }
  return joinTextNodes(textNodes, node.contentSpan.start);
}

// ---------------------------------------------------------------------------
// Private – SourceFileContext
// ---------------------------------------------------------------------------

class SourceFileContext {
  private readonly _errors: TemplateParseError[] = [];

  constructor(private readonly _sf: SourceFile) {}

  pushError(
    range: { readonly start: number; readonly end: number },
    message: string,
  ): void {
    this._errors.push({
      path: this._sf.path,
      message,
      startPosition: new PositionImpl(this._sf.content, range.start),
      endPosition: new PositionImpl(this._sf.content, range.end),
    });
  }

  pushErrors(
    errors: ReadonlyArray<{
      readonly message: string;
      readonly start: number;
      readonly end: number;
    }>,
  ): void {
    for (const e of errors)
      this.pushError({ start: e.start, end: e.end }, e.message);
  }

  hasErrors(): boolean {
    return this._errors.length > 0;
  }

  snapshot(): number {
    return this._errors.length;
  }

  hasNewErrors(since: number): boolean {
    return this._errors.length > since;
  }

  buildErrors(): TemplateParseErrors {
    return { kind: "error", errors: this._errors };
  }
}

// ---------------------------------------------------------------------------
// Private – PositionImpl
// ---------------------------------------------------------------------------

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
    const lineNumber = linesBefore.length;
    const lineStart = this.offset - linesBefore[linesBefore.length - 1]!.length;
    const lineEndRaw = this._content.indexOf("\n", this.offset);
    const line = this._content.slice(
      lineStart,
      lineEndRaw === -1 ? this._content.length : lineEndRaw,
    );
    const columnNumber = [...linesBefore[linesBefore.length - 1]!].length + 1;
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
