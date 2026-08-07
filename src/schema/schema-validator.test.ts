// import { expect } from "buckwheat";
// import { describe, it } from "mocha";

// import { MappedText } from "../util/shared-types.js";
// import { EMPTY_SCHEMA } from "./empty-schema.js";
// import { parseSchema } from "./schema-parser.js";
// import type {
//   SchemaValidationContext,
//   TypeDeclaration,
// } from "./schema-types.js";
// import { validateSchema } from "./schema-validator.js";

// function textNode(source: string): MappedText {
//   return {
//     text: source,
//     offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
//   };
// }

// function parseDeclarations(source: string): {
//   readonly [name: string]: TypeDeclaration;
// } {
//   const result = parseSchema(textNode(source));
//   if (result.kind !== "success") {
//     throw new Error(
//       `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
//     );
//   }
//   return result.typeDeclarations;
// }

// // ---------------------------------------------------------------------------
// // Success cases
// // ---------------------------------------------------------------------------

// describe("validateSchema – success", () => {
//   it("validates a simple interface", () => {
//     const result = validateSchema(
//       parseDeclarations("type Output = { name: string; };"),
//       NAMESPACE,
//     );
//     expect([result]).toMatch([{ kind: "success" }]);
//   });

//   it("validates a string literal union", () => {
//     const result = validateSchema(
//       parseDeclarations('type Output = "active" | "inactive";'),
//       NAMESPACE,
//     );
//     expect(result).toMatch({ kind: "success" });
//   });

//   it("validates a cross-type reference", () => {
//     const result = validateSchema(
//       parseDeclarations(
//         [
//           "type Output = { status: Status; };",
//           'type Status = "active" | "inactive";',
//         ].join("\n"),
//       ),
//       NAMESPACE,
//     );
//     expect(result).toMatch({ kind: "success" });
//   });

//   it("validates a valid Meta interface", () => {
//     const result = validateSchema(
//       parseDeclarations("type Meta = { model: string; temperature: number; };"),
//       META,
//     );
//     expect(result).toMatch({ kind: "success" });
//   });

//   it("accepts a Meta field with a string literal union type", () => {
//     const result = validateSchema(
//       parseDeclarations('type Meta = { role: "admin" | "user"; }'),
//       META,
//     );
//     expect(result).toMatch({ kind: "success" });
//   });
// });

// // ---------------------------------------------------------------------------
// // Required type
// // ---------------------------------------------------------------------------

// describe("validateSchema – required type", () => {
//   it("reports missing Input/Output in template context", () => {
//     const result = validateSchema(parseDeclarations(""), TEMPLATE);
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         { message: "Missing required type 'Input'" },
//         { message: "Missing required type 'Output'" },
//       ],
//     });
//   });

//   it("reports missing Meta in meta context", () => {
//     const result = validateSchema(parseDeclarations(""), META);
//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "Missing required type 'Meta'" }],
//     });
//   });
// });

// // ---------------------------------------------------------------------------
// // Naming errors
// // ---------------------------------------------------------------------------

// describe("validateSchema – naming errors", () => {
//   it("reports a type name starting with lowercase", () => {
//     const result = validateSchema(
//       parseDeclarations("type response = { name: string; };"),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message:
//             "Must start with uppercase letter and contain only alphanumeric characters",
//         },
//       ],
//     });
//   });

//   it("reports a field name starting with uppercase", () => {
//     const result = validateSchema(
//       parseDeclarations("type Output = { Name: string; };"),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message:
//             "Must start with lowercase letter and contain only alphanumeric characters",
//         },
//       ],
//     });
//   });

//   it("reports field names that conflict by case", () => {
//     const result = validateSchema(
//       parseDeclarations("type Output = { myField: string; myfield: number; };"),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "'myfield' and 'myField' differ only by casing" }],
//     });
//   });
// });

// // ---------------------------------------------------------------------------
// // Type reference errors
// // ---------------------------------------------------------------------------

// describe("validateSchema - type references", () => {
//   it("reports an unknown type reference", () => {
//     const result = validateSchema(
//       parseDeclarations("type Output = { value: Unknown; };"),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "Unknown type 'Unknown'" }],
//     });
//   });

//   it("reports a direct circular reference", () => {
//     const result = validateSchema(
//       parseDeclarations("type Output = { child: Output; };"),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "Type 'Output' circularly references itself" }],
//     });
//   });

//   it("reports an indirect circular reference", () => {
//     const result = validateSchema(
//       parseDeclarations(
//         [
//           "type Output = { next: Other; };",
//           "type Other = { back: Output; };",
//         ].join("\n"),
//       ),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         { message: "Type 'Output' circularly references itself" },
//         { message: "Type 'Other' circularly references itself" },
//       ],
//     });
//   });

//   it("reports an unused type", () => {
//     const result = validateSchema(
//       parseDeclarations(
//         [
//           "type Output = { name: string; };",
//           "type Unused = string;",
//           "type Input = integer;",
//         ].join("\n"),
//       ),
//       TEMPLATE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "Type 'Unused' is not used" }],
//     });
//   });
// });

// // ---------------------------------------------------------------------------
// // Union type errors
// // ---------------------------------------------------------------------------

// describe("validateSchema - union type errors", () => {
//   it("reports a union with a primitive member", () => {
//     const result = validateSchema(
//       parseDeclarations("type Output = string | number;"),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Members of a union must be string literals or interfaces",
//         },
//       ],
//     });
//   });

