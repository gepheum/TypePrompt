import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type {
  JsonArray,
  JsonBoolean,
  JsonNumber,
  JsonObject,
  JsonString,
  LooseJsonValue,
} from "../json/json-types.js";
import { parseSchema } from "../schema/schema-parser.js";
import type { Schema } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import type { TextSpan } from "../util/shared-types.js";
import type { CTag } from "./ctag-types.js";
import { validateCTag } from "./ctag-validator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSchemaOrThrow(source: string, path = "schema.ts"): Schema {
  const sourceSpan = {
    path,
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const parseResult = parseSchema(sourceSpan, "namespace");
  if (parseResult.kind !== "success") {
    const { errors } = parseResult;
    throw new Error(
      `Schema parse failed: ${errors.map((e) => e.message).join(", ")}`,
    );
  }
  const schema = validateSchema(parseResult, null);
  if (schema.kind === "error") {
    const { errors } = schema;
    throw new Error(
      `Schema validation failed: ${errors.map((e) => e.message).join(", ")}`,
    );
  }
  return schema;
}

function span(text: string): TextSpan {
  return {
    path: "",
    text: text,
    start: 0,
    end: text.length,
  };
}

function str(value: string): JsonString {
  return {
    kind: "string",
    firstToken: span(`"${value};"`),
    value,
    quoted: true,
  };
}

function num(value: number): JsonNumber {
  return { kind: "number", firstToken: span(String(value)), value };
}

function bool(value: boolean): JsonBoolean {
  return { kind: "boolean", firstToken: span(String(value)), value };
}

function obj(
  entries: [string, LooseJsonValue][],
  ellipsis = false,
): JsonObject<"loose"> {
  return {
    kind: "object",
    firstToken: span("{"),
    entries: Object.fromEntries(
      entries.map(([key, value]) => [key, { key: str(key), value }]),
    ),
    ...(ellipsis
      ? { ellipsis: { kind: "ellipsis" as const, firstToken: span("...") } }
      : {}),
  };
}

function arr(elements: LooseJsonValue[]): JsonArray<"loose"> {
  return { kind: "array", firstToken: span("["), elements };
}

function jsonCTag(json: LooseJsonValue): CTag {
  return { kind: "json", json };
}

function identifierCTag(text: string): CTag {
  return { kind: "identifier", identifier: span(text) };
}

// ---------------------------------------------------------------------------
// Identifier examples
// ---------------------------------------------------------------------------

