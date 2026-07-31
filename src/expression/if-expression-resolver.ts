import { ResolvedType } from "../schema/schema-types.js";
import { InternalErrors, TextSpan } from "../util/shared-types.js";
import {
  Expression,
  ExpressionContext,
  NullableType,
} from "./expression-types.js";

export type IfExpressionResult =
  | {
      readonly kind: "success";
      readonly then: ExpressionContext;
      readonly else: ExpressionContext;
    }
  | InternalErrors;

export function resolveIfExpression(
  expression: Expression,
  type: ResolvedType | NullableType,
  is: TextSpan<"notNull" | "notEmpty"> | null,
): IfExpressionResult {
  const it: ExpressionContext["it"] = { expression, type };

  if (type.kind === "primitive" && type.primitive.text === "boolean") {
    if (is) {
      return {
        kind: "error",
        errors: [
          {
            span: is,
            message: `Cannot use 'is' attribute with boolean type`,
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
  } else if (type.kind === "nullable") {
    if (is?.text === "notNull") {
      return {
        kind: "success",
        then: {
          it,
          typeOverrides: {
            [expression.fullPath.text]: type.type,
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
            message: `must use 'is="notNull"' with nullable type`,
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
            message: `must use 'is="notEmpty"' with array or string type`,
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
              message: "Expected: nullable value",
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
