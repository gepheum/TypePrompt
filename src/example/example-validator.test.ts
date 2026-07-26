import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type {
  JsonArray,
  JsonBoolean,
  JsonNumber,
  JsonObject,
  JsonString,
  JsonValue,
} from "../json/json-types.js";
import { parseSchema } from "../schema/schema-parser.js";
import type { Schema, SchemaParseContext } from "../schema/schema-types.js";
import type { Span } from "../util/shared-types.js";
import type { Example } from "./example-types.js";
import { validateExample, validateJson } from "./example-validator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEMPLATE: SchemaParseContext = { kind: "template", argTypeNames: [] };

function parseSchemaOrThrow(
  source: string,
  context: SchemaParseContext = TEMPLATE,
): Schema {
  const result = parseSchema(source, context);
  if (result.kind !== "success") {
    throw new Error(
      `Schema parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result;
}

function span(text: string): Span {
  return { text, start: 0, end: text.length };
}

function str(value: string): JsonString {
  return { kind: "string", firstToken: span(`"${value}"`), value };
}

function num(value: number): JsonNumber {
  return { kind: "number", firstToken: span(String(value)), value };
}

function bool(value: boolean): JsonBoolean {
  return { kind: "boolean", firstToken: span(String(value)), value };
}

function obj(
  entries: [string, JsonValue<"loose">][],
  ellipsis = false,
): JsonObject<"loose"> {
  return {
    kind: "object",
    firstToken: span("{"),
    entries: entries.map(([key, value]) => ({ key: str(key), value })),
    ...(ellipsis
      ? { ellipsis: { kind: "ellipsis" as const, firstToken: span("...") } }
      : {}),
  };
}

function arr(elements: JsonValue<"loose">[]): JsonArray<"loose"> {
  return { kind: "array", firstToken: span("["), elements };
}

function jsonExample(json: JsonValue<"loose">): Example {
  return { kind: "success:json", json };
}

function identifierExample(text: string): Example {
  return { kind: "success:identifier", identifier: span(text) };
}

// ---------------------------------------------------------------------------
// Identifier examples
// ---------------------------------------------------------------------------

describe("validateExample – identifier", () => {
  it("accepts an identifier that is a known field name", () => {
    const schema = parseSchemaOrThrow("interface Response { name: string; }");
    expect(validateExample(identifierExample("name"), schema)).toMatch([]);
  });

  it("rejects an unknown identifier", () => {
    const schema = parseSchemaOrThrow("interface Response { name: string; }");
    expect(validateExample(identifierExample("unknown"), schema)).toMatch([
      { message: "Identifier 'unknown' not found in schema" },
    ]);
  });

  it("accepts a string-literal union value as an identifier", () => {
    const schema = parseSchemaOrThrow('type Response = "active" | "inactive"');
    expect(validateExample(identifierExample("active"), schema)).toMatch([]);
  });
});

// ---------------------------------------------------------------------------
// JSON examples – exact match
// ---------------------------------------------------------------------------

describe("validateExample – json: exact match", () => {
  it("accepts a string for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    expect(validateExample(jsonExample(str("hello")), schema)).toMatch([]);
  });

  it("accepts a number for a number type", () => {
    const schema = parseSchemaOrThrow("type Response = number");
    expect(validateExample(jsonExample(num(3.14)), schema)).toMatch([]);
  });

  it("accepts a boolean for a boolean type", () => {
    const schema = parseSchemaOrThrow("type Response = boolean");
    expect(validateExample(jsonExample(bool(true)), schema)).toMatch([]);
  });

  it("accepts an integer for an int type", () => {
    const schema = parseSchemaOrThrow(
      "type Int = number\ninterface Response { count: Int; }",
    );
    expect(
      validateExample(jsonExample(obj([["count", num(42)]])), schema),
    ).toMatch([]);
  });

  it("accepts a negative integer for an int type", () => {
    const schema = parseSchemaOrThrow(
      "type Int = number\ninterface Response { count: Int; }",
    );
    expect(
      validateExample(jsonExample(obj([["count", num(-7)]])), schema),
    ).toMatch([]);
  });

  it("accepts a float for an integer type", () => {
    const schema = parseSchemaOrThrow(
      "type Int = number\ninterface Response { count: Int; }",
    );
    expect(
      validateExample(jsonExample(obj([["count", num(3.14)]])), schema),
    ).toMatch([]);
  });

  it("accepts an object matching an interface", () => {
    const schema = parseSchemaOrThrow(
      "interface Response { name: string; age: number; }",
    );
    expect(
      validateExample(
        jsonExample(
          obj([
            ["name", str("Alice")],
            ["age", num(30)],
          ]),
        ),
        schema,
      ),
    ).toMatch([]);
  });

  it("accepts an object when an optional field is absent", () => {
    const schema = parseSchemaOrThrow(
      "interface Response { name: string; nickname?: string; }",
    );
    expect(
      validateExample(jsonExample(obj([["name", str("Alice")]])), schema),
    ).toMatch([]);
  });

  it("accepts an empty object for an all-optional interface", () => {
    const schema = parseSchemaOrThrow("interface Response { name?: string; }");
    expect(validateExample(jsonExample(obj([])), schema)).toMatch([]);
  });

  it("accepts an array of strings for a string array type", () => {
    const schema = parseSchemaOrThrow("type Response = string[]");
    expect(
      validateExample(jsonExample(arr([str("a"), str("b")])), schema),
    ).toMatch([]);
  });

  it("accepts an empty array for an array type", () => {
    const schema = parseSchemaOrThrow("type Response = string[]");
    expect(validateExample(jsonExample(arr([])), schema)).toMatch([]);
  });

  it("accepts an object with ellipsis against an interface", () => {
    const schema = parseSchemaOrThrow("interface Response { name: string; }");
    expect(validateExample(jsonExample(obj([], true)), schema)).toMatch([]);
  });

  it("accepts the exact string for a string-literal type", () => {
    const schema = parseSchemaOrThrow('type Response = "ok"');
    expect(validateExample(jsonExample(str("ok")), schema)).toMatch([]);
  });

  it("accepts a matching value from a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "pending" | "done"');
    expect(validateExample(jsonExample(str("done")), schema)).toMatch([]);
  });

  it("accepts a matching member of an interface union", () => {
    const schema = parseSchemaOrThrow(
      'interface Cat { kind: "cat"; name: string; } interface Dog { kind: "dog"; breed: string; } type Response = Cat | Dog',
    );
    expect(
      validateExample(
        jsonExample(
          obj([
            ["kind", str("cat")],
            ["name", str("Whiskers")],
          ]),
        ),
        schema,
      ),
    ).toMatch([]);
  });
});

// ---------------------------------------------------------------------------
// JSON examples – no close match (score < 0.5) → single error
// ---------------------------------------------------------------------------

describe("validateExample – json: no close match", () => {
  it("returns a single error when a number is given for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    expect(validateExample(jsonExample(num(42)), schema)).toMatch([
      { message: "Does not match any of the types defined in the schema" },
    ]);
  });

  it("returns a single error when a boolean is given for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    expect(validateExample(jsonExample(bool(false)), schema)).toMatch([
      { message: "Does not match any of the types defined in the schema" },
    ]);
  });

  it("returns a single error when a number is given for a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "a" | "b"');
    expect(validateExample(jsonExample(num(1)), schema)).toMatch([
      { message: "Does not match any of the types defined in the schema" },
    ]);
  });

  it("returns a single error when a number is given for an interface union", () => {
    const schema = parseSchemaOrThrow(
      'interface Cat { kind: "cat"; } interface Dog { kind: "dog"; } type Response = Cat | Dog',
    );
    expect(validateExample(jsonExample(num(1)), schema)).toMatch([
      { message: "Does not match any of the types defined in the schema" },
    ]);
  });

  it("returns a single error when the kind field is missing from an object for an interface union", () => {
    const schema = parseSchemaOrThrow(
      'interface Cat { kind: "cat"; } interface Dog { kind: "dog"; } type Response = Cat | Dog',
    );
    expect(
      validateExample(jsonExample(obj([["name", str("Felix")]])), schema),
    ).toMatch([
      { message: "Does not match any of the types defined in the schema" },
    ]);
  });

  it("returns a single error when the kind field is not a string in an interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Response = { kind: "cat" } | { kind: "dog" }',
    );
    expect(
      validateExample(jsonExample(obj([["kind", num(42)]])), schema),
    ).toMatch([
      { message: "Does not match any of the types defined in the schema" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// JSON examples – close match (score >= 0.5) → two errors
// ---------------------------------------------------------------------------

describe("validateExample – json: close match", () => {
  it("returns 2 errors for an object with a wrong-typed field", () => {
    const schema = parseSchemaOrThrow("interface Response { name: string; }");
    expect(
      validateExample(jsonExample(obj([["name", num(42)]])), schema),
    ).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Expected string but got number" },
    ]);
  });

  it("returns 2 errors for a string not present in a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "a" | "b"');
    expect(validateExample(jsonExample(str("c")), schema)).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Not found in union type" },
    ]);
  });

  it("returns 2 errors for an unknown kind value in an interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Response = { kind: "cat" } | { kind: "dog" }',
    );
    expect(
      validateExample(jsonExample(obj([["kind", str("fish")]])), schema),
    ).toMatch([
      { message: "Does not match type 'Response'" },
      { message: 'No matching member for value "fish"' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// JSON examples – multi-type schema
// ---------------------------------------------------------------------------

describe("validateExample – json: multi-type schema", () => {
  it("accepts json that matches a non-root type in the schema", () => {
    // schema.types contains both Response and Detail; json matches Detail
    const schema = parseSchemaOrThrow(
      "interface Response { item: Detail } interface Detail { x: string; }",
    );
    expect(
      validateExample(jsonExample(obj([["x", str("hello")]])), schema),
    ).toMatch([]);
  });

  it("picks the best-matching type when reporting errors", () => {
    // {"x": 42} matches Detail partially (score 0.5) and Response not at all (score 0)
    const schema = parseSchemaOrThrow(
      "interface Response { item: Detail } interface Detail { x: string; }",
    );
    expect(validateExample(jsonExample(obj([["x", num(42)]])), schema)).toMatch(
      [
        { message: "Does not match type 'Detail'" },
        { message: "Expected string but got number" },
      ],
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers for strict-mode JSON values
// ---------------------------------------------------------------------------

function objStrict(
  entries: [string, JsonValue<"strict">][],
): JsonObject<"strict"> {
  return {
    kind: "object",
    firstToken: span("{"),
    entries: entries.map(([key, value]) => ({ key: str(key), value })),
  };
}

function arrStrict(elements: JsonValue<"strict">[]): JsonArray<"strict"> {
  return { kind: "array", firstToken: span("["), elements };
}

// ---------------------------------------------------------------------------
// validateJson – exact match
// ---------------------------------------------------------------------------

describe("validateJson – exact match", () => {
  it("accepts a string for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(str("hello"), schema, type)).toMatch([]);
  });

  it("accepts a number for a number type", () => {
    const schema = parseSchemaOrThrow("type Response = number");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(3.14), schema, type)).toMatch([]);
  });

  it("accepts a boolean for a boolean type", () => {
    const schema = parseSchemaOrThrow("type Response = boolean");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(bool(true), schema, type)).toMatch([]);
  });

  it("accepts an integer for an int type", () => {
    const schema = parseSchemaOrThrow(
      "type Int = number\ninterface Response { count: Int; }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([["count", num(42)]]), schema, type)).toMatch(
      [],
    );
  });

  it("accepts a float for an integer type", () => {
    const schema = parseSchemaOrThrow(
      "type Int = number\ninterface Response { count: Int; }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["count", num(3.14)]]), schema, type),
    ).toMatch([]);
  });

  it("accepts an object matching an interface", () => {
    const schema = parseSchemaOrThrow(
      "interface Response { name: string; age: number; }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(
        objStrict([
          ["name", str("Alice")],
          ["age", num(30)],
        ]),
        schema,
        type,
      ),
    ).toMatch([]);
  });

  it("accepts an object when an optional field is absent", () => {
    const schema = parseSchemaOrThrow(
      "interface Response { name: string; nickname?: string; }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["name", str("Alice")]]), schema, type),
    ).toMatch([]);
  });

  it("accepts an array of strings for a string array type", () => {
    const schema = parseSchemaOrThrow("type Response = string[]");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(arrStrict([str("a"), str("b")]), schema, type)).toMatch(
      [],
    );
  });

  it("accepts the exact string for a string-literal type", () => {
    const schema = parseSchemaOrThrow('type Response = "ok"');
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(str("ok"), schema, type)).toMatch([]);
  });

  it("accepts a matching value from a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "pending" | "done"');
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(str("done"), schema, type)).toMatch([]);
  });

  it("accepts a matching member of an interface union", () => {
    const schema = parseSchemaOrThrow(
      'interface Cat { kind: "cat"; name: string; } interface Dog { kind: "dog"; breed: string; } type Response = Cat | Dog',
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(
        objStrict([
          ["kind", str("cat")],
          ["name", str("Whiskers")],
        ]),
        schema,
        type,
      ),
    ).toMatch([]);
  });

  it("validates against a non-root named type", () => {
    const schema = parseSchemaOrThrow(
      "interface Response { item: Detail } interface Detail { x: string; }",
    );
    const type = schema.typeDeclarations["Detail"]!;
    expect(validateJson(objStrict([["x", str("hi")]]), schema, type)).toMatch(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// validateJson – mismatch: no close match → single error
// ---------------------------------------------------------------------------

describe("validateJson – mismatch: no close match", () => {
  it("returns a single error when a number is given for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(42), schema, type)).toMatch([
      { message: "Does not match type 'Response'" },
    ]);
  });

  it("returns a single error when an object is given for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([]), schema, type)).toMatch([
      { message: "Does not match type 'Response'" },
    ]);
  });

  it("returns a single error when a number is given for a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "a" | "b"');
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(1), schema, type)).toMatch([
      { message: "Does not match type 'Response'" },
    ]);
  });

  it("returns a single error when the kind field is missing for an interface union", () => {
    const schema = parseSchemaOrThrow(
      'interface Cat { kind: "cat"; } interface Dog { kind: "dog"; } type Response = Cat | Dog',
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["name", str("Felix")]]), schema, type),
    ).toMatch([{ message: "Does not match type 'Response'" }]);
  });
});

// ---------------------------------------------------------------------------
// validateJson – mismatch: close match → two errors
// ---------------------------------------------------------------------------

describe("validateJson – mismatch: close match", () => {
  it("returns 2 errors for an object with a wrong-typed field", () => {
    const schema = parseSchemaOrThrow("interface Response { name: string; }");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([["name", num(42)]]), schema, type)).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Expected string but got number" },
    ]);
  });

  it("returns 2 errors for a string not in a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "a" | "b"');
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(str("c"), schema, type)).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Not found in union type" },
    ]);
  });

  it("returns 2 errors for an unknown kind value in an interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Response = { kind: "cat" } | { kind: "dog" }',
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["kind", str("fish")]]), schema, type),
    ).toMatch([
      { message: "Does not match type 'Response'" },
      { message: 'No matching member for value "fish"' },
    ]);
  });

  it("returns 2 errors for a missing required field", () => {
    const schema = parseSchemaOrThrow(
      "interface Response { name: string; age: number; }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["name", str("Alice")]]), schema, type),
    ).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Missing required field 'age'" },
    ]);
  });
});