describe("validateExample - identifier", () => {
  it("accepts an identifier that is a known field name", () => {
    const schema = parseSchemaOrThrow("type Response = { name: string; };");
    expect(validateCTag(identifierCTag("name"), [schema])).toMatch({
      errors: [],
      definitionLinks: [
        {
          definition: { text: "name" },
        },
      ],
    });
  });

  it("rejects an unknown identifier", () => {
    const schema = parseSchemaOrThrow("type Response = { name: string; };");
    expect(validateCTag(identifierCTag("unknown"), [schema])).toMatch({
      errors: [
        {
          message: "Identifier 'unknown' not found in schema",
          suggestions: ["name"],
        },
      ],
    });
  });

  it("accepts a string-literal union value as an identifier", () => {
    const schema = parseSchemaOrThrow('type Response = "active" | "inactive"');
    expect(validateCTag(identifierCTag("active"), [schema])).toMatch({
      errors: [],
      definitionLinks: [
        {
          definition: { text: '"active"' },
        },
      ],
    });
  });

  it("accepts an identifier present in toolNames even if absent from schema", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    expect(
      validateCTag(identifierCTag("myTool"), [schema], {
        myTool: span("myTool"),
      }),
    ).toMatch({
      errors: [],
      definitionLinks: [
        {
          definition: { text: "myTool" },
        },
      ],
    });
  });

  it("rejects an identifier absent from both schema and toolNames", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    expect(
      validateCTag(identifierCTag("unknown"), [schema], {
        otherTool: span("otherTool"),
      }),
    ).toMatch({
      errors: [
        {
          message: "Identifier 'unknown' not found in schema",
          suggestions: ["otherTool"],
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// JSON examples - exact match
// ---------------------------------------------------------------------------

describe("validateExample - json: exact match", () => {
  it("accepts a string for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    expect(validateCTag(jsonCTag(str("hello")), [schema])).toMatch({
      errors: [],
    });
  });

  it("accepts a number for a number type", () => {
    const schema = parseSchemaOrThrow("type Response = number");
    expect(validateCTag(jsonCTag(num(3.14)), [schema])).toMatch({
      errors: [],
    });
  });

  it("accepts a boolean for a boolean type", () => {
    const schema = parseSchemaOrThrow("type Response = boolean");
    expect(validateCTag(jsonCTag(bool(true)), [schema])).toMatch({
      errors: [],
    });
  });

  it("accepts an integer for an int type", () => {
    const schema = parseSchemaOrThrow(
      "type Int = number\ntype Response = { count: Int; };",
    );
    expect(validateCTag(jsonCTag(obj([["count", num(42)]])), [schema])).toMatch(
      { errors: [] },
    );
  });

  it("accepts a negative integer for an int type", () => {
    const schema = parseSchemaOrThrow(
      "type Int = number\ntype Response = { count: Int; };",
    );
    expect(validateCTag(jsonCTag(obj([["count", num(-7)]])), [schema])).toMatch(
      { errors: [] },
    );
  });

  it("accepts a float for an integer type", () => {
    const schema = parseSchemaOrThrow(
      "type Int = number\ntype Response = { count: Int; };",
    );
    expect(
      validateCTag(jsonCTag(obj([["count", num(3.14)]])), [schema]),
    ).toMatch({ errors: [] });
  });

  it("accepts an object matching an interface", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { name: string; age: number; };",
    );
    expect(
      validateCTag(
        jsonCTag(
          obj([
            ["name", str("Alice")],
            ["age", num(30)],
          ]),
        ),
        [schema],
      ),
    ).toMatch({ errors: [] });
  });

  it("accepts an object when an optional field is absent", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { name: string; nickname?: string; };",
    );
    expect(
      validateCTag(jsonCTag(obj([["name", str("Alice")]])), [schema]),
    ).toMatch({ errors: [] });
  });

  it("accepts an empty object for an all-optional interface", () => {
    const schema = parseSchemaOrThrow("type Response = { name?: string; };");
    expect(validateCTag(jsonCTag(obj([])), [schema])).toMatch({
      errors: [],
    });
  });

  it("accepts an array of strings for a string array type", () => {
    const schema = parseSchemaOrThrow("type Response = string[]");
    expect(validateCTag(jsonCTag(arr([str("a"), str("b")])), [schema])).toMatch(
      { errors: [] },
    );
  });

  it("accepts an empty array for an array type", () => {
    const schema = parseSchemaOrThrow("type Response = string[]");
    expect(validateCTag(jsonCTag(arr([])), [schema])).toMatch({
      errors: [],
    });
  });

  it("accepts an object with ellipsis against an interface", () => {
    const schema = parseSchemaOrThrow("type Response = { name: string; };");
    expect(validateCTag(jsonCTag(obj([], true)), [schema])).toMatch({
      errors: [],
    });
  });

  it("accepts the exact string for a string-literal type", () => {
    const schema = parseSchemaOrThrow('type Response = {status: "ok"}');
    expect(
      validateCTag(jsonCTag(obj([["status", str("ok")]])), [schema]),
    ).toMatch({ errors: [] });
  });

  it("accepts a matching value from a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "pending" | "done"');
    expect(validateCTag(jsonCTag(str("done")), [schema])).toMatch({
      errors: [],
    });
  });

  it("accepts a matching member of an interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Cat = { kind: "cat"; name: string; }; type Dog = { kind: "dog"; breed: string; }; type Response = Cat | Dog',
    );
    expect(
      validateCTag(
        jsonCTag(
          obj([
            ["kind", str("cat")],
            ["name", str("Whiskers")],
          ]),
        ),
        [schema],
      ),
    ).toMatch({ errors: [] });
  });
});

// ---------------------------------------------------------------------------
// JSON examples - no close match (score < 0.5) → single error
// ---------------------------------------------------------------------------

