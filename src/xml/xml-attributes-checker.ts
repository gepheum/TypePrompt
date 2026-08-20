import { type ZodType, z } from "zod";

import type {
  InternalError,
  InternalErrors,
  MappedSpan,
  Span,
} from "../util/shared-types.js";
import type { ElementNode } from "./xml-types.js";

export type AttributeSchemaEntry = {
  readonly schema: ZodType<string | undefined>;
  readonly expected: string;
};

/** Builds an optional enum attribute entry from a list of allowed values. */
export function oneOf<const T extends string>(
  values: readonly [T, ...T[]],
): {
  readonly schema: ZodType<T | undefined, string | undefined>;
  readonly expected: string;
} {
  return {
    schema: z.enum(values as [T, ...T[]]).optional() satisfies ZodType<
      T | undefined,
      string | undefined
    >,
    expected: `one of: ${values.map((v) => `'${v}'`).join(", ")}`,
  };
}

export type AttributeSchemas = Record<string, AttributeSchemaEntry>;

export type AttributeValue<T> =
  | {
      readonly nameSpan: Span;
      readonly value: MappedSpan<NonNullable<T>>;
    }
  | (undefined extends T ? undefined : never);

export type AttributeValues<T extends AttributeSchemas> = {
  [K in keyof T]: T[K] extends { schema: ZodType<infer U, string | undefined> }
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

  // Validate each expected attribute.
  const missingAttributes: string[] = [];
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
    } else if (rawValue === undefined) {
      missingAttributes.push(name);
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

  // Check for unexpected attributes.
  for (const [name, attr] of Object.entries(element.attributes)) {
    if (!(name in expectedAttributes)) {
      errors.push({
        span: attr.value,
        message: `Unexpected attribute '${name}'`,
        suggestions: missingAttributes,
      });
    }
  }

  if (errors.length > 0) {
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
