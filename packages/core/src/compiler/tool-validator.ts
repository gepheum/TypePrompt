import { Schema, SchemaValidationContext } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import { ValidationResultBuilder } from "../util/validation-result-builder.js";
import { validateToolDescription } from "./body-validator.js";
import { Tool, ToolValidationResult } from "./compiler-types.js";

export function validateTool(args: {
  readonly tool: Tool;
  readonly namespaceSchema: Schema;
}): ToolValidationResult {
  const { tool, namespaceSchema } = args;

  const validationResult = new ValidationResultBuilder();
  const { errors } = validationResult;

  const validationContext: SchemaValidationContext = {
    kind: "tool",
    namespaceSchema,
  };
  const toolSchema = validateSchema(tool.schema, validationContext);
  if (toolSchema.kind === "error") {
    errors.push(...toolSchema.errors);
    return validationResult.asErrors();
  }

  validationResult.push(
    validateToolDescription({
      description: tool.description,
      toolSchema: toolSchema,
    }),
  );

  if (errors.length <= 0) {
    return {
      kind: "tool",
      tool: tool,
      schema: toolSchema,
      definitionLinks: validationResult.definitionLinks,
    };
  } else {
    return validationResult.asErrors();
  }
}
