import plugin from "@prettier/plugin-xml";
import { parseSourceFile } from "@typeprompt/core";

import type {
  XmlComment,
  XmlDocument,
  XmlNode,
} from "@typeprompt/core/xml/xml-types.js";
import { format as prettierFormat } from "prettier";
import { reorderXmlDocument } from "./xml-ordering.js";

export async function formatTemplateFile(content: string): Promise<string> {
  const parseResult = parseSourceFile("path", content, { patchBase: null });
  let { xmlDocument } = parseResult;
  if (
    xmlDocument.kind !== "success" ||
    parseResult.parseResult.errors.length >= 1
  ) {
    // If the XML is malformed, we cannot format the file.
    return content;
  }

  xmlDocument = reorderXmlDocument(xmlDocument);
  content = xmlDocument.content;

  const { slices, anyXmlCommentsInCode } =
    collectFormattableSlicesForXmlDocument(xmlDocument);

  if (anyXmlCommentsInCode) {
    // If there are XML comments in TypeScript/YAML code, we cannot format the file.
    return content;
  }

  content = replaceWithPlaceholders(content, slices);

  content = await prettierFormat(content, {
    parser: "xml",
    plugins: [plugin],
    printWidth: 88,
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
  readonly depth: number;
  readonly format: "typescript" | "xml" | "yaml";
};

function collectFormattableSlicesForXmlDocument(xmlDocument: XmlDocument): {
  readonly slices: FormattableSlice[];
  readonly anyXmlCommentsInCode: boolean;
} {
  const { root, topLevelComments } = xmlDocument;
  const items = buildItems([root], topLevelComments);
  const depth = 0;
  const slices: FormattableSlice[] = [];
  const xmlCommentsInCode: true[] = [];
  collectFormattableSlices(items, depth, slices, xmlCommentsInCode);
  const anyXmlCommentsInCode = xmlCommentsInCode.length >= 1;
  return { slices, anyXmlCommentsInCode };
}

function collectFormattableSlices(
  items: readonly Item[],
  depth: number,
  slices: FormattableSlice[],
  xmlCommentsInCode: true[],
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
        (tagName === "meta" && depth <= 0)
      ) {
        format = "typescript";
      } else if (
        tagName === "tools" ||
        tagName === "examples" ||
        (tagName === "meta" && depth !== 0)
      ) {
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
        const anyComments = item.comments.length >= 1;
        if (anyComments) {
          xmlCommentsInCode.push(true);
          return null;
        }
      }
      const start = childItems[0]!.start;
      const end = childItems.at(-1)!.end;
      const placeholder = crypto.randomUUID().repeat(4);
      const unformatted = childItems.map((i) => i.xmlSlice).join("");
      return { start, end, placeholder, unformatted, depth, format };
    })();

    if (slice) {
      slices.push(slice);
    } else {
      collectFormattableSlices(
        childItems,
        depth + 1,
        slices,
        xmlCommentsInCode,
      );
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
  const targetSlices = slices.filter(
    (r) => r.format === "typescript" || r.format === "yaml",
  );
  const formattedList = await Promise.all(
    targetSlices.map(async (slice) => {
      const { placeholder, unformatted } = slice;
      const formatted = await prettierFormat(unformatted, {
        parser: slice.format,
        printWidth: 86 - slice.depth * 2,
        tabWidth: 2,
      });
      return { placeholder, formatted };
    }),
  );
  for (const { placeholder, formatted } of formattedList) {
    content = replacePlaceholder({
      content,
      placeholder,
      replacement: formatted,
    });
  }
  return content;
}

async function formatWhitespaceSensitiveXml(
  content: string,
  slices: readonly FormattableSlice[],
): Promise<string> {
  const targetSlices = slices.filter((r) => r.format === "xml");
  const formattedList = await Promise.all(
    targetSlices.map(async (slice) => {
      const { placeholder, unformatted } = slice;
      const dedented = dedent(unformatted);
      const wrapped = `<z>${dedented}</z>`;
      let formatted = await prettierFormat(wrapped, {
        parser: "xml",
        plugins: [plugin],
        printWidth: 86 - slice.depth * 2,
        tabWidth: 2,
        xmlWhitespaceSensitivity: "strict",
      });
      if (!formatted.startsWith("<z>") || !formatted.endsWith("</z>\n")) {
        throw new Error();
      }
      formatted = formatted.slice(3, -5); // Remove the <z> wrapper
      return { placeholder, formatted };
    }),
  );
  for (const { placeholder, formatted } of formattedList) {
    content = replacePlaceholder({
      content,
      placeholder,
      replacement: formatted,
    });
  }
  return content;
}

function dedent(text: string): string {
  const baseIndent = computeBaseIndent(text);
  if (baseIndent.length <= 0) {
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
