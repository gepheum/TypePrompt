import type { ErrorSink } from "../util/shared-types.js";
import type {
  AttributeSchemaEntry,
  AttributesResult,
} from "./xml-attributes-checker.js";
import { checkXmlAttributes } from "./xml-attributes-checker.js";
import { checkAllAreElements, checkTag } from "./xml-node-checker.js";
import type { ElementNode, XmlNode } from "./xml-types.js";

/** XML element tags appearing in the TypePrompt language reference. */
export type KnownTag =
  | "c"
  | "description"
  | "else"
  | "enclosed"
  | "examples"
  | "meta"
  | "model"
  | "namespace"
  | "insert"
  | "on"
  | "playground"
  | "samples"
  | "schema"
  | "snippet"
  | "system"
  | "template"
  | "then"
  | "tool"
  | "tools"
  | "user"
  | "variant";

/** XML attribute names appearing in the TypePrompt language reference. */
export type KnownAttribute =
  | "case"
  | "for"
  | "format"
  | "if"
  | "is"
  | "switch"
  | "name"
  | "namespace"
  | "snippet"
  | "tag"
  | "val";

/**
 * Validates that all XML nodes in a list are elements with known TypePrompt tags.
 */
export function checkAllAreKnownElements<Tags extends readonly KnownTag[]>(
  nodes: readonly XmlNode[],
  tags: Tags,
  messageSuffix: string,
  errors: ErrorSink,
): ReadonlyArray<[Tags[number], ElementNode]> {
  return checkAllAreElements(nodes, tags, messageSuffix, errors);
}

/**
 * Validates that an element's attributes match an expected schema of known attributes.
 */
export function checkKnownXmlAttributes<
  T extends Record<string, AttributeSchemaEntry>,
>(
  element: ElementNode,
  expectedAttributes: T,
): AttributesResult<T, KnownAttribute> {
  return checkXmlAttributes(element, expectedAttributes);
}

/**
 * Validates that an element's tag matches one of the allowed known TypePrompt tags.
 */
export function checkKnownTag<Tags extends readonly KnownTag[]>(
  node: ElementNode,
  tags: Tags,
  messageSuffix: string,
  errors: ErrorSink,
): Tags[number] | null {
  return checkTag(node, tags, messageSuffix, errors);
}
