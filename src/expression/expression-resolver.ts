import { ResolvedType, Schema } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import { InternalErrors } from "../util/common-types.js";
import { AttributeValue } from "../xml/xml-attributes-checker.js";
import { Expression } from "./expression-types.js";

export type NullType = { readonly kind: "null" };
export type NullableType = {
  readonly kind: "nullable";
  readonly type: ResolvedType;
};

export type ExpressionContext = {
  readonly it: {
    readonly expression: Expression;
    readonly type: ResolvedType | NullableType;
  };
  readonly typeOverrides: {
    readonly [fullPath: string]: ResolvedType | NullType;
  };
};

export type ResolvedExpressionType<HasValContext extends boolean> =
  | ResolvedType
  | (HasValContext extends true ? NullType : NullableType)
  | InternalErrors;

export function resolveExpressionType<HasValContext extends boolean>(
  expression: Expression<HasValContext>,
  schema: Schema,
  context: HasValContext extends true ? ExpressionContext : null,
): ResolvedExpressionType<HasValContext> {
  return doResolveExpressionType(
    expression,
    schema,
    context,
  ) as ResolvedExpressionType<HasValContext>;
}

function doResolveExpressionType<HasValContext extends boolean>(
  expression: Expression<HasValContext>,
  schema: Schema,
  context: HasValContext extends true ? ExpressionContext : null,
): ResolvedType | NullableType | NullType | InternalErrors {
  if (context) {
    let fullPath = expression.fullPath.text;
    if (fullPath === "it" || fullPath.startsWith("it.")) {
      const { it } = context;
      fullPath = it.expression.fullPath.text.concat(fullPath.slice(2));
    }
    const typeOverride = context.typeOverrides[fullPath];
    if (typeOverride) {
      return typeOverride as ResolvedExpressionType<HasValContext>;
    }
  }
  switch (expression.kind) {
    case "input": {
      const input = schema.typeDeclarations["Input"]!;
      return resolveType<never>(input, schema);
    }
    case "it": {
      return context!.it.type;
    }
    case "property": {
      const left = resolveExpressionType(expression.left, schema, context);
      if (left.kind === "error") {
        return left;
      }
      if (left.kind !== "interface") {
        return {
          kind: "error",
          errors: [
            {
              span: expression.left.fullPath,
              message: "Not an interface type",
            },
          ],
        };
      }
      const field = left.fields[expression.property.text];
      if (!field) {
        return {
          kind: "error",
          errors: [
            {
              span: expression.property,
              message: `Field '${expression.property.text}' not found in interface`,
            },
          ],
        };
      }
      const fieldType = resolveType<never>(field.type, schema);
      return field.optional ? { kind: "nullable", type: fieldType } : fieldType;
    }
  }
}

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
  is: AttributeValue<"notNull" | "notEmpty" | undefined>,
): IfExpressionResult {
  const it: ExpressionContext["it"] = { expression, type };

  if (type.kind === "primitive" && type.primitive === "boolean") {
    if (is) {
      return {
        kind: "error",
        errors: [
          {
            span: is.valueSpan,
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
    if (is?.value === "notNull") {
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
            span: is?.valueSpan ?? expression.fullPath,
            message: `must use 'is="notNull"' with nullable type`,
          },
        ],
      };
    }
  } else if (
    type.kind === "array" ||
    (type.kind === "primitive" && type.primitive === "string")
  ) {
    if (is?.value === "notEmpty") {
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
            span: is?.valueSpan ?? expression.fullPath,
            message: `must use 'is="notEmpty"' with array or string type`,
          },
        ],
      };
    }
  } else {
    switch (is?.value) {
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

export type SwitchExpressionResult =
  | {
      readonly kind: "success";
      readonly cases: { readonly [caseVal: string]: ExpressionContext };
    }
  | InternalErrors;
