import { ResolvedType, Schema } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import { InternalErrors } from "../util/common-types.js";
import { AttributeValue } from "../xml/xml-attributes-checker.js";
import { Expression } from "./compiler-types.js";

export type NullType = { readonly kind: "null" };
export type Nullable = { readonly kind: "nullable"; readonly type: ResolvedType };

export type NullableType = ResolvedType | NullType | Nullable;

export type ExpressionContext = {
  readonly it: {
    readonly expression: Expression;
    readonly type: ResolvedType;
  };
  readonly typeOverrides: { readonly [fullPath: string]: NullableType };
};

export function resolveExpressionType<HasValContext extends boolean>(
  expression: Expression<HasValContext>,
  schema: Schema,
  context: HasValContext extends true ? ExpressionContext : null,
): NullableType | InternalErrors {
  if (context) {
    let fullPath = expression.fullPath.text;
    if (fullPath === "it" || fullPath.startsWith("it.")) {
      const {it} = context;
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
  type: ResolvedType | NullType,
  is: AttributeValue<"notNull" | "notEmpty" | undefined>,
): IfExpressionResult {
  if (type.kind === "primitive" && type.primitive === "boolean") {
    if (is) {
    } else {
    }
  }
}
