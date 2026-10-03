import { tokenizeYaml } from "../json/yaml-parser.js";
import { tokenizeSchema } from "../schema/schema-parser.js";
import { Span } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import { ElementNode, XmlComment } from "../xml/xml-types.js";

export type SemanticToken = {
  readonly span: Span;
  readonly kind:
    | "comment"
    | "xml-tag"
    | "xml-attribute"
    | "schema-keyword" // "type" or "interface"
    | "string" // string literal
    | "boolean" // boolean literal
    | "number"; // number literal
};

export function tokenize(xmlContent: string): readonly SemanticToken[] {
  const xmlDocument = parseXmlDocument(xmlContent);
  if (xmlDocument.kind !== "success") {
    // If the XML is malformed, we cannot format the file.
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
  const collectTokens = (
    element: ElementNode,
    parentTag: string | null,
  ): void => {
    const { tag, closingTag } = element;
    pushXmlComments(element.comments);
    tokens.push({ span: tag, kind: "xml-tag" });
    if (closingTag) {
      tokens.push({ span: closingTag, kind: "xml-tag" });
    }
    for (const value of Object.values(element.attributes)) {
      tokens.push({ span: value.value, kind: "string" });
    }
    for (const child of element.children) {
      if (child.kind === "element") {
        collectTokens(child, tag.text);
      } else {
        let contentType: "schema" | "yaml" | undefined;
        switch (tag.text) {
          case "namespace":
          case "schema":
            contentType = "schema";
            break;
          case "meta": {
            contentType = parentTag === "template" ? "yaml" : "schema";
            break;
          }
          case "tools":
          case "examples": {
            contentType = "yaml";
            break;
          }
        }
        if (contentType === "schema") {
          tokens.push(...tokenizeSchema(child));
        } else if (contentType === "yaml") {
          tokens.push(...tokenizeYaml(child));
        }
      }
    }
  };
  pushXmlComments(xmlDocument.topLevelComments);
  collectTokens(xmlDocument.root, null);
  tokens.sort((a, b) => a.span.start - b.span.start);
  return tokens;
}
