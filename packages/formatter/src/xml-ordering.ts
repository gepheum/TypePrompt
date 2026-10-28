import type { Attribute } from "@typeprompt/core";
import {
  parseXmlDocument,
  type ElementNode,
  type XmlDocument,
} from "@typeprompt/core";
import type {
  KnownAttribute,
  KnownTag,
} from "@typeprompt/core/xml/xml-entities.js";

/**
 * Reorders XML child elements and attributes to match the preferred TypePrompt order.
 */
export function reorderXmlDocument(xmlDocument: XmlDocument): XmlDocument {
  let { content } = xmlDocument;
  let changed = false;

  const reorderAttributes = (node: ElementNode): void => {
    const attributes = [...Object.values(node.attributes)];
    if (attributes.length <= 1) return;
    attributes.sort((a, b) => a.name.start - b.name.start);
    const alreadyOrdered = isOrdered(attributes, getAttributeZIndex);
    if (alreadyOrdered) return;
    const fragments: Array<{
      readonly contentSlice: string;
      readonly zIndex: number;
    }> = attributes.map((a, index) => {
      const previous = attributes[index - 1];
      const start =
        previous !== undefined ? previous.value.end + 1 : node.tag.end;
      const end = a.value.end + 1;
      const contentSlice = content.slice(start, end);
      const zIndex = getAttributeZIndex(a);
      return { contentSlice, zIndex };
    });
    const insertionRange = {
      start: node.tag.end,
      end: attributes.at(-1)!.value.end + 1,
    } as const;
    fragments.sort((a, b) => a.zIndex - b.zIndex);
    content = [
      content.slice(0, insertionRange.start),
      ...fragments.map((f) => f.contentSlice),
      content.slice(insertionRange.end),
    ].join("");
    changed = true;
  };

  const reorder = (node: ElementNode): void => {
    reorderAttributes(node);
    const children = node.children.filter(
      (c): c is ElementNode => c.kind === "element",
    );
    if (children.length <= 0) return;
    children.forEach(reorder);
    const alreadyOrdered = isOrdered(children, getTagZIndex);
    if (mustReorderChildren(node.tag.text as KnownTag) && !alreadyOrdered) {
      const fragments: Array<{
        readonly contentSlice: string;
        readonly zIndex: number;
      }> = children.map((child, index) => {
        const previous = children[index - 1];
        const start = previous?.end ?? node.contentStart;
        const { end } = child;
        const contentSlice = content.slice(start, end);
        const zIndex = getTagZIndex(child);
        return { contentSlice, zIndex };
      });
      const insertionRange = {
        start: node.contentStart,
        end: children.at(-1)!.end,
      } as const;
      fragments.sort((a, b) => a.zIndex - b.zIndex);
      content = [
        content.slice(0, insertionRange.start),
        ...fragments.map((f) => f.contentSlice),
        content.slice(insertionRange.end),
      ].join("");
      changed = true;
    }
  };

  reorder(xmlDocument.root);

  if (changed) {
    if (content.length !== xmlDocument.content.length) {
      throw new Error("Content length changed");
    }
    const { path } = xmlDocument.root.tag;
    const parseResult = parseXmlDocument(content, path);
    if (parseResult.kind === "error") {
      throw new Error(JSON.stringify(parseResult, null, 2));
    }
    return parseResult;
  } else {
    return xmlDocument;
  }
}

function mustReorderChildren(tagName: KnownTag): boolean {
  switch (tagName) {
    case "tool":
    case "template":
    case "snippet":
    case "variant":
      return true;
    case "c":
    case "description":
    case "enclosed":
    case "else":
    case "examples":
    case "insert":
    case "meta":
    case "namespace":
    case "on":
    case "playground":
    case "samples":
    case "schema":
    case "system":
    case "then":
    case "tools":
    case "user":
      return false;
    default: {
      const _: never = tagName;
      return false;
    }
  }
}

const ORDERED_TAG_NAMES: readonly KnownTag[] = [
  "meta",
  "description",
  "schema",
  "tools",
  "system",
  "user",
  "examples",
  "snippet",
  "variant",
];

const TAG_NAME_TO_Z_INDEX: { readonly [tagName: string]: number } =
  Object.fromEntries(
    ORDERED_TAG_NAMES.map((tagName, zIndex) => [tagName, zIndex]),
  );

function getTagZIndex(e: ElementNode): number {
  return TAG_NAME_TO_Z_INDEX[e.tag.text] ?? -1;
}

function getAttributeZIndex(attribute: Attribute): number {
  const a = attribute.name.text as KnownAttribute;
  switch (a) {
    case "name":
    case "for":
      return 0;
    case "case":
    case "if":
    case "namespace":
    case "output-format":
    case "snippet":
    case "switch":
    case "tag":
    case "val":
      return 1;
    case "is":
    case "format":
      return 2;
    default: {
      const _: never = a;
      return 1;
    }
  }
}

function isOrdered<E>(a: readonly E[], getZIndex: (e: E) => number): boolean {
  return a.every((e, i) => i <= 0 || getZIndex(a[i - 1]!) <= getZIndex(e));
}
