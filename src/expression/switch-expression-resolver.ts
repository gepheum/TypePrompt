import { ResolvedFieldType, Schema } from "../schema/schema-types.js";
import { InternalErrors } from "../util/shared-types.js";
import { resolveExpressionType } from "./expression-type-resolver.js";
import type { Expression, ExpressionContext } from "./expression-types.js";

export type SwitchExpressionResult =
  | {
      readonly kind: "success";
      readonly cases: { readonly [caseVal: string]: ExpressionContext };
    }
  | InternalErrors;

export function resolveSwitchExpression(
  expression: Expression,
  type: ResolvedFieldType,
  schema: Schema,
): SwitchExpressionResult {
  // Check for a property access on a discriminated interface union first, before
  // any union-member map lookup.
  if (expression.kind === "property") {
    const { left } = expression;
    const resolvedType = resolveExpressionType(left, schema, null);
    if (resolvedType.kind === "union") {
      const unionMembers = schema.unionToMembers.get(resolvedType);
      if (
        unionMembers?.kind === "interfaces" &&
        unionMembers.discriminator === expression.property.text
      ) {
        return {
          kind: "success",
          cases: Object.fromEntries(
            Object.entries(unionMembers.members).map(([kind, member]) => {
              return [
                kind,
                {
                  it: { expression, type },
                  typeOverrides: {
                    [left.fullPath.text]: member.resolved,
                  },
                },
              ];
            }),
          ),
        };
      }
    }
  }

  if (type.kind === "string-literal") {
    return {
      kind: "success",
      cases: {
        [type.value]: { it: { expression, type }, typeOverrides: {} },
      },
    };
  }
  if (type.kind !== "union") {
    return {
      kind: "error",
      errors: [
        {
          span: expression.fullPath,
          message: "Expected: union type",
        },
      ],
    };
  }
  const members = schema.unionToMembers.get(type)!;
  if (members.kind !== "strings") {
    return {
      kind: "error",
      errors: [
        {
          span: expression.fullPath,
          message: "Expected: union of string literals",
        },
      ],
    };
  }

  return {
    kind: "success",
    cases: Object.fromEntries(
      members.members.map((member) => {
        return [
          member.value,
          {
            it: { expression, type },
            typeOverrides: {},
          },
        ];
      }),
    ),
  };
}
