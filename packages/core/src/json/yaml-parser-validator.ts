import type { SchemaType } from "../schema/schema-types.js";
import type { InternalErrors, MappedText } from "../util/shared-types.js";
import type { StrictJsonValue } from "./json-types.js";
import { validateJson } from "./json-validator.js";
import { parseYaml } from "./yaml-parser.js";

export function parseAndValidateYaml(
  content: string,
  path: string,
  schemaType: SchemaType,
): StrictJsonValue | InternalErrors {
  const mappedText: MappedText = {
    path,
    text: content,
    offsetMap: [
      { textPosition: 0, sourcePosition: 0 },
      { textPosition: content.length, sourcePosition: content.length },
    ],
  };
  const parseResult = parseYaml(mappedText);
  if (parseResult.kind === "error") {
    return parseResult;
  }
  const validationResult = validateJson(
    parseResult,
    schemaType.type,
    schemaType.schema,
  );
  if (validationResult.errors.length) {
    return {
      kind: "error",
      errors: validationResult.errors,
    };
  }
  return parseResult;
}