//   it("reports a union with an array member", () => {
//     const result = validateSchema(
//       parseDeclarations('type Output = "a"[] | "b"[];'),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Members of a union must be string literals or interfaces",
//         },
//       ],
//     });
//   });

//   it("reports a union mixing strings and interfaces", () => {
//     const result = validateSchema(
//       parseDeclarations(
//         'type Output = "active" | { kind: "inactive"; value: string };',
//       ),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message:
//             "All members of a string-literal union must be string literals",
//         },
//       ],
//     });
//   });

//   it("reports an interface union member without a string literal discriminator", () => {
//     const result = validateSchema(
//       parseDeclarations("type Output = { kind: string; } | { kind: string; };"),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Type of 'kind' field is not a string literal",
//         },
//       ],
//     });
//   });

//   it("reports an interface union member with no first field", () => {
//     const result = validateSchema(
//       parseDeclarations('type Output = {} | { kind: "b"; };'),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           message: "Can't have an empty interface in a union type",
//         },
//       ],
//     });
//   });

//   it("reports interface union members with mismatched discriminator field names", () => {
//     const result = validateSchema(
//       parseDeclarations(
//         'type Output = { kind: "a"; value: string } | { type: "b"; value: string };',
//       ),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         {
//           span: {
//             start: 45,
//           },
//           message: "Discriminator field name 'type' does not match 'kind'",
//         },
//       ],
//     });
//   });

//   it("reports duplicate discriminant in an interface union", () => {
//     const result = validateSchema(
//       parseDeclarations(
//         'type Output = { kind: "same"; x: number } | { kind: "same"; y: number };',
//       ),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         { message: "Multiple members have the same discriminant: 'same'" },
//         { message: "Multiple members have the same discriminant: 'same'" },
//       ],
//     });
//   });

//   it("reports duplicate string literals in a string union", () => {
//     const result = validateSchema(
//       parseDeclarations('type Output = "active" | "active";'),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [
//         { message: "Duplicate member 'active'" },
//         { message: "Duplicate member 'active'" },
//       ],
//     });
//   });

//   it("allows a valid three-member interface union", () => {
//     const result = validateSchema(
//       parseDeclarations(
//         [
//           "type Output =",
//           '  | { kind: "a"; x: number }',
//           '  | { kind: "b"; y: string }',
//           '  | { kind: "c"; z: boolean };',
//         ].join("\n"),
//       ),
//       NAMESPACE,
//     );
//     expect(result).toMatch({ kind: "success" });
//   });
// });

// // ---------------------------------------------------------------------------
// // Shared type names
// // ---------------------------------------------------------------------------

// describe("validateSchema – shared type names", () => {
//   function makeTemplateContext(
//     namespaceSource: string,
//   ): SchemaValidationContext {
//     const ns = validateSchema(parseDeclarations(namespaceSource), NAMESPACE);
//     if (ns.kind !== "success") {
//       throw new Error(
//         `Namespace schema failed: ${ns.errors.map((e) => e.message).join(", ")}`,
//       );
//     }
//     return { kind: "template", namespaceSchema: ns };
//   }

//   it("accepts shared.X in template context when X exists in namespace schema", () => {
//     const result = validateSchema(
//       parseDeclarations("type Input = string;\ntype Output = shared.Profile;"),
//       makeTemplateContext("type Profile = { name: string; };"),
//     );
//     expect(result).toMatch({ kind: "success" });
//   });

//   it("accepts shared.X as a field type in template context", () => {
//     const result = validateSchema(
//       parseDeclarations(
//         "type Input = string;\ntype Output = { user: shared.Profile; };",
//       ),
//       makeTemplateContext("type Profile = { name: string; };"),
//     );
//     expect(result).toMatch({ kind: "success" });
//   });

//   it("reports error for shared.X in namespace context", () => {
//     const result = validateSchema(
//       parseDeclarations("type Output = shared.Profile;"),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "'shared' not allowed inside <namespace> elements" }],
//     });
//   });

//   it("reports error for shared.X in meta context", () => {
//     const result = validateSchema(
//       parseDeclarations("type Meta = { field: shared.Profile; };"),
//       META,
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "'shared' not allowed inside <meta> elements" }],
//     });
//   });

//   it("reports error when the referenced type does not exist in namespace schema", () => {
//     const result = validateSchema(
//       parseDeclarations("type Input = string;\ntype Output = shared.Missing;"),
//       { kind: "template", namespaceSchema: EMPTY_SCHEMA },
//     );
//     expect(result).toMatch({
//       kind: "error",
//       errors: [{ message: "Unknown type 'Missing'" }],
//     });
//   });
// });

// // ---------------------------------------------------------------------------
// // Schema output fields
// // ---------------------------------------------------------------------------

// describe("validateSchema - Schema fields", () => {
//   it("collects field names and string literal values as identifiers", () => {
//     const result = validateSchema(
//       parseDeclarations('type Output = { name: string; role: "admin"; }'),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "success",
//       identifiers: new Set(["name", "role", "admin"]),
//     });
//   });

//   it("collects string literal values from unions as identifiers", () => {
//     const result = validateSchema(
//       parseDeclarations('type Output = "active" | "inactive";'),
//       NAMESPACE,
//     );
//     expect(result).toMatch({
//       kind: "success",
//       identifiers: new Set(["active", "inactive"]),
//     });
//   });
// });

// const NAMESPACE: SchemaValidationContext = {
//   kind: "namespace",
// };

// const META: SchemaValidationContext = { kind: "meta" };

// const TEMPLATE: SchemaValidationContext = {
//   kind: "template",
//   namespaceSchema: EMPTY_SCHEMA,
// };
