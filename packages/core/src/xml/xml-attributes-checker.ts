import { type ZodType, z } from "zod";

import type {
  InternalError,
  InternalErrors,
  MappedSpan,
  Span,
} from "../util/shared-types.js";
import type { ElementNode } from "./xml-types.js";

export type AttributeSchemaEntry<
  T extends string = string,
  Optional extends boolean = boolean,
> = {
  readonly schema: ZodType<T, string>;
  readonly optional: Optional;
  /** String description. */
  readonly expected: string;
  readonly suggestions?: readonly string[];
};

/** Builds an optional enum attribute entry from a list of allowed values. */
export function oneOf<
  const T extends string,
  const Optional extends boolean,
>(args: {
  values: readonly [T, ...T[]];
  optional: Optional;
}): AttributeSchemaEntry<T, Optional> {
  const { values, optional } = args;
  const expected = `one of: ${values.map((v) => `'${v}'`).join(", ")}`;
  return {
    schema: z.enum(values as [T, ...T[]]),
    optional,
    expected,
    suggestions: values,
  };
}

export type AttributeSchemas = Record<string, AttributeSchemaEntry>;

export type AttributeValue<T> = {
  readonly nameSpan: Span;
  readonly value: MappedSpan<T>;
};

export type AttributeValues<T extends AttributeSchemas> = {
  [K in keyof T]: T[K]["schema"] extends ZodType<infer U, string>
    ? T[K]["optional"] extends false
      ? AttributeValue<U>
      : T[K]["optional"] extends true
        ? AttributeValue<U> | undefined
        : never
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

  // Validate each expected attribute.
  const missingAttrs = Object.keys(expectedAttributes).filter(
    (name) => !element.attributes[name],
  );
  const missingRequiredAttrs = Object.entries(expectedAttributes)
    .filter(([name, entry]) => !entry.optional && !element.attributes[name])
    .map(([name]) => name);
  for (const [name, entry] of Object.entries(expectedAttributes)) {
    const attr = element.attributes[name];
    const rawValue = attr?.value.text;
    const parsed = entry.schema.safeParse(rawValue);
    if (parsed.success) {
      if (attr !== undefined) {
        values[name] = {
          nameSpan: attr.name,
          value: { ...attr.value, text: parsed.data! },
        };
      }
    } else if (rawValue !== undefined) {
      errors.push({
        span: attr!.value,
        message: `Invalid value for attribute '${name}': expected ${entry.expected}`,
        suggestions: entry.suggestions,
      });
    }
  }

  // Check for unexpected attributes.
  const unexpectedAttributes = Object.entries(element.attributes).filter(
    ([name, _]) => !(name in expectedAttributes),
  );
  for (const [name, attr] of unexpectedAttributes) {
    errors.push({
      span: attr.name,
      message: `Unexpected attribute '${name}'`,
      suggestions: missingAttrs,
    });
  }
  if (unexpectedAttributes.length <= 0) {
    // If we have both an unexpected attribute and a missing attribute, it's
    // likely that the unexpected attribute is simply misspelled. No need to
    // report two errors.
    for (const attr of missingRequiredAttrs) {
      errors.push({
        span: element.tag,
        message: `Missing required attribute '${attr satisfies string}'`,
      });
    }
  }

  if (errors.length >= 1) {
    return { kind: "error", errors };
  }
  return { kind: "success", attributes: values as AttributeValues<T> };
}

export function checkNoXmlAttributes(
  element: ElementNode,
): readonly InternalError[] {
  const attrs = checkXmlAttributes(element, {});
  if (attrs.kind === "error") {
    return attrs.errors;
  } else {
    return [];
  }
}
