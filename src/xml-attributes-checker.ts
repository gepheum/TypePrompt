import { type ZodType } from "zod";

import type { ElementNode } from "./xml-parser.js";

export type XmlAttributeError = {
  readonly startPosition: number;
  readonly endPosition: number;
  readonly message: string;
};

type AttributeSchemas = Record<string, ZodType<string | undefined>>;

type AttributeValues<T extends AttributeSchemas> = {
  [K in keyof T]: T[K] extends ZodType<infer U> ? U : never;
};

export function checkXmlAttributes<T extends AttributeSchemas>(
  element: ElementNode,
  expectedAttributes: T,
):
  | { readonly kind: "success"; readonly attributes: AttributeValues<T> }
  | { readonly kind: "error"; readonly errors: readonly XmlAttributeError[] } {
  const errors: XmlAttributeError[] = [];
  const values: Record<string, unknown> = {};

  // Check for unexpected attributes.
  for (const [name, attr] of Object.entries(element.attributes)) {
    if (!(name in expectedAttributes)) {
      errors.push({
        startPosition: attr.name.start,
        endPosition: attr.name.end,
        message: `Unexpected attribute '${name}'`,
      });
    }
  }

  // Validate each expected attribute.
  for (const [name, schema] of Object.entries(expectedAttributes)) {
    const attr = element.attributes[name];
    const rawValue = attr?.decodedValue;
    const parsed = schema.safeParse(rawValue);
    if (parsed.success) {
      values[name] = parsed.data;
    } else if (rawValue === undefined) {
      errors.push({
        startPosition: element.tagName.start,
        endPosition: element.tagName.end,
        message: `Missing required attribute '${name}'`,
      });
    } else {
      errors.push({
        startPosition: attr!.name.start,
        endPosition: attr!.name.end,
        message: `Invalid value for attribute '${name}'`,
      });
    }
  }

  if (errors.length > 0) {
    return { kind: "error", errors };
  }
  return { kind: "success", attributes: values as AttributeValues<T> };
}
