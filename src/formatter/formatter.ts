import { format as prettierFormat } from "prettier";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type {
  ElementNode,
  TextNode,
  XmlComment,
  XmlNode,
} from "../xml/xml-types.js";

export async function formatTemplateFile(content: string): Promise<string> {
  const parsed = parseXmlDocument(content);
  if (parsed.kind !== "success") return content;

  const items = buildItemList(
    parsed.root.topLevelNodes,
    parsed.root.topLevelComments,
  );

  const parts: string[] = [];
  let prevWasElement = false;

  for (const item of items) {
    if (item.kind === "skip") continue;

    // Blank line after every top-level element (before the next sibling)
    if (prevWasElement) parts.push("");

    if (item.kind === "comment") {
      parts.push(content.slice(item.start, item.end));
      prevWasElement = false;
    } else {
      parts.push(await formatElement(item.node, content, 0));
      prevWasElement = true;
    }
  }

  return parts.join("\n") + "\n";
}

// --- Item list helpers --------------------------------------------------------

type Item =
  | { kind: "element"; pos: number; node: ElementNode }
  | { kind: "comment"; pos: number; start: number; end: number }
  | { kind: "skip"; pos: number };

function buildItemList(
  nodes: readonly XmlNode[],
  comments: readonly XmlComment[],
): readonly Item[] {
  const items: Item[] = [];
  for (const node of nodes) {
    if (node.kind === "text") {
      // Whitespace-only top-level text is just formatting noise; skip it.
    } else {
      items.push({ kind: "element", pos: node.start, node });
    }
  }
  for (const comment of comments) {
    items.push({
      kind: "comment",
      pos: comment.start,
      start: comment.start,
      end: comment.end,
    });
  }
  items.sort((a, b) => a.pos - b.pos);
  return items;
}

function buildChildItemList(el: ElementNode): readonly Item[] {
  const items: Item[] = [];
  for (const child of el.children) {
    if (child.kind === "text") {
      // Skip whitespace-only text between child elements.
    } else {
      items.push({ kind: "element", pos: child.start, node: child });
    }
  }
  for (const comment of el.comments) {
    items.push({
      kind: "comment",
      pos: comment.start,
      start: comment.start,
      end: comment.end,
    });
  }
  items.sort((a, b) => a.pos - b.pos);
  return items;
}

// --- Element dispatch ---------------------------------------------------------

async function formatElement(
  el: ElementNode,
  source: string,
  depth: number,
): Promise<string> {
  const name = el.tag.text;

  // <meta> is a TypeScript type declaration at the top level, YAML values elsewhere.
  if (name === "meta") {
    return formatCodeElement(
      el,
      source,
      depth,
      depth === 0 ? "typescript" : "yaml",
    );
  }
  if (TS_CODE_TAGS.has(name)) {
    return formatCodeElement(el, source, depth, "typescript");
  }
  if (YAML_CODE_TAGS.has(name)) {
    return formatCodeElement(el, source, depth, "yaml");
  }
  if (
    STRUCTURAL_TAGS.has(name) ||
    (name === "snippet" && hasBlockChildren(el))
  ) {
    return formatStructuralElement(el, source, depth);
  }
  if (WS_SENSITIVE_TAGS.has(name)) {
    return formatWsSensitiveElement(el, source, depth);
  }
  // Unknown tag: preserve as-is with corrected leading indent.
  return INDENT.repeat(depth) + el.xmlSlice;
}

function hasBlockChildren(el: ElementNode): boolean {
  return el.children.some(
    (c) => c.kind === "element" && SNIPPET_BLOCK_CHILDREN.has(c.tag.text),
  );
}

// --- Code elements (TypeScript / YAML) ---------------------------------------

async function formatCodeElement(
  el: ElementNode,
  source: string,
  depth: number,
  parser: "typescript" | "yaml",
): Promise<string> {
  const indent = INDENT.repeat(depth);
  const contentIndent = INDENT.repeat(depth + 1);

  // Comments split the code block; can't safely format it.
  if (el.comments.length > 0) {
    return preserveRaw(el, depth);
  }
  // Non-text children are unexpected in code elements; preserve.
  if (el.children.some((c) => c.kind !== "text")) {
    return preserveRaw(el, depth);
  }

  const openTag = rawOpenTag(el, source);
  const closeTag = `</${el.tag.text}>`;
  const raw = el.children.map((c) => (c as TextNode).text).join("");
  const dedented = stripBaseIndent(raw).trim();

  if (!dedented) {
    return `${indent}${openTag}${closeTag}`;
  }

  let formatted: string;
  try {
    formatted = (
      await prettierFormat(dedented, { parser, printWidth: 80, tabWidth: 2 })
    ).trimEnd();
  } catch {
    return preserveRaw(el, depth);
  }

  const body = encodeXml(formatted)
    .split("\n")
    .map((line) => (line ? contentIndent + line : ""))
    .join("\n");

  return `${indent}${openTag}\n${body}\n${indent}${closeTag}`;
}

// --- Structural elements (template, tool, variant, conditional snippet) ------

