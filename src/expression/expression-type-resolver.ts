import { ResolvedType, Schema } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import { InternalErrors } from "../util/shared-types.js";
import {
  Expression,
  ExpressionContext,
  NullableType,
  NullType,
} from "./expression-types.js";

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
      return resolveType(input, schema);
    }
    case "it": {
      return context!.it.type;
    }
    case "property": {
      const left = resolveExpressionType(expression.left, schema, context);
      if (left.kind === "error") {
        return left;
      }
      if (left.kind === "nullable" || left.kind === "null") {
        return {
          kind: "error",
          errors: [
            {
              span: expression.left.fullPath,
              message: "May be null",
            },
          ],
        };
      }
      if (left.kind === "union") {
        const members = schema.unionToMembers.get(left)!;
        if (
          members.kind === "interfaces" &&
          members.discriminator === expression.property.text
        ) {
          return {
            kind: "union",
            members: members.discriminants.discriminants,
          };
        }
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
      const fieldType = resolveType(field.type, schema);
      return field.optional ? { kind: "nullable", type: fieldType } : fieldType;
    }
  }
}
