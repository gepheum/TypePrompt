import { type ZodType } from "zod";

import type {
  InternalError,
  InternalErrors,
  MappedSpan,
  Span,
} from "../util/common-types.js";
import type { ElementNode } from "./xml-types.js";

export type AttributeSchemaEntry = {
  readonly schema: ZodType<string | undefined>;
  readonly expected: string;
};

export type AttributeSchemas = Record<string, AttributeSchemaEntry>;

export type AttributeValue<T> = undefined extends T
  ? | {
        readonly nameSpan: Span;
        readonly valueSpan: MappedSpan;
        readonly value: NonNullable<T>;
      }
    | undefined
  : {
      readonly nameSpan: Span;
      readonly valueSpan: MappedSpan;
      readonly value: T;
    };

export type AttributeValues<T extends AttributeSchemas> = {
  [K in keyof T]: T[K] extends { schema: ZodType<infer U> }
    ? AttributeValue<U>
    : never;
};

export function checkXmlAttributes<T extends AttributeSchemas>(
  element: ElementNode,
  expectedAttributes: T,
):
  | { readonly kind: "success"; readonly attributes: AttributeValues<T> }
  | InternalErrors {
  const errors: InternalError[] = [];
  const values: Record<string, AttributeValue<unknown>> = {};

  // Check for unexpected attributes.
  for (const [name, attr] of Object.entries(element.attributes)) {
    if (!(name in expectedAttributes)) {
      errors.push({
        span: attr.value,
        message: `Unexpected attribute '${name}'`,
      });
    }
  }

  // Validate each expected attribute.
  for (const [name, entry] of Object.entries(expectedAttributes)) {
    const attr = element.attributes[name];
    const rawValue = attr?.value.text;
    const parsed = entry.schema.safeParse(rawValue);
    if (parsed.success) {
      if (attr !== undefined) {
        values[name] = {
          nameSpan: attr.name,
          valueSpan: attr.value,
          value: parsed.data!,
        } satisfies AttributeValue<string>;
      }
    } else if (rawValue === undefined) {
      errors.push({
        span: element.tag,
        message: `Missing required attribute '${name}'`,
      });
    } else {
      errors.push({
        span: attr!.value,
        message: `Invalid value for attribute '${name}': expected ${entry.expected}`,
      });
    }
  }

  if (errors.length > 0) {
    return { kind: "error", errors };
  }
  return { kind: "success", attributes: values as AttributeValues<T> };
}