async function formatStructuralElement(
  el: ElementNode,
  source: string,
  depth: number,
): Promise<string> {
  const indent = INDENT.repeat(depth);
  const childIndent = INDENT.repeat(depth + 1);

  if (el.isSelfClosing) {
    return `${indent}${el.xmlSlice}`;
  }

  const openTag = rawOpenTag(el, source);
  const closeTag = `</${el.tag.text}>`;
  const childItems = buildChildItemList(el);

  const parts: string[] = [];
  let prevWasElement = false;

  for (const item of childItems) {
    if (item.kind === "skip") continue;

    if (prevWasElement) parts.push("");

    if (item.kind === "comment") {
      // Re-indent the first line; internal comment lines keep their relative indent.
      const raw = source.slice(item.start, item.end);
      parts.push(childIndent + raw.trimStart());
      prevWasElement = false;
    } else {
      parts.push(await formatElement(item.node, source, depth + 1));
      prevWasElement = true;
    }
  }

  if (parts.length === 0) {
    return `${indent}${openTag}${closeTag}`;
  }

  return [`${indent}${openTag}`, ...parts, `${indent}${closeTag}`].join("\n");
}

// --- Whitespace-sensitive elements -------------------------------------------

function formatWsSensitiveElement(
  el: ElementNode,
  source: string,
  depth: number,
): string {
  const indent = INDENT.repeat(depth);
  const contentIndent = INDENT.repeat(depth + 1);

  if (el.isSelfClosing) {
    return `${indent}${el.xmlSlice}`;
  }

  const openTag = rawOpenTag(el, source);
  const closeTag = `</${el.tag.text}>`;

  // Content sits between the end of the opening tag and the start of </tagname>.
  const contentEnd = el.end - el.tag.text.length - 3;
  const rawContent = source.slice(el.contentStart, contentEnd);

  if (rawContent.trim() === "") {
    return `${indent}${openTag}${closeTag}`;
  }

  const body = normalizeIndent(rawContent, contentIndent);
  return `${indent}${openTag}\n${body}\n${indent}${closeTag}`;
}

// --- Helpers -----------------------------------------------------------------

/** Returns the raw opening tag slice, e.g. `<template name="Foo">`. */
function rawOpenTag(el: ElementNode, source: string): string {
  return source.slice(el.start, el.contentStart);
}

/** Preserves the element at the given depth without reformatting its content. */
function preserveRaw(el: ElementNode, depth: number): string {
  return INDENT.repeat(depth) + el.xmlSlice;
}

/** Encodes `&`, `<`, and `>` for use in XML text content. */
function encodeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Strips the leading whitespace of the first non-empty line from every line. */
function stripBaseIndent(text: string): string {
  const lines = text.split("\n");
  let baseIndent = "";
  for (const line of lines) {
    if (line.trim() !== "") {
      baseIndent = line.match(/^([ \t]*)/)![1]!;
      break;
    }
  }
  if (!baseIndent) return text;
  return lines
    .map((line) =>
      line.startsWith(baseIndent) ? line.slice(baseIndent.length) : line,
    )
    .join("\n");
}

/**
 * Strips the leading whitespace shared by all content lines and re-indents with
 * `newIndent`. All leading blank lines are removed; at most one trailing blank
 * line is removed.
 */
function normalizeIndent(content: string, newIndent: string): string {
  const lines = content.split("\n");

  // Remove all leading blank lines.
  let lo = 0;
  while (lo < lines.length && lines[lo]!.trim() === "") lo++;

  // Remove at most one trailing blank line.
  let hi = lines.length - 1;
  if (hi >= lo && lines[hi]!.trim() === "") hi--;

  const trimmed = lines.slice(lo, hi + 1);
  if (trimmed.length === 0) return "";

  // Base indent = indentation of the first non-empty line.
  let baseIndent = "";
  for (const line of trimmed) {
    if (line.trim() !== "") {
      baseIndent = line.match(/^([ \t]*)/)![1]!;
      break;
    }
  }

  return trimmed
    .map((line) =>
      line.trim() === "" ? "" : newIndent + line.slice(baseIndent.length),
    )
    .join("\n");
}

const INDENT = "  ";

// Elements whose entire text content is TypeScript
const TS_CODE_TAGS: ReadonlySet<string> = new Set(["schema", "namespace"]);

// Elements whose entire text content is YAML
const YAML_CODE_TAGS: ReadonlySet<string> = new Set(["examples", "tools"]);

// Outer elements that contain child elements
const STRUCTURAL_TAGS: ReadonlySet<string> = new Set([
  "template",
  "tool",
  "variant",
]);

// Elements with whitespace-sensitive mixed text + inline XML content, plus
// <examples> whose nested-sequence style conflicts with prettier's formatting
const WS_SENSITIVE_TAGS: ReadonlySet<string> = new Set([
  "description",
  "else",
  "examples",
  "on",
  "snippet",
  "system",
  "user",
  "then",
]);

// Block-level child tags that make a <snippet> structural rather than inline
const SNIPPET_BLOCK_CHILDREN: ReadonlySet<string> = new Set([
  "else",
  "on",
  "then",
]);
