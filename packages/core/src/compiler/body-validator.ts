import { validateCTag } from "../ctag/ctag-validator.js";
import { resolveExpressionType } from "../expression/expression-type-resolver.js";
import type { ExpressionContext } from "../expression/expression-types.js";
import type {
  ResolvedFieldType,
  Schema,
  SyntheticType,
} from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import type { Span, ValidationResult } from "../util/shared-types.js";
import { ValidationResultBuilder } from "../util/validation-result-builder.js";
import type {
  Body,
  InsertFormat,
  TemplateTool,
  ToolDescription,
} from "./compiler-types.js";

export function validateTemplateBody<HasValContext extends boolean>(
  body: Body<HasValContext>,
  templateSchema: Schema,
  tools: { readonly [name: string]: TemplateTool },
  context: HasValContext extends true ? ExpressionContext : null,
): ValidationResult {
  const toolNames: { readonly [name: string]: Span } = Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [name, tool.tool.tool.name]),
  );
  const schemasForBodyValidation = [
    templateSchema,
    ...Object.values(tools)
      .map((tool) => tool.tool)
      .filter((tool) => tool.kind === "tool")
      .map((tool) => tool.schema),
  ];
  return validateBodyImpl(
    body,
    templateSchema,
    schemasForBodyValidation,
    toolNames,
    context,
  );
}

export function validateToolDescription(args: {
  description: ToolDescription;
  toolSchema: Schema;
}): ValidationResult {
  const toolNames: { readonly [name: string]: Span } = {};
  return validateBodyImpl(
    args.description,
    args.toolSchema,
    [args.toolSchema],
    toolNames,
    null,
  );
}

function validateBodyImpl<HasValContext extends boolean>(
  body: Body<HasValContext>,
  templateSchema: Schema,
  schemasForBodyValidation: readonly Schema[],
  toolNames: { readonly [name: string]: Span },
  context: HasValContext extends true ? ExpressionContext : null,
): ValidationResult {
  const validationResult = new ValidationResultBuilder();
  const { definitionLinks, errors } = validationResult;
  for (const piece of body) {
    if (piece.kind === "c-tag") {
      validationResult.push(
        validateCTag(piece.cTag, schemasForBodyValidation, toolNames),
      );
      continue;
    } else if (piece.kind !== "insert-val") {
      continue;
    }
    const expression = piece.val;
    const result = resolveExpressionType(expression, templateSchema, context);
    definitionLinks.push(...result.definitionLinks);
    if (result.kind === "error") {
      errors.push(...result.errors);
      continue;
    }
    const { type } = result;
    if (type.kind === "null") {
      errors.push({
        span: expression.fullPath,
        message: "Always null",
      });
      continue;
    } else if (type.kind === "optional") {
      errors.push({
        span: expression.fullPath,
        message: "May be null",
      });
      continue;
    }
    if (!piece.format) {
      if (!isStringOrIntegerType(type, templateSchema)) {
        errors.push({
          span: expression.fullPath,
          message: "Must specify format when type is not string or integer",
          hint: "Add a format attribute, for example format='json'",
        });
      }
      continue;
    }
    const insertFormat: InsertFormat = piece.format.text;
    switch (insertFormat) {
      case "text": {
        if (!isStringOrIntegerType(type, templateSchema)) {
          errors.push({
            span: piece.format,
            message: "'text' can only be used with string and integer types",
          });
        }
        break;
      }
      case "csv":
      case "tsv": {
        if (!isTabularType(type, templateSchema)) {
          errors.push({
            span: piece.format,
            message: `'${insertFormat}' can only be used with tabular types`,
            rule: "A tabular type is an array of objects with only string or integer fields",
          });
        }
        break;
      }
      case "json":
      case "yaml":
      case "toon": {
        break;
      }
      default: {
        const _: never = insertFormat;
        throw _;
      }
    }
  }
  return validationResult;
}

function isStringOrIntegerType(
  type: ResolvedFieldType | SyntheticType,
  schema: Schema,
): boolean {
  switch (type.kind) {
    case "primitive":
      return (
        type.primitive.text === "string" || type.primitive.text === "integer"
      );
    case "string-literal":
      return true;
    case "union":
      return schema.unionToMembers.get(type)!.kind === "strings";
    default:
      return false;
  }
}

function isTabularType(type: ResolvedFieldType, schema: Schema): boolean {
  if (type.kind !== "array") {
    return false;
  }
  const elementType = resolveType(type.elementType, schema);
  if (elementType.kind !== "interface") {
    return false;
  }
  return Object.values(elementType.fields).every((field) => {
    if (field.omitDefault !== null) return false;
    const fieldType = resolveType(field.type, schema);
    return isStringOrIntegerType(fieldType, schema);
  });
}
