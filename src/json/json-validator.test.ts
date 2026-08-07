// import { expect } from "buckwheat";
// import { describe, it } from "mocha";

// import { parseSchema } from "../schema/schema-parser.js";
// import type { Schema } from "../schema/schema-types.js";
// import { validateSchema } from "../schema/schema-validator.js";
// import type { MappedText, Span } from "../util/shared-types.js";
// import { joinTextNodes } from "../util/text-node-joiner.js";
// import type {
//   JsonArray,
//   JsonBoolean,
//   JsonNumber,
//   JsonObject,
//   JsonString,
//   StrictJsonValue,
// } from "./json-types.js";
// import { validateJson } from "./json-validator.js";

// // ---------------------------------------------------------------------------
// // Helpers
// // ---------------------------------------------------------------------------

// function parseSchemaOrThrow(source: string): Schema {
//   const textNode: MappedText = joinTextNodes(
//     [
//       {
//         text: source,
//         offsetMap: [
//           {
//             textPosition: 0,
//             sourcePosition: 0,
//           },
//         ],
//       },
//     ],
//     0,
//   );
//   const schemaParseResult = parseSchema(textNode);
//   if (schemaParseResult.kind !== "success") {
//     const errors = schemaParseResult.errors.map((e) => e.message).join(", ");
//     throw new Error(`Schema parse failed: ${errors}`);
//   }
//   const schema = validateSchema(schemaParseResult.typeDeclarations, {
//     kind: "namespace",
//   });
//   if (schema.kind !== "success") {
//     const errors = schema.errors.map((e) => e.message).join(", ");
//     throw new Error(`Schema validation failed: ${errors}`);
//   }
//   return schema;
// }

// function span(text: string): Span {
//   return { start: 0, end: text.length };
// }

// function str(value: string): JsonString {
//   return { kind: "string", firstToken: span(`"${value};"`), value };
// }

// function num(value: number): JsonNumber {
//   return { kind: "number", firstToken: span(String(value)), value };
// }

// function bool(value: boolean): JsonBoolean {
//   return { kind: "boolean", firstToken: span(String(value)), value };
// }

// function objStrict(entries: [string, StrictJsonValue][]): JsonObject<"strict"> {
//   return {
//     kind: "object",
//     firstToken: span("{"),
//     entries: Object.fromEntries(
//       entries.map(([key, value]) => [key, { key: str(key), value }]),
//     ),
//   };
// }

// function arrStrict(elements: StrictJsonValue[]): JsonArray<"strict"> {
//   return { kind: "array", firstToken: span("["), elements };
// }

// // ---------------------------------------------------------------------------
// // validateJson – exact match
// // ---------------------------------------------------------------------------

// describe("validateJson – exact match", () => {
//   it("accepts a string for a string type", () => {
//     const schema = parseSchemaOrThrow("type Response = string");
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(str("hello"), schema, type)).toMatch([]);
//   });

//   it("accepts a number for a number type", () => {
//     const schema = parseSchemaOrThrow("type Response = number");
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(num(3.14), schema, type)).toMatch([]);
//   });

//   it("accepts a boolean for a boolean type", () => {
//     const schema = parseSchemaOrThrow("type Response = boolean");
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(bool(true), schema, type)).toMatch([]);
//   });

//   it("accepts an integer for an int type", () => {
//     const schema = parseSchemaOrThrow(
//       "type Int = number\ntype Response = { count: Int; };",
//     );
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(objStrict([["count", num(42)]]), schema, type)).toMatch(
//       [],
//     );
//   });

//   it("accepts a float for an integer type", () => {
//     const schema = parseSchemaOrThrow(
//       "type Int = number\ntype Response = { count: Int; };",
//     );
//     const type = schema.typeDeclarations["Response"]!;
//     expect(
//       validateJson(objStrict([["count", num(3.14)]]), schema, type),
//     ).toMatch([]);
//   });

//   it("accepts an object matching an interface", () => {
//     const schema = parseSchemaOrThrow(
//       "type Response = { name: string; age: number; };",
//     );
//     const type = schema.typeDeclarations["Response"]!;
//     expect(
//       validateJson(
//         objStrict([
//           ["name", str("Alice")],
//           ["age", num(30)],
//         ]),
//         schema,
//         type,
//       ),
//     ).toMatch([]);
//   });

//   it("accepts an object when an optional field is absent", () => {
//     const schema = parseSchemaOrThrow(
//       "type Response = { name: string; nickname?: string; };",
//     );
//     const type = schema.typeDeclarations["Response"]!;
//     expect(
//       validateJson(objStrict([["name", str("Alice")]]), schema, type),
//     ).toMatch([]);
//   });

//   it("accepts an array of strings for a string array type", () => {
//     const schema = parseSchemaOrThrow("type Response = string[]");
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(arrStrict([str("a"), str("b")]), schema, type)).toMatch(
//       [],
//     );
//   });

//   it("accepts the exact string for a string-literal type", () => {
//     const schema = parseSchemaOrThrow('type Response = "ok"');
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(str("ok"), schema, type)).toMatch([]);
//   });

