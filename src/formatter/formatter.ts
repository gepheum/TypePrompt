import plugin from "@prettier/plugin-xml";

import { format as prettierFormat } from "prettier";
import { parseXmlDocument } from "../xml/xml-parser.js";
import { XmlComment, XmlDocument, XmlNode } from "../xml/xml-types.js";

export async function formatTemplateFile(content: string): Promise<string> {
  const xmlDocument = parseXmlDocument(content) as XmlDocument;
  const slices = collectFormattableSlicesForXmlDocument(xmlDocument);

  content = replaceWithPlaceholders(content, slices);

  content = await prettierFormat(content, {
    parser: "xml",
    plugins: [plugin],
    printWidth: 80,
    tabWidth: 2,
    xmlWhitespaceSensitivity: "ignore",
  });
  content = await formatTypescriptAndYaml(content, slices);
  content = await formatWhitespaceSensitiveXml(content, slices);

  return content;
}

type FormattableSlice = {
  readonly start: number;
  readonly end: number;
  readonly placeholder: string;
  readonly unformatted: string;
  readonly format: "typescript" | "xml" | "yaml";
};

function collectFormattableSlicesForXmlDocument(
  xmlDocument: XmlDocument,
): readonly FormattableSlice[] {
  const slices: FormattableSlice[] = [];
  const { root, topLevelComments } = xmlDocument;
  const items = buildItems([root], topLevelComments);
  const topLevel = true;
  collectFormattableSlices(items, topLevel, slices);
  return slices;
}

function collectFormattableSlices(
  items: readonly Item[],
  topLevel: boolean,
  slices: FormattableSlice[],
): void {
  for (const item of items) {
    if (item.kind !== "element") continue;
    const childItems = buildItems(item.children, item.comments);
    const tagName = item.tag.text;

    const slice = ((): FormattableSlice | null => {
      if (childItems.length <= 0) return null;
      let format: "typescript" | "xml" | "yaml";
      if (
        tagName === "namespace" ||
        tagName === "schema" ||
        (tagName === "meta" && topLevel)
      ) {
        format = "typescript";
      } else if (tagName === "examples" || (tagName === "meta" && !topLevel)) {
        format = "yaml";
      } else if (
        tagName === "system" ||
        tagName === "user" ||
        tagName === "description" ||
        tagName === "then" ||
        tagName === "else" ||
        tagName === "on" ||
        (tagName === "snippet" &&
          !item.attributes["if"] &&
          !item.attributes["switch"])
      ) {
        format = "xml";
      } else {
        return null;
      }
      if (format === "typescript" || format === "yaml") {
        // Do not format TypeScript/YAML code if the content contains XML comments.
        const anyComments = item.comments.length > 0;
        if (anyComments) return null;
      }
      const start = childItems[0]!.start;
      const end = childItems.at(-1)!.end;
      const placeholder = crypto.randomUUID().repeat(4);
      const unformatted = childItems.map((i) => i.xmlSlice).join("");
      return { start, end, placeholder, unformatted, format };
    })();

    if (slice) {
      slices.push(slice);
    } else {
      collectFormattableSlices(childItems, false, slices);
    }
  }
}

function replaceWithPlaceholders(
  input: string,
  slices: readonly FormattableSlice[],
): string {
  const chunks: string[] = [];
  let currentIndex = 0;
  for (const slice of slices) {
    if (slice.start > currentIndex) {
      chunks.push(input.slice(currentIndex, slice.start));
    }
    chunks.push(slice.placeholder);
    currentIndex = slice.end;
  }
  chunks.push(input.slice(currentIndex));
  return chunks.join("");
}

type Item = XmlNode | XmlComment;

function buildItems(
  nodes: readonly XmlNode[],
  comments: readonly XmlComment[],
): readonly Item[] {
  const items: Item[] = [];
  items.push(...nodes);
  items.push(...comments);
  items.sort((a, b) => a.start - b.start);
  return items;
}

async function formatTypescriptAndYaml(
  content: string,
  slices: readonly FormattableSlice[],
): Promise<string> {
  await Promise.all(
    slices
      .filter((r) => r.format === "typescript" || r.format === "yaml")
      .map(async (slice) => {
        const { placeholder, unformatted } = slice;
        const formatted = await prettierFormat(unformatted, {
          parser: slice.format,
          printWidth: 80,
          tabWidth: 2,
        });
        content = replacePlaceholder({
          content,
          placeholder,
          replacement: formatted,
        });
      }),
  );
  return content;
}

async function formatWhitespaceSensitiveXml(
  content: string,
  slices: readonly FormattableSlice[],
): Promise<string> {
  await Promise.all(
    slices
      .filter((r) => r.format === "xml")
      .map(async (slice) => {
        const { placeholder, unformatted } = slice;
        const dedented = dedent(unformatted);
        const wrapped = `<z>${dedented}</z>`;
        let formatted = await prettierFormat(wrapped, {
          parser: "xml",
          plugins: [plugin],
          printWidth: 80,
          tabWidth: 2,
          xmlWhitespaceSensitivity: "strict",
        });
        formatted = formatted.slice(3, -5); // Remove the <z> wrapper
        content = replacePlaceholder({
          content,
          placeholder,
          replacement: formatted,
        });
      }),
  );
  return content;
}

function dedent(text: string): string {
  const baseIndent = computeBaseIndent(text);
  if (baseIndent.length === 0) {
    return text;
  }
  const regex = new RegExp("\n".concat(baseIndent), "g");
  return text.replace(regex, "\n");
}

function computeBaseIndent(text: string): string {
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

function replacePlaceholder(args: {
  content: string;
  placeholder: string;
  replacement: string;
}): string {
  const { placeholder, replacement } = args;
  const indent = getPrecedingWhitespace(args);
  const lines = replacement.split("\n");
  while (lines[0]?.trim() === "") {
    lines.shift();
  }
  if (lines.at(-1)?.trim() === "") {
    lines.pop();
  }
  const indented = lines
    .map((l, i) => (l.trim() === "" ? "" : i <= 0 ? l : indent.concat(l)))
    .join("\n");
  return args.content.replace(placeholder, indented);
}

function getPrecedingWhitespace(args: {
  readonly content: string;
  readonly placeholder: string;
}): string {
  const { content, placeholder } = args;
  const position = content.indexOf(placeholder);
  let count = 0;
  for (let i = position - 1; i >= 0; --i) {
    if (content[i] === " ") {
      count++;
    } else {
      break;
    }
  }
  return " ".repeat(count);
}
