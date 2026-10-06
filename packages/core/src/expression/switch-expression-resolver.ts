import { ResolvedFieldType, Schema } from "../schema/schema-types.js";
import { InternalErrors, TextSpan } from "../util/shared-types.js";
import { stripQuotes } from "../util/spans.js";
import { resolveExpressionType } from "./expression-type-resolver.js";
import type { Expression, ExpressionContext } from "./expression-types.js";

export type SwitchExpressionResult =
  | {
      readonly kind: "success";
      readonly cases: {
        readonly [caseVal: string]: {
          readonly context: ExpressionContext;
          readonly definition: TextSpan;
        };
      };
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
    const result = resolveExpressionType(left, schema, null);
    if (result.kind === "success" && result.type.kind === "union") {
      const unionMembers = schema.unionToMembers.get(result.type);
      if (
        unionMembers?.kind === "interfaces" &&
        unionMembers.discriminator === expression.property.text
      ) {
        const cases = Object.fromEntries(
          Object.entries(unionMembers.members).map(([kind, member]) => [
            kind,
            {
              context: {
                it: { expression, type },
                typeOverrides: {
                  [left.fullPath.text]: member.resolved,
                },
              },
              definition:
                member.discriminant.kind === "string-literal"
                  ? stripQuotes(member.discriminant.quotedName)
                  : member.discriminant.span,
            },
          ]),
        );
        return { kind: "success", cases };
      }
    }
  }

  if (type.kind === "string-literal") {
    return {
      kind: "success",
      cases: {
        [type.value]: {
          context: { it: { expression, type }, typeOverrides: {} },
          definition: stripQuotes(type.quotedName),
        },
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

  const cases = Object.fromEntries(
    Object.entries(members.values).map(([caseVal, stringLiteralOrSpan]) => [
      caseVal,
      {
        context: { it: { expression, type }, typeOverrides: {} },
        definition: stripQuotes(stringLiteralOrSpan.quotedName),
      },
    ]),
  );

  return { kind: "success", cases };
}
