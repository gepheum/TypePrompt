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
  readonly regex?: RegExp;
  /** String description. */
  readonly expected: string;
  readonly optional: Optional;
  readonly suggestions?: readonly string[];
};

/** Builds an optional enum attribute entry from a list of allowed values. */
export function expectOneOf<
  const T extends string,
  const Optional extends boolean,
>(args: {
  readonly values: readonly [T, ...T[]];
  readonly optional: Optional;
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

export function expectIdentifier<const Optional extends boolean>(args: {
  readonly format: "camelCase" | "PascalCase";
  readonly optional: Optional;
}): AttributeSchemaEntry<string, Optional> {
  const { format, optional } = args;
  const expected = `a ${format} identifier`;
  const regex = ((): RegExp => {
    switch (format) {
      case "camelCase":
        return /^[a-z][A-Za-z0-9]*$/;
      case "PascalCase":
        return /^[A-Z][A-Za-z0-9]*$/;
    }
  })();
  return {
    schema: z.string(),
    optional,
    regex,
    expected,
  };
}

export function expectString<const Optional extends boolean>(args: {
  readonly expected: string;
  readonly optional: Optional;
}): AttributeSchemaEntry<string, Optional> {
  const { expected, optional } = args;
  return {
    schema: z.string(),
    optional,
    expected,
  };
}

export type AttributesResult<T extends Record<string, AttributeSchemaEntry>> =
  | {
      kind: "success";
      attributes: Attributes<T>;
      errors: readonly [];
    }
  | {
      kind: "partial";
      attributes: Attributes<T>;
      errors: readonly InternalError[];
    }
  | InternalErrors;

export type Attributes<T extends Record<string, AttributeSchemaEntry>> = {
  readonly [K in keyof T]: T[K]["schema"] extends ZodType<infer U, string>
    ? T[K]["optional"] extends false
      ? AttributeValue<U>
      : T[K]["optional"] extends true
        ? AttributeValue<U> | undefined
        : never
    : never;
};

export type AttributeValue<T> = {
  readonly nameSpan: Span;
  readonly value: MappedSpan<T>;
};

export function checkXmlAttributes<
  T extends Record<string, AttributeSchemaEntry>,
>(element: ElementNode, expectedAttributes: T): AttributesResult<T> {
  const errors: InternalError[] = [];
  let anySchemaErrors = false;
  const values: Record<string, AttributeValue<unknown>> = {};

  // Includes both optional and required attributes.
  const missingAttrs = Object.keys(expectedAttributes).filter(
    (name) => !element.attributes[name],
  );
  const missingRequiredAttrs = Object.entries(expectedAttributes)
    .filter(([name, entry]) => !entry.optional && !element.attributes[name])
    .map(([name]) => name);

  // Validate each expected attribute.
  for (const [name, entry] of Object.entries(expectedAttributes)) {
    const attr = element.attributes[name];
    const rawValue = attr?.value.text;
    const parsed = entry.schema.safeParse(rawValue);

    const pushValueError = (): void => {
      errors.push({
        span: attr!.value,
        message: `Invalid value for attribute '${name}': expected ${entry.expected}`,
        suggestions: entry.suggestions,
      });
    };

    if (parsed.success) {
      if (attr !== undefined) {
        values[name] = {
          nameSpan: attr.name,
          value: { ...attr.value, text: parsed.data! },
        };
        if (entry.regex && !entry.regex.test(parsed.data)) {
          // The value is invalid but it satisfies the schema, we can still return a
          // partial result.
          pushValueError();
        }
      }
    } else {
      // The value is present but doesn't satisfy the schema. We can no longer return
      // a success or partial result.
      anySchemaErrors = true;
      if (rawValue !== undefined) {
        pushValueError();
      }
      // Else a better error will be pushed below
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

  if (errors.length <= 0) {
    return { kind: "success", attributes: values as Attributes<T>, errors: [] };
  } else {
    if (anySchemaErrors) {
      return { kind: "error", errors };
    } else {
      return { kind: "partial", attributes: values as Attributes<T>, errors };
    }
  }
}

export function checkNoXmlAttributes(
  element: ElementNode,
): readonly InternalError[] {
  return checkXmlAttributes(element, {}).errors;
}
