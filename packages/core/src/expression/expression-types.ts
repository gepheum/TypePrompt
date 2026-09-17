import { NullType, ResolvedFieldType } from "../schema/schema-types.js";
import { TextSpan } from "../util/shared-types.js";

export type Expression<HasValContext extends boolean = false> =
  | {
      readonly kind: "input";
      readonly fullPath: TextSpan;
    }
  | {
      readonly kind: "property";
      readonly left: Expression<HasValContext>;
      readonly property: TextSpan;
      readonly fullPath: TextSpan;
    }
  | (HasValContext extends true
      ? {
          readonly kind: "it";
          readonly fullPath: TextSpan;
        }
      : never);

export type ExpressionInContext = Expression<true>;

export type ExpressionContext = {
  readonly it: {
    readonly expression: Expression;
    readonly type: ResolvedFieldType;
  };
  readonly typeOverrides: {
    readonly [fullPath: string]: ResolvedFieldType | NullType;
  };
};
