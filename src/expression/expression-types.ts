import { TextSpan } from "../util/common-types.js";

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
