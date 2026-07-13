// import { ResolvedType } from "../schema/schema-types.js";
// import { ExpressionNode } from "./expression-types.js";
// import type {
//   InternalErrors,
// } from "../util/error-types.js";

// export type ExpressionType = {
//   readonly type: ResolvedType;
// };

// export function resolveType(
//   expression: ExpressionNode,
//   inputType: ResolvedType,
// ): ExpressionType | InternalErrors {
//   switch (expression.kind) {
//     case "input": {
//       return {
//         type: inputType,
//       };
//     }
//     case "literal": {
//       switch (expression.value.kind) {
//         case "null":
//           return { type: { kind: "primitive", primitive: "null" } };
//         case "boolean":
//           return { type: { kind: "primitive", primitive: "boolean" } };
//         case "number":
//           return { type: { kind: "primitive", primitive: "number" } };
//         case "string":
//           return { type: { kind: "string-literal", value: expression.value.value, quotedName: expression.value.quotedName } };
//       }
//     }
//     case "wrapped": {
//       return resolveType(expression.expression, inputType);
//     }
//   }
// }
