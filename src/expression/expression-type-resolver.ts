// import { ResolvedType } from "../schema/schema-types.js";
// import { ExpressionNode } from "./expression-types.js";
// import type {
//   InternalErrors,
// } from "../util/error-types.js";

// export type ExpressionType = ResolvedType | NullType | NullableType;

// export type NullType = {
//   readonly kind: "primitive";
//   readonly primitive: "null";
// };

// export type NullableType = {
//   readonly kind: "nullable";
//   readonly otherType: ResolvedType;
// };

// export function resolveExpressionType(
//   expression: ExpressionNode,
//   inputType: ResolvedType,
// ): ExpressionType | InternalErrors {
//   switch (expression.kind) {
//     case "input": {
//       return inputType;
//     }
//     case "literal": {
//       switch (expression.value.kind) {
//         case "null":
//           return  { kind: "primitive", primitive: "null" };
//         case "boolean":
//           return { kind: "primitive", primitive: "boolean" };
//         case "number":
//           return { kind: "primitive", primitive: "number" };
//         case "string":
//           return {
//             kind: "string-literal",
//             value: expression.value.value,
//             quotedName: expression.span,
//           };
//       }
//     }
//     case "wrapped": {
//       return resolveExpressionType(expression.expression, inputType);
//     }
//     case "dot-operation": {
//       const leftType = resolveExpressionType(expression.left, inputType);
//       if (leftType.kind === "error") {
//         return leftType;
//       }
//       const leftTypeIsNullable = leftType.kind == "nullable" || (
//         leftType.kind === "primitive" && leftType.primitive === "null"
//       );
//       if (leftTypeIsNullable && expression.dot === ".") {
//         return { kind: "nullable", otherType: leftType };
//       }
//       if (!leftTypeIsNullable && expression.dot === "?.") {
//         return { kind: "nullable", otherType: leftType };
//       }
//     }
//     case "unary-operation": {

//     }
//   }
// }

// function getSpan(expression: ExpressionNode): SourceSpan {
//   switch (expression.kind) {
//     case "literal":
//       return expression.span;
//     case "input":
//       return expression.span;
//     case "wrapped":
//       return getSpan(expression.expression);
//     case "dot-operation":
//       return expression.dotSpan;
//     case "unary-operation":
//       return expression.operatorSpan;
//     case "binary-operation":
//       return expression.left.span; // Assuming left has a span
//   }
// }