//   it("accepts a matching value from a string union", () => {
//     const schema = parseSchemaOrThrow('type Response = "pending" | "done"');
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(str("done"), schema, type)).toMatch([]);
//   });

//   it("accepts a matching member of an interface union", () => {
//     const schema = parseSchemaOrThrow(
//       'type Cat = { kind: "cat"; name: string; }; type Dog = { kind: "dog"; breed: string; }; type Response = Cat | Dog',
//     );
//     const type = schema.typeDeclarations["Response"]!;
//     expect(
//       validateJson(
//         objStrict([
//           ["kind", str("cat")],
//           ["name", str("Whiskers")],
//         ]),
//         schema,
//         type,
//       ),
//     ).toMatch([]);
//   });

//   it("validates against a non-root named type", () => {
//     const schema = parseSchemaOrThrow(
//       "type Response = { item: Detail }; type Detail = { x: string; };",
//     );
//     const type = schema.typeDeclarations["Detail"]!;
//     expect(validateJson(objStrict([["x", str("hi")]]), schema, type)).toMatch(
//       [],
//     );
//   });
// });

// // ---------------------------------------------------------------------------
// // validateJson – mismatch: no close match → single error
// // ---------------------------------------------------------------------------

// describe("validateJson – mismatch: no close match", () => {
//   it("returns a single error when a number is given for a string type", () => {
//     const schema = parseSchemaOrThrow("type Response = string");
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(num(42), schema, type)).toMatch([
//       { message: "Does not match type 'Response'" },
//     ]);
//   });

//   it("returns a single error when an object is given for a string type", () => {
//     const schema = parseSchemaOrThrow("type Response = string");
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(objStrict([]), schema, type)).toMatch([
//       { message: "Does not match type 'Response'" },
//     ]);
//   });

//   it("returns a single error when a number is given for a string union", () => {
//     const schema = parseSchemaOrThrow('type Response = "a" | "b"');
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(num(1), schema, type)).toMatch([
//       { message: "Does not match type 'Response'" },
//     ]);
//   });

//   it("returns a single error when the kind field is missing for an interface union", () => {
//     const schema = parseSchemaOrThrow(
//       'type Cat = { kind: "cat"; }; type Dog = { kind: "dog"; }; type Response = Cat | Dog',
//     );
//     const type = schema.typeDeclarations["Response"]!;
//     expect(
//       validateJson(objStrict([["name", str("Felix")]]), schema, type),
//     ).toMatch([{ message: "Does not match type 'Response'" }]);
//   });
// });

// // ---------------------------------------------------------------------------
// // validateJson – mismatch: close match → two errors
// // ---------------------------------------------------------------------------

// describe("validateJson – mismatch: close match", () => {
//   it("returns 2 errors for an object with a wrong-typed field", () => {
//     const schema = parseSchemaOrThrow("type Response = { name: string; };");
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(objStrict([["name", num(42)]]), schema, type)).toMatch([
//       { message: "Does not match type 'Response'" },
//       { message: "Expected string but got number" },
//     ]);
//   });

//   it("returns 2 errors for a string not in a string union", () => {
//     const schema = parseSchemaOrThrow('type Response = "a" | "b"');
//     const type = schema.typeDeclarations["Response"]!;
//     expect(validateJson(str("c"), schema, type)).toMatch([
//       { message: "Does not match type 'Response'" },
//       { message: "Not found in union type" },
//     ]);
//   });

//   it("returns 2 errors for an unknown kind value in an interface union", () => {
//     const schema = parseSchemaOrThrow(
//       'type Response = { kind: "cat" } | { kind: "dog" }',
//     );
//     const type = schema.typeDeclarations["Response"]!;
//     expect(
//       validateJson(objStrict([["kind", str("fish")]]), schema, type),
//     ).toMatch([
//       { message: "Does not match type 'Response'" },
//       { message: 'No matching member for value "fish"' },
//     ]);
//   });

//   it("returns 2 errors for a missing required field", () => {
//     const schema = parseSchemaOrThrow(
//       "type Response = { name: string; age: number; };",
//     );
//     const type = schema.typeDeclarations["Response"]!;
//     expect(
//       validateJson(objStrict([["name", str("Alice")]]), schema, type),
//     ).toMatch([
//       { message: "Does not match type 'Response'" },
//       { message: "Missing required field 'age'" },
//     ]);
//   });
// });
