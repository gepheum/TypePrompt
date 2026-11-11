import { tokenizeYaml } from "../json/yaml-parser.js";
import { tokenizeSchema } from "../schema/schema-parser.js";
import type { Span } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode, XmlComment } from "../xml/xml-types.js";
import { getElementContentFormat } from "./element-content-format.js";

export type SemanticToken = {
  readonly span: Span;
  readonly kind:
    | "comment"
    | "xml-tag"
    | "xml-attribute"
    | "schema-keyword" // "type" or "interface"
    | "schema-directive" // @decorator
    | "string" // string literal
    | "boolean" // boolean literal
    | "number"; // number literal
};

export function tokenize(xmlContent: string): readonly SemanticToken[] {
  const xmlDocument = parseXmlDocument(xmlContent, "path");
  if (!xmlDocument.root) {
    return [];
  }
  const tokens: SemanticToken[] = [];
  const pushXmlComments = (comments: readonly XmlComment[]): void => {
    tokens.push(
      ...comments.map((c): SemanticToken => ({
        span: c,
        kind: "comment",
      })),
    );
  };
  const collectTokens = (element: ElementNode, depth: number): void => {
    const { tag, closingTag } = element;
    pushXmlComments(element.comments);
    tokens.push({ span: tag, kind: "xml-tag" });
    if (closingTag && closingTag.start + 2 < closingTag.end - 1) {
      tokens.push({
        span: {
          ...closingTag,
          start: closingTag.start + 2,
          end: closingTag.end - 1,
        },
        kind: "xml-tag",
      });
    }
    for (const value of Object.values(element.attributes)) {
      tokens.push({ span: value.value, kind: "string" });
    }
    for (const child of element.children) {
      if (child.kind === "element") {
        collectTokens(child, depth + 1);
      } else {
        const format = getElementContentFormat(element, depth);
        if (format === "schema") {
          tokens.push(...tokenizeSchema(child));
        } else if (format === "yaml") {
          tokens.push(...tokenizeYaml(child));
        }
      }
    }
  };
  pushXmlComments(xmlDocument.topLevelComments);
  collectTokens(xmlDocument.root, 0);
  tokens.sort((a, b) => a.span.start - b.span.start);
  return tokens;
}
