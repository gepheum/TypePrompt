import type { ResolvedFieldType, SchemaView } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import type { InternalErrors, TextSpan } from "../util/shared-types.js";
import type { Expression, ExpressionContext } from "./expression-types.js";

export type IfExpressionResult =
  | {
      readonly kind: "success";
      readonly then: ExpressionContext;
      readonly else: ExpressionContext;
    }
  | InternalErrors;

export function resolveIfExpression(
  expression: Expression,
  type: ResolvedFieldType,
  is: TextSpan<"notNull" | "notEmpty" | "true"> | null,
  schema: SchemaView,
): IfExpressionResult {
  const it: ExpressionContext["it"] = { expression, type };

  if (type.kind === "primitive" && type.primitive.text === "boolean") {
    if (is && is.text !== "true") {
      return {
        kind: "error",
        errors: [
          {
            span: is,
            message: "Cannot use 'is' attribute with boolean type",
            hint: "Remove the 'is' attribute",
          },
        ],
      };
    } else {
      return {
        kind: "success",
        then: { it, typeOverrides: {} },
        else: { it, typeOverrides: {} },
      };
    }
  } else if (type.kind === "optional") {
    const thenType = resolveType(type.innerType, schema);
    if (is?.text === "notNull") {
      return {
        kind: "success",
        then: {
          it,
          typeOverrides: {
            [expression.fullPath.text]: thenType,
          },
        },
        else: {
          it,
          typeOverrides: {
            [expression.fullPath.text]: { kind: "null" },
          },
        },
      };
    } else {
      return {
        kind: "error",
        errors: [
          {
            span: is ?? expression.fullPath,
            message: "must use 'is=\"notNull\"' with optional type",
          },
        ],
      };
    }
  } else if (
    type.kind === "array" ||
    (type.kind === "primitive" && type.primitive.text === "string")
  ) {
    if (is?.text === "notEmpty") {
      return {
        kind: "success",
        then: { it, typeOverrides: {} },
        else: { it, typeOverrides: {} },
      };
    } else {
      return {
        kind: "error",
        errors: [
          {
            span: is ?? expression.fullPath,
            message: "must use 'is=\"notEmpty\"' with array or string type",
          },
        ],
      };
    }
  } else {
    switch (is?.text) {
      case "notNull": {
        return {
          kind: "error",
          errors: [
            {
              span: expression.fullPath,
              message: "Expected: optional value",
            },
          ],
        };
      }
      case "notEmpty": {
        return {
          kind: "error",
          errors: [
            {
              span: expression.fullPath,
              message: "Expected: array or string",
            },
          ],
        };
      }
      case "true":
      case undefined: {
        return {
          kind: "error",
          errors: [
            {
              span: expression.fullPath,
              message: "Expected: boolean",
            },
          ],
        };
      }
    }
  }
}
