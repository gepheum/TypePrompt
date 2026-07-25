import { ResolvedType, Schema } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import { InternalErrors } from "../util/common-types.js";
import { Expression } from "./compiler-types.js";

export type NullType = { readonly kind: "null" };

export type NullableType = ResolvedType | NullType;

export type ExpressionContext = {
  readonly it: {
    readonly expression: Expression;
    readonly type: ResolvedType;
  } | null;
  readonly typeOverrides: { readonly [fullPath: string]: NullableType };
};

export function resolveExpressionType(
  expression: Expression,
  schema: Schema,
  context: ExpressionContext,
): ResolvedType | NullType | InternalErrors {
  {
    let fullPath = expression.fullPath.text;
    if (fullPath === "it" || fullPath.startsWith("it.")) {
      const it = context.it!;
      fullPath = it.expression.fullPath.text.concat(fullPath.slice(2));
    }
    const typeOverride = context.typeOverrides[fullPath];
    if (typeOverride) {
      return typeOverride;
    }
  }
  switch (expression.kind) {
    case "input": {
      const input = schema.typeDeclarations["Input"]!;
      return resolveType<never>(input, schema);
    }
    case "it": {
      return context.it!.type;
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
      return resolveType<never>(field.type, schema);
    }
  }
}

// export type IfExpressionResult =
//   | {
//       readonly kind: "success";
//       readonly then: ExpressionContext;
//       readonly else: ExpressionContext;
//     }
//   | InternalErrors;

// export function resolveIfExpression(
//   expression: Expression,
//   type: ResolvedType | NullType,
//   is: AttributeValue<"notNull" | "notEmpty" | undefined>,
// ): IfExpressionResult {
//   switch (expression.kind) {
//   }
// }
