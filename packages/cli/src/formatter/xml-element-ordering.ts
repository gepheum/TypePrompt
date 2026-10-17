import {
  parseXmlDocument,
  type ElementNode,
  type XmlDocument,
} from "@typeprompt/core";

export function reorderXmlElements(xmlDocument: XmlDocument): XmlDocument {
  const getTagIndex = (e: ElementNode): number =>
    TAG_NAME_TO_INDEX[e.tag.text] ?? -1;

  let { content } = xmlDocument;
  let changed = false;

  const doReorder = (node: ElementNode): void => {
    if (!mustReorderChildren(node.tag.text)) return;
    const { children } = node;
    if (children.length <= 0) return;
    if (!children.every((c): c is ElementNode => c.kind === "element")) {
      return;
    }
    children.forEach(doReorder);
    if (
      children.every(
        (c, i) => i <= 0 || getTagIndex(children[i - 1]!) <= getTagIndex(c),
      )
    ) {
      return;
    }
    const fragments: Array<{
      readonly contentSlice: string;
      readonly tagIndex: number;
    }> = children.map((child, index) => {
      const start = children[index - 1]?.end ?? node.contentStart;
      const end = child.end;
      const contentSlice = content.slice(start, end);
      const tagIndex = getTagIndex(child);
      return { contentSlice, tagIndex };
    });
    const insertionRange = {
      start: node.contentStart,
      end: children[-1]!.end,
    } as const;
    fragments.sort((a, b) => a.tagIndex - b.tagIndex);
    content = [
      content.slice(0, insertionRange.start),
      ...fragments.map((f) => f.contentSlice),
      content.slice(insertionRange.end),
    ].join("");
    changed = true;
  };

  doReorder(xmlDocument.root);

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

type TagName =
  | "c"
  | "description"
  | "else"
  | "enclosed"
  | "examples"
  | "meta"
  | "namespace"
  | "insert"
  | "on"
  | "schema"
  | "snippet"
  | "system"
  | "template"
  | "then"
  | "tool"
  | "tools"
  | "user"
  | "variant";

function mustReorderChildren(tagName: string): boolean {
  const tag = tagName as TagName;
  switch (tag) {
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
    case "schema":
    case "system":
    case "then":
    case "tools":
    case "user":
      return false;
    default: {
      const _: never = tag;
      return false;
    }
  }
}

const ORDERED_TAG_NAMES: readonly TagName[] = [
  "meta",
  "schema",
  "description",
  "system",
  "user",
  "examples",
  "snippet",
  "variant",
];

const TAG_NAME_TO_INDEX: { readonly [tagName: string]: number } =
  Object.fromEntries(
    ORDERED_TAG_NAMES.map((tagName, index) => [tagName, index]),
  );
