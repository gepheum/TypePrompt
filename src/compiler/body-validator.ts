import { validateCTag } from "../ctag/ctag-validator.js";
import { resolveExpressionType } from "../expression/expression-type-resolver.js";
import { ExpressionContext } from "../expression/expression-types.js";
import { ResolvedType, Schema, SyntheticType } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import { InternalError } from "../util/shared-types.js";
import { Body, InsertFormat, ToolDescription } from "./compiler-types.js";

export function validateBody<HasValContext extends boolean>(
  body: Body<HasValContext>,
  templateSchema: Schema,
  context: HasValContext extends true ? ExpressionContext : null,
): readonly InternalError[] {
  const errors: InternalError[] = [];
  for (const piece of body) {
    if (piece.kind === "c-tag") {
      errors.push(...validateCTag(piece.cTag, templateSchema));
      continue;
    } else if (piece.kind !== "insert-val") {
      continue;
    }
    const expression = piece.val;
    const type = resolveExpressionType(expression, templateSchema, context);
    if (type.kind === "error") {
      errors.push(...type.errors);
      continue;
    } else if (type.kind === "null") {
      errors.push({
        span: expression.fullPath,
        message: "Always null",
      });
      continue;
    } else if (type.kind === "nullable") {
      errors.push({
        span: expression.fullPath,
        message: "May be null",
      });
      continue;
    }
    if (!piece.format) {
      if (!isStringType(type, templateSchema)) {
        errors.push({
          span: expression.fullPath,
          message: "Not a string type and no format specified",
          hint: "Add a format attribute, for example format='json'",
        });
      }
      continue;
    }
    const insertFormat: InsertFormat = piece.format.text;
    switch (insertFormat) {
      case "text": {
        if (!isStringType(type, templateSchema)) {
          errors.push({
            span: piece.format,
            message: "'text' can only be used with string types",
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
  return errors;
}

export function validateToolDescription(args: {
  description: ToolDescription;
  toolSchema: Schema;
}): readonly InternalError[] {
  return validateBody(args.description, args.toolSchema, null);
}

function isStringType(
  type: ResolvedType | SyntheticType,
  schema: Schema,
): boolean {
  switch (type.kind) {
    case "primitive":
      return type.primitive.text === "string";
    case "string-literal":
      return true;
    case "union":
      return schema.unionToMembers.get(type)!.kind === "strings";
    default:
      return false;
  }
}

function isTabularType(type: ResolvedType, schema: Schema): boolean {
  if (type.kind !== "array") {
    return false;
  }
  const elementType = resolveType(type.elementType, schema);
  if (elementType.kind !== "interface") {
    return false;
  }
  return Object.values(elementType.fields).every((field) => {
    if (field.optional) {
      return false;
    }
    const fieldType = resolveType(field.type, schema);
    return (
      isStringType(fieldType, schema) ||
      (fieldType.kind === "primitive" && fieldType.primitive.text === "integer")
    );
  });
}
