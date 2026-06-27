import type { Schema } from "../schema/schema-types.js";
import type { Example, ExampleValidationError } from "./example-types.js";

export function validateExample(
  example: Example,
  schema: Schema,
): readonly ExampleValidationError[] {
}
