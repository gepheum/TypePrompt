import { NullType, ResolvedFieldType, Schema } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import { DefinitionLink, InternalErrors } from "../util/shared-types.js";
import { Expression, ExpressionContext } from "./expression-types.js";

export type ResolvedExpressionType<HasValContext extends boolean> =
  | ResolvedFieldType
  | (HasValContext extends true ? NullType : never)
  | InternalErrors;

export function resolveExpressionType<HasValContext extends boolean>(
  expression: Expression<HasValContext>,
  schema: Schema,
  context: HasValContext extends true ? ExpressionContext : null,
): ResolvedExpressionType<HasValContext> {
  const result = doResolveExpressionType(expression, schema, context, false);
  if (result.kind === "error") {
    return result;
  }
  return result.type as ResolvedExpressionType<HasValContext>;
}

export function collectExpressionDefinitionLinks<
  HasValContext extends boolean = false,
>(
  expression: Expression<HasValContext>,
  schema: Schema,
  context: HasValContext extends true ? ExpressionContext : null,
): readonly DefinitionLink[] {
  const result = doResolveExpressionType(
    expression,
    schema,
    context,
    "collect",
  );
  return result.kind === "success" ? result.definitionLinks : [];
}

type ExpressionTypeResult = {
  readonly kind: "success";
  readonly type: ResolvedFieldType | NullType;
  readonly definitionLinks: readonly DefinitionLink[];
};

function doResolveExpressionType<HasValContext extends boolean>(
  expression: Expression<HasValContext>,
  schema: Schema,
  context: HasValContext extends true ? ExpressionContext : null,
  collectDefinitionLinks: "collect" | false,
): ExpressionTypeResult | InternalErrors {
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
        type: typeOverride as ResolvedFieldType | NullType,
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
        type: context!.it.type,
        definitionLinks: NO_DEFINITION_LINKS,
      };
    }
    case "property": {
      const left = doResolveExpressionType(
        expression.left,
        schema,
        context,
        collectDefinitionLinks,
      );
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
        };
      }
      if (left.type.kind === "union") {
        const members = schema.unionToMembers.get(left.type)!;
        if (
          members.kind === "interfaces" &&
          members.discriminator === expression.property.text
        ) {
          let definitionLinks: readonly DefinitionLink[];
          if (collectDefinitionLinks) {
            const field = members.first.fields[expression.property.text];
            if (field && field.name.start !== undefined) {
              definitionLinks = [
                ...left.definitionLinks,
                {
                  reference: expression.property,
                  definition: field.name,
                },
              ];
            } else {
              definitionLinks = left.definitionLinks;
            }
          } else {
            definitionLinks = NO_DEFINITION_LINKS;
          }
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
        };
      }
      let definitionLinks: readonly DefinitionLink[];
      if (collectDefinitionLinks) {
        if (field.name.start !== undefined) {
          definitionLinks = [
            ...left.definitionLinks,
            {
              reference: expression.property,
              definition: field.name,
            },
          ];
        } else {
          definitionLinks = left.definitionLinks;
        }
      } else {
        definitionLinks = NO_DEFINITION_LINKS;
      }
      return {
        kind: "success",
        type: resolveType(field.type, schema),
        definitionLinks,
      };
    }
  }
}

const NO_DEFINITION_LINKS: readonly DefinitionLink[] = [];
