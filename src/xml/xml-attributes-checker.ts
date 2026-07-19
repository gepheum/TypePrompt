import { type ZodType } from "zod";

import type {
  InternalError,
  InternalErrors,
  SourceSpan,
} from "../util/common-types.js";
import type { ElementNode } from "./xml-types.js";

type AttributeSchemaEntry = {
  readonly schema: ZodType<string | undefined>;
  readonly expected: string;
};

type AttributeSchemas = Record<string, AttributeSchemaEntry>;

type AttributeValues<T extends AttributeSchemas> = {
  [K in keyof T]: T[K] extends { schema: ZodType<infer U> }
    ? undefined extends U
      ? { span: SourceSpan; value: NonNullable<U> } | undefined
      : { span: SourceSpan; value: U }
    : never;
};

export function checkXmlAttributes<T extends AttributeSchemas>(
  element: ElementNode,
  expectedAttributes: T,
):
  | { readonly kind: "success"; readonly attributes: AttributeValues<T> }
  | InternalErrors {
  const errors: InternalError[] = [];
  const values: Record<string, unknown> = {};

  // Check for unexpected attributes.
  for (const [name, attr] of Object.entries(element.attributes)) {
    if (!(name in expectedAttributes)) {
      errors.push({
        start: attr.value.start,
        end: attr.value.end,
        message: `Unexpected attribute '${name}'`,
      });
    }
  }

  // Validate each expected attribute.
  for (const [name, entry] of Object.entries(expectedAttributes)) {
    const attr = element.attributes[name];
    const rawValue = attr?.decodedValue;
    const parsed = entry.schema.safeParse(rawValue);
    if (parsed.success) {
      if (attr !== undefined) {
        values[name] = {
          span: attr.value,
          value: parsed.data,
        };
      }
    } else if (rawValue === undefined) {
      errors.push({
        start: element.tagName.start,
        end: element.tagName.end,
        message: `Missing required attribute '${name}'`,
      });
    } else {
      errors.push({
        start: attr!.value.start,
        end: attr!.value.end,
        message: `Invalid value for attribute '${name}': expected ${entry.expected}`,
      });
    }
  }

  if (errors.length > 0) {
    return { kind: "error", errors };
  }
  return { kind: "success", attributes: values as AttributeValues<T> };
}
