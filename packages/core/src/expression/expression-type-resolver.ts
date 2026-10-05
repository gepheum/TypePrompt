import { NullType, ResolvedFieldType, Schema } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import { DefinitionLink, ValidationErrors } from "../util/shared-types.js";
import { Expression, ExpressionContext } from "./expression-types.js";

export type ExpressionTypeResult<HasValContext extends boolean = false> = {
  readonly kind: "success";
  readonly type:
    ResolvedFieldType | (HasValContext extends true ? NullType : never);
  readonly definitionLinks: readonly DefinitionLink[];
};

export function resolveExpressionType<HasValContext extends boolean>(
  expression: Expression<HasValContext>,
  schema: Schema,
  context: HasValContext extends true ? ExpressionContext : null,
): ExpressionTypeResult<HasValContext> | ValidationErrors {
  if (context) {
    let fullPath = expression.fullPath.text;
    if (fullPath === "it" || fullPath.startsWith("it.")) {
      const { it } = context;
      fullPath = it.expression.fullPath.text.concat(fullPath.slice(2));
    }
    const typeOverride = context.typeOverrides[fullPath];
    if (typeOverride) {
      return {
        kind: "success",
        type: typeOverride as
          ResolvedFieldType | (HasValContext extends true ? NullType : never),
        definitionLinks: NO_DEFINITION_LINKS,
      };
    }
  }
  switch (expression.kind) {
    case "input": {
      const input = schema.typeDeclarations["Input"]!;
      return {
        kind: "success",
        type: resolveType(input.valueType, schema),
        definitionLinks: NO_DEFINITION_LINKS,
      };
    }
    case "it": {
      return {
        kind: "success",
        type: context!.it.type as
          ResolvedFieldType | (HasValContext extends true ? NullType : never),
        definitionLinks: NO_DEFINITION_LINKS,
      };
    }
    case "property": {
      const left = resolveExpressionType(expression.left, schema, context);
      if (left.kind === "error") {
        return left;
      }
      if (left.type.kind === "optional" || left.type.kind === "null") {
        return {
          kind: "error",
          errors: [
            {
              span: expression.left.fullPath,
              message: "May be null",
            },
          ],
          definitionLinks: left.definitionLinks,
        };
      }
      if (left.type.kind === "union") {
        const members = schema.unionToMembers.get(left.type)!;
        if (
          members.kind === "interfaces" &&
          members.discriminator === expression.property.text
        ) {
          const field = members.first.fields[expression.property.text];
          const definitionLinks: readonly DefinitionLink[] =
            field && field.name.start !== undefined
              ? [
                  ...left.definitionLinks,
                  {
                    reference: expression.property,
                    definition: field.name,
                  },
                ]
              : left.definitionLinks;
          return {
            kind: "success",
            type: {
              kind: "union",
              members: members.discriminants.values,
            },
            definitionLinks,
          };
        }
      }
      if (left.type.kind !== "interface") {
        return {
          kind: "error",
          errors: [
            {
              span: expression.left.fullPath,
              message: "Not an interface type",
            },
          ],
          definitionLinks: left.definitionLinks,
        };
      }
      const field = left.type.fields[expression.property.text];
      if (!field) {
        return {
          kind: "error",
          errors: [
            {
              span: expression.property,
              message: `Field '${expression.property.text}' not found in interface`,
              suggestions: Object.keys(left.type.fields),
            },
          ],
          definitionLinks: left.definitionLinks,
        };
      }
      const definitionLinks: readonly DefinitionLink[] =
        field.name.start !== undefined
          ? [
              ...left.definitionLinks,
              {
                reference: expression.property,
                definition: field.name,
              },
            ]
          : left.definitionLinks;
      return {
        kind: "success",
        type: resolveType(field.type, schema),
        definitionLinks,
      };
    }
  }
}

const NO_DEFINITION_LINKS: readonly DefinitionLink[] = [];
