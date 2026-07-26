import { ResolvedType, SchemaView } from "../schema/schema-types.js";
import { getUnionMembers } from "../schema/unions.js";
import { InternalErrors } from "../util/shared-types.js";
import { resolveExpressionType } from "./expression-type-resolver.js";
import type {
  Expression,
  ExpressionContext,
  NullableType,
} from "./expression-types.js";

export type SwitchExpressionResult =
  | {
      readonly kind: "success";
      readonly cases: { readonly [caseVal: string]: ExpressionContext };
    }
  | InternalErrors;

export function resolveSwitchExpression(
  expression: Expression,
  type: ResolvedType | NullableType,
  schema: SchemaView,
): SwitchExpressionResult {
  const it: ExpressionContext["it"] = { expression, type };
  if (type.kind === "string-literal") {
    type = { kind: "union", members: [type] };
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
  const members = getUnionMembers(type, schema);
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

  // See if expression refers to the 'kind' field of a union of interfaces.
  if (expression.kind === "property") {
    const { left } = expression;
    const resolvedType = resolveExpressionType(left, schema, null);
    if (resolvedType.kind === "union") {
      const members = getUnionMembers(resolvedType, schema);
      if (
        members.kind === "interfaces" &&
        members.kindFieldName === expression.property.text
      ) {
        return {
          kind: "success",
          cases: Object.fromEntries(
            Object.entries(members.members).map((kind, member) => {
              return [
                kind,
                {
                  it: { expression, type },
                  typeOverrides: {
                    [left.fullPath.text]: member,
                  },
                },
              ];
            }),
          ),
        };
      }
    }
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
