import type { StrictJsonValue } from "./json-types.js";

/**
 * Unwraps a {@link StrictJsonValue} into a regular JavaScript value which can be
 * passed to {@link JSON.stringify}.
 */
export function unwrapJsonValue(input: StrictJsonValue): unknown {
  switch (input.kind) {
    case "string":
      return input.value;
    case "number":
      return input.value;
    case "boolean":
      return input.value;
    case "null":
      return null;
    case "object": {
      return Object.fromEntries(
        Object.entries(input.entries).map(([key, entry]) => [
          key,
          unwrapJsonValue(entry.value),
        ]),
      );
    }
    case "array":
      return input.elements.map(unwrapJsonValue);
  }
}
