import { Schema, SchemaValidationContext } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import { validateToolDescription } from "./body-validator.js";
import { Tool, ToolValidationResult } from "./compiler-types.js";

export function validateTool(args: {
  readonly tool: Tool;
  readonly namespaceSchema: Schema;
}): ToolValidationResult {
  const { tool, namespaceSchema } = args;

  const validationContext: SchemaValidationContext = {
    kind: "tool",
    namespaceSchema,
  };
  const toolSchema = validateSchema(tool.schema, validationContext);
  if (toolSchema.kind === "error") {
    return toolSchema;
  }

  const errors = validateToolDescription({
    description: tool.description,
    toolSchema: toolSchema,
  });
  if (errors.length >= 1) {
    return { kind: "error", errors };
  }

  return {
    kind: "tool",
    tool: tool,
    schema: toolSchema,
  };
}