describe("validateExample - json: no close match", () => {
  it("returns a single error when a number is given for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    expect(validateCTag(jsonCTag(num(42)), [schema])).toMatch({
      errors: [
        { message: "Does not match any of the types defined in the schema" },
      ],
    });
  });

  it("returns a single error when a boolean is given for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    expect(validateCTag(jsonCTag(bool(false)), [schema])).toMatch({
      errors: [
        { message: "Does not match any of the types defined in the schema" },
      ],
    });
  });

  it("returns a single error when a number is given for a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "a" | "b"');
    expect(validateCTag(jsonCTag(num(1)), [schema])).toMatch({
      errors: [
        { message: "Does not match any of the types defined in the schema" },
      ],
    });
  });

  it("returns a single error when a number is given for an interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Cat = { kind: "cat"; }; type Dog = { kind: "dog"; }; type Response = Cat | Dog',
    );
    expect(validateCTag(jsonCTag(num(1)), [schema])).toMatch({
      errors: [
        { message: "Does not match any of the types defined in the schema" },
      ],
    });
  });

  it("returns a single error when the kind field is missing from an object for an interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Cat = { kind: "cat"; }; type Dog = { kind: "dog"; }; type Response = Cat | Dog',
    );
    expect(
      validateCTag(jsonCTag(obj([["name", str("Felix")]])), [schema]),
    ).toMatch({
      errors: [
        { message: "Does not match any of the types defined in the schema" },
      ],
    });
  });

  it("returns a single error when the kind field is not a string in an interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Response = { kind: "cat" } | { kind: "dog" }',
    );
    expect(validateCTag(jsonCTag(obj([["kind", num(42)]])), [schema])).toMatch({
      errors: [
        { message: "Does not match any of the types defined in the schema" },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// JSON examples - close match (score >= 0.5) → two errors
// ---------------------------------------------------------------------------

describe("validateExample - json: close match", () => {
  it("returns 2 errors for an object with a wrong-typed field", () => {
    const schema = parseSchemaOrThrow("type Response = { name: string; };");
    expect(validateCTag(jsonCTag(obj([["name", num(42)]])), [schema])).toMatch({
      errors: [
        { message: "Does not match type 'Response'" },
        { message: "Expected string but got number" },
      ],
    });
  });

  it("returns 2 errors for a string not present in a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "a" | "b"');
    expect(validateCTag(jsonCTag(str("c")), [schema])).toMatch({
      errors: [
        { message: "Does not match type 'Response'" },
        { message: 'Expected one of ["a","b"]' },
      ],
    });
  });

  it("returns 2 errors for an unknown kind value in an interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Response = { kind: "cat" } | { kind: "dog" }',
    );
    expect(
      validateCTag(jsonCTag(obj([["kind", str("fish")]])), [schema]),
    ).toMatch({
      errors: [
        { message: "Does not match type 'Response'" },
        { message: 'Expected one of ["cat","dog"]' },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// JSON examples - multi-type schema
// ---------------------------------------------------------------------------

describe("validateExample - json: multi-type schema", () => {
  it("accepts json that matches a non-root type in the schema", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { item: Detail }; type Detail = { x: string; };",
    );
    expect(
      validateCTag(jsonCTag(obj([["x", str("hello")]])), [schema]),
    ).toMatch({ errors: [] });
  });

  it("picks the best-matching type when reporting errors", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { item: Detail }; type Detail = { x: string; };",
    );
    expect(validateCTag(jsonCTag(obj([["x", num(42)]])), [schema])).toMatch({
      errors: [
        { message: "Does not match type 'Detail'" },
        { message: "Expected string but got number" },
      ],
    });
  });

  it("accepts json that matches any type in a multi-schema array", () => {
    const schema1 = parseSchemaOrThrow("type A = string");
    const schema2 = parseSchemaOrThrow("type B = number");
    expect(validateCTag(jsonCTag(num(1)), [schema1, schema2])).toMatch({
      errors: [],
    });
  });

  it("checks identifiers across all schemas in the array", () => {
    const schema1 = parseSchemaOrThrow("type A = { foo: string }");
    const schema2 = parseSchemaOrThrow("type B = { bar: number }");
    expect(validateCTag(identifierCTag("bar"), [schema1, schema2])).toMatch({
      errors: [],
    });
  });

  it("reports error when identifier is absent from all schemas", () => {
    const schema1 = parseSchemaOrThrow("type A = { foo: string }");
    const schema2 = parseSchemaOrThrow("type B = { bar: number }");
    expect(validateCTag(identifierCTag("baz"), [schema1, schema2])).toMatch({
      errors: [
        {
          message: "Identifier 'baz' not found in schema",
          suggestions: ["foo", "bar"],
        },
      ],
    });
  });
});
