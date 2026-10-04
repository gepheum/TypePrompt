import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseSchema } from "../schema/schema-parser.js";
import type {
  Array as ArrayType,
  BooleanLiteral,
  Interface,
  PrimitiveType,
  RecordType,
  Schema,
  StringLiteral,
  SyntheticType,
} from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import { resolveType } from "../schema/type-resolver.js";
import type { MappedText, Span, TextSpan } from "../util/shared-types.js";
import type {
  JsonArray,
  JsonBoolean,
  JsonEllipsis,
  JsonNull,
  JsonNumber,
  JsonObject,
  JsonString,
  LooseJsonValue,
  StrictJsonValue,
} from "./json-types.js";
import { jsonMatchesType, validateJson } from "./json-validator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSchemaOrThrow(source: string, path = "schema.ts"): Schema {
  const textNode: MappedText = {
    path,
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const schemaParseResult = parseSchema(textNode);
  if (schemaParseResult.kind !== "success") {
    throw new Error(
      `Schema parse failed: ${JSON.stringify(schemaParseResult)}`,
    );
  }
  const schema = validateSchema(schemaParseResult, {
    kind: "namespace",
  });
  if (schema.kind !== "success") {
    throw new Error(`Schema validation failed: ${JSON.stringify(schema)}`);
  }
  return schema;
}

function span(text: string): Span {
  return { start: 0, end: text.length, path: "" };
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

function nullVal(): JsonNull {
  return { kind: "null", firstToken: span("null") };
}

function objStrict(entries: [string, StrictJsonValue][]): JsonObject<"strict"> {
  return {
    kind: "object",
    firstToken: span("{"),
    entries: Object.fromEntries(
      entries.map(([key, value]) => [key, { key: str(key), value }]),
    ),
  };
}

function arrStrict(elements: StrictJsonValue[]): JsonArray<"strict"> {
  return { kind: "array", firstToken: span("["), elements };
}

function safeCast(strictValue: StrictJsonValue): LooseJsonValue {
  return strictValue as LooseJsonValue;
}

const EMPTY_VIEW = {
  typeDeclarations: {},
  sharedDeclarations: {},
  unionToMembers: new Map(),
} as unknown as Schema;

function textSpan<T extends string>(text: T): TextSpan<T> {
  return { text, start: 0, end: text.length, path: "" };
}

const ELLIPSIS: LooseJsonValue = {
  kind: "ellipsis",
  firstToken: { start: 0, end: 3, path: "" },
};

function primType(
  text: "string" | "number" | "boolean" | "integer",
): PrimitiveType {
  return {
    kind: "primitive",
    primitive: textSpan(text),
  };
}

function litType(value: string): StringLiteral {
  return {
    kind: "string-literal",
    value,
    quotedName: textSpan(`"${value}"`),
  };
}

function boolLitType(value: boolean): BooleanLiteral {
  const text = String(value) as "true" | "false";
  return {
    kind: "boolean-literal",
    span: textSpan(text),
    value,
  };
}

function ifaceType(
  fields: Record<
    string,
    { optional?: boolean; text: "string" | "number" | "boolean" | "integer" }
  >,
): Interface {
  return {
    kind: "interface",
    leftCurlyBracket: { start: 0, end: 1, path: "" },
    fields: Object.fromEntries(
      Object.entries(fields).map(([name, { optional = false, text }]) => [
        name,
        {
          name: textSpan(name),
          type: optional
            ? { kind: "optional", innerType: primType(text) }
            : primType(text),
          doc: "",
        },
      ]),
    ),
  };
}

function recordType(
  valueText: "string" | "number" | "boolean" | "integer",
): RecordType {
  return {
    kind: "record",
    leftCurlyBracket: { start: 0, end: 1, path: "" },
    keyName: "key",
    valueType: primType(valueText),
  };
}

// ---------------------------------------------------------------------------
// validateJson - exact match
// ---------------------------------------------------------------------------

describe("validateJson - exact match", () => {
  it("accepts a string for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(str("hello"), type, schema)).toMatch([]);
  });

  it("accepts a number for a number type", () => {
    const schema = parseSchemaOrThrow("type Response = number");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(3.14), type, schema)).toMatch([]);
  });

  it("accepts a boolean for a boolean type", () => {
    const schema = parseSchemaOrThrow("type Response = boolean");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(bool(true), type, schema)).toMatch([]);
  });

  it("accepts an integer for a number type", () => {
    const schema = parseSchemaOrThrow("type Response = { count: number; };");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([["count", num(42)]]), type, schema)).toMatch(
      [],
    );
  });

  it("accepts a float for a number type", () => {
    const schema = parseSchemaOrThrow("type Response = { count: number; };");
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["count", num(3.14)]]), type, schema),
    ).toMatch([]);
  });

  it("accepts an in-range integer for an integer type", () => {
    const schema = parseSchemaOrThrow("type Response = integer");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(42), type, schema)).toMatch([]);
  });

  it("accepts a number for an any type", () => {
    const schema = parseSchemaOrThrow("type Response = any");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(1), type, schema)).toMatch([]);
  });

  it("accepts a string for an any type", () => {
    const schema = parseSchemaOrThrow("type Response = any");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(str("x"), type, schema)).toMatch([]);
  });

  it("accepts an object for an any type", () => {
    const schema = parseSchemaOrThrow("type Response = any");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([]), type, schema)).toMatch([]);
  });

  it("accepts a boolean matching a boolean-literal type", () => {
    const schema = parseSchemaOrThrow("type Response = {status: true}");
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["status", bool(true)]]), type, schema),
    ).toMatch([]);
  });

  it("accepts a matching record value", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { [key: string]: number }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(
        objStrict([
          ["a", num(1)],
          ["b", num(2)],
        ]),
        type,
        schema,
      ),
    ).toMatch([]);
  });

  it("accepts an object matching an interface", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { name: string; age: number; };",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(
        objStrict([
          ["name", str("Alice")],
          ["age", num(30)],
        ]),
        type,
        schema,
      ),
    ).toMatch([]);
  });

  it("accepts an object when an optional field is absent", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { name: string; nickname?: string; };",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["name", str("Alice")]]), type, schema),
    ).toMatch([]);
  });

  it("accepts an array of strings for a string array type", () => {
    const schema = parseSchemaOrThrow("type Response = string[]");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(arrStrict([str("a"), str("b")]), type, schema)).toMatch(
      [],
    );
  });

  it("accepts the exact string for a string-literal type", () => {
    const schema = parseSchemaOrThrow('type Response = {status: "ok"}');
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["status", str("ok")]]), type, schema),
    ).toMatch([]);
  });

  it("accepts a matching value from a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "pending" | "done"');
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(str("done"), type, schema)).toMatch([]);
  });

  it("accepts a matching member of an interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Cat = { kind: "cat"; name: string; }; type Dog = { kind: "dog"; breed: string; }; type Response = Cat | Dog',
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(
        objStrict([
          ["kind", str("cat")],
          ["name", str("Whiskers")],
        ]),
        type,
        schema,
      ),
    ).toMatch([]);
  });

  it("validates against a non-root named type", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { item: Detail }; type Detail = { x: string; };",
    );
    const type = schema.typeDeclarations["Detail"]!;
    expect(validateJson(objStrict([["x", str("hi")]]), type, schema)).toMatch(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// validateJson - mismatch
// ---------------------------------------------------------------------------

describe("validateJson - mismatch", () => {
  it("returns an error when a number is given for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(42), type, schema)).toMatch([
      { message: "Expected string but got number" },
    ]);
  });

  it("returns an error when an object is given for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([]), type, schema)).toMatch([
      { message: "Expected string but got object" },
    ]);
  });

  it("returns an error when a number is given for a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "a" | "b"');
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(1), type, schema)).toMatch([
      { message: "Expected string but got number" },
    ]);
  });

  it("returns an error when the discriminator field is missing", () => {
    const schema = parseSchemaOrThrow(
      'type Cat = { kind: "cat"; }; type Dog = { kind: "dog"; }; type Response = Cat | Dog',
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["name", str("Felix")]]), type, schema),
    ).toMatch([{ message: "Missing required field 'kind'" }]);
  });

  it("returns an error for an object with a wrong-typed field", () => {
    const schema = parseSchemaOrThrow("type Response = { name: string; };");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([["name", num(42)]]), type, schema)).toMatch([
      { message: "Expected string but got number" },
    ]);
  });

  it("returns an error for a string not in a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "a" | "b"');
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(str("c"), type, schema)).toMatch([
      {
        message: 'Expected one of ["a","b"]',
        suggestions: ['"a"', '"b"'],
      },
    ]);
  });

  it("returns an error for an unknown discriminant value in an interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Response = { kind: "cat" } | { kind: "dog" }',
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["kind", str("fish")]]), type, schema),
    ).toMatch([
      {
        message: 'Expected one of ["cat","dog"]',
        suggestions: ['"cat"', '"dog"'],
      },
    ]);
  });

  it("returns an error for a missing required field", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { name: string; age: number; };",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["name", str("Alice")]]), type, schema),
    ).toMatch([{ message: "Missing required field 'age'" }]);
  });

  it("returns multiple errors when an object has multiple invalid/missing fields", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { name: string; age: number; score: number; };",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(
        objStrict([
          ["name", num(42)],
          ["age", str("bad")],
        ]),
        type,
        schema,
      ),
    ).toMatch([
      { message: "Expected string but got number" },
      { message: "Expected number but got string" },
      { message: "Missing required field 'score'" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// validateJson - integer type
// ---------------------------------------------------------------------------

describe("validateJson - integer type", () => {
  it("accepts an in-range integer number", () => {
    const schema = parseSchemaOrThrow("type Response = integer");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(42), type, schema)).toMatch([]);
  });

  it("accepts lower boundary -2147483648", () => {
    const schema = parseSchemaOrThrow("type Response = integer");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(-2147483648), type, schema)).toMatch([]);
  });

  it("accepts upper boundary 2147483647", () => {
    const schema = parseSchemaOrThrow("type Response = integer");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(2147483647), type, schema)).toMatch([]);
  });

  it("rejects a float with a close-match error", () => {
    const schema = parseSchemaOrThrow("type Response = integer");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(3.14), type, schema)).toMatch([
      { message: "Expected int but got float" },
    ]);
  });

  it("rejects an out-of-range integer with the same close-match error", () => {
    const schema = parseSchemaOrThrow("type Response = integer");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(2147483648), type, schema)).toMatch([
      { message: "Expected int but got float" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// validateJson - boolean-literal type
// ---------------------------------------------------------------------------

describe("validateJson - boolean-literal type", () => {
  it("accepts the matching boolean value", () => {
    const schema = parseSchemaOrThrow("type Response = {status: false}");
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["status", bool(false)]]), type, schema),
    ).toMatch([]);
  });

  it("rejects the opposite boolean value with suggestions", () => {
    const schema = parseSchemaOrThrow("type Response = { status: true }");
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["status", bool(false)]]), type, schema),
    ).toMatch([{ message: "Expected true", suggestions: ["true"] }]);
  });

  it("rejects a non-boolean with an error", () => {
    const schema = parseSchemaOrThrow("type Response = { status: true }");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([["status", num(1)]]), type, schema)).toMatch(
      [{ message: "Expected true", suggestions: ["true"] }],
    );
  });
});

// ---------------------------------------------------------------------------
// validateJson - record type
// ---------------------------------------------------------------------------

describe("validateJson - record type", () => {
  it("accepts an object whose values all match the record value type", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { [key: string]: number }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(
        objStrict([
          ["x", num(1)],
          ["y", num(2)],
        ]),
        type,
        schema,
      ),
    ).toMatch([]);
  });

  it("accepts an empty object for a record type", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { [key: string]: string }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([]), type, schema)).toMatch([]);
  });

  it("rejects a non-object with an error", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { [key: string]: number }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(str("oops"), type, schema)).toMatch([
      { message: "Expected object but got string" },
    ]);
  });

  it("rejects a wrong-typed record value with a close-match error", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { [key: string]: number }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([["x", str("bad")]]), type, schema)).toMatch([
      { message: "Expected number but got string" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// validateJson - interface extras
// ---------------------------------------------------------------------------

describe("validateJson - interface extras", () => {
  it("rejects an object with an unknown field and suggests missing fields", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { name: string; age?: number; };",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["nickname", str("Alice")]]), type, schema),
    ).toMatch([
      {
        message: "Unknown field 'nickname'",
        suggestions: ["name", "age"],
      },
      {
        message: "Missing required field 'name'",
      },
    ]);
  });

  it("rejects an unknown field with empty suggestions when all schema fields are present", () => {
    const schema = parseSchemaOrThrow("type Response = { name: string; };");
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(
        objStrict([
          ["name", str("Alice")],
          ["extra", num(1)],
        ]),
        type,
        schema,
      ),
    ).toMatch([
      {
        message: "Unknown field 'extra'",
        suggestions: [],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// validateJson - boolean-discriminated union
// ---------------------------------------------------------------------------

describe("validateJson - boolean-discriminated union", () => {
  it("accepts a matching member of a boolean-discriminated union", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { success: true; value: string } | { success: false; error: string }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(
        objStrict([
          ["success", bool(true)],
          ["value", str("ok")],
        ]),
        type,
        schema,
      ),
    ).toMatch([]);
  });

  it("rejects when the boolean discriminant is the wrong type", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { success: true; value: string } | { success: false; error: string }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["success", str("yes")]]), type, schema),
    ).toMatch([
      {
        message: "Expected boolean but got string",
        suggestions: ["true", "false"],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - result shape and mode
// ---------------------------------------------------------------------------

describe("jsonMatchesType - result shape and mode", () => {
  it("returns { kind: 'match' } on a successful match", () => {
    expect(
      jsonMatchesType(str("hi"), primType("string"), "thorough", EMPTY_VIEW),
    ).toMatch({ kind: "match" });
  });

  it("fast mode: mismatch returns { kind: 'mismatch' } without details", () => {
    expect(
      jsonMatchesType(num(1), primType("string"), "fast", EMPTY_VIEW),
    ).toMatch({ kind: "mismatch" });
  });

  it("thorough mode: mismatch includes reasons and matchScore", () => {
    expect(
      jsonMatchesType(num(1), primType("string"), "thorough", EMPTY_VIEW),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected string but got number" }],
        matchScore: 0,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - ellipsis value
// ---------------------------------------------------------------------------

describe("jsonMatchesType - ellipsis value", () => {
  it("ellipsis matches primitive string in thorough mode", () => {
    expect(
      jsonMatchesType(ELLIPSIS, primType("string"), "thorough", EMPTY_VIEW),
    ).toMatch({ kind: "match" });
  });

  it("ellipsis matches literal in thorough mode", () => {
    expect(
      jsonMatchesType(ELLIPSIS, litType("ok"), "thorough", EMPTY_VIEW),
    ).toMatch({ kind: "match" });
  });

  it("ellipsis matches interface in thorough mode", () => {
    expect(
      jsonMatchesType(
        ELLIPSIS,
        ifaceType({ name: { text: "string" } }),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({ kind: "match" });
  });

  it("ellipsis matches primitive number in fast mode", () => {
    expect(
      jsonMatchesType(ELLIPSIS, primType("number"), "fast", EMPTY_VIEW),
    ).toMatch({ kind: "match" });
  });

  it("a loose object with an ellipsis satisfies an interface even when required fields are absent", () => {
    const loosObj: LooseJsonValue = {
      kind: "object",
      firstToken: { start: 0, end: 1, path: "" },
      entries: {},
      ellipsis: ELLIPSIS as JsonEllipsis,
    };
    expect(
      jsonMatchesType(
        loosObj,
        ifaceType({ name: { text: "string" }, age: { text: "number" } }),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({ kind: "match" });
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - matchScore: Primitives and Literals
// ---------------------------------------------------------------------------

describe("jsonMatchesType - matchScore: Primitives and Literals", () => {
  it("string-literal: wrong string value → matchScore 0.5", () => {
    expect(
      jsonMatchesType(str("bad"), litType("ok"), "thorough", EMPTY_VIEW),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: 'Expected "ok"', suggestions: ['"ok"'] }],
        matchScore: 0.5,
      },
    });
  });

  it("string-literal: wrong kind → matchScore 0", () => {
    expect(
      jsonMatchesType(num(1), litType("ok"), "thorough", EMPTY_VIEW),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: 'Expected "ok"', suggestions: ['"ok"'] }],
        matchScore: 0,
      },
    });
  });

  it("boolean-literal: opposite value → matchScore 0.5", () => {
    expect(
      jsonMatchesType(bool(false), boolLitType(true), "thorough", EMPTY_VIEW),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected true", suggestions: ["true"] }],
        matchScore: 0.5,
      },
    });
  });

  it("boolean-literal: wrong kind → matchScore 0", () => {
    expect(
      jsonMatchesType(num(1), boolLitType(true), "thorough", EMPTY_VIEW),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected true", suggestions: ["true"] }],
        matchScore: 0,
      },
    });
  });

  it("primitive integer: float value → matchScore 0.5", () => {
    expect(
      jsonMatchesType(num(3.14), primType("integer"), "thorough", EMPTY_VIEW),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected int but got float" }],
        matchScore: 0.5,
      },
    });
  });

  it("primitive integer: out-of-range integer → matchScore 0.5", () => {
    expect(
      jsonMatchesType(
        num(2147483648),
        primType("integer"),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected int but got float" }],
        matchScore: 0.5,
      },
    });
  });

  it("primitive integer: string value → matchScore 0", () => {
    expect(
      jsonMatchesType(str("123"), primType("integer"), "thorough", EMPTY_VIEW),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected integer but got string" }],
        matchScore: 0,
      },
    });
  });

  it("primitive string: wrong kind → matchScore 0", () => {
    expect(
      jsonMatchesType(num(42), primType("string"), "thorough", EMPTY_VIEW),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected string but got number" }],
        matchScore: 0,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - matchScore: Unions
// ---------------------------------------------------------------------------

describe("jsonMatchesType - matchScore: Unions", () => {
  it("string union: non-matching string → matchScore 0.5", () => {
    const schema = parseSchemaOrThrow('type S = "a" | "b"');
    const unionType = schema.typeDeclarations["S"]!.valueType;
    expect(
      jsonMatchesType(str("c"), unionType as SyntheticType, "thorough", schema),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [
          {
            message: 'Expected one of ["a","b"]',
            suggestions: ['"a"', '"b"'],
          },
        ],
        matchScore: 0.5,
      },
    });
  });

  it("string union: wrong kind (number) → matchScore 0", () => {
    const schema = parseSchemaOrThrow('type S = "a" | "b"');
    const unionType = schema.typeDeclarations["S"]!.valueType;
    expect(
      jsonMatchesType(num(1), unionType as SyntheticType, "thorough", schema),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected string but got number" }],
        matchScore: 0,
      },
    });
  });

  it("discriminated union: missing discriminator field → matchScore 0", () => {
    const schema = parseSchemaOrThrow(
      'type Cat = { kind: "cat"; name: string }; type Dog = { kind: "dog"; name: string }; type Pet = Cat | Dog',
    );
    const petType = schema.typeDeclarations["Pet"]!.valueType;
    expect(
      jsonMatchesType(
        safeCast(objStrict([["name", str("Felix")]])),
        petType as SyntheticType,
        "thorough",
        schema,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Missing required field 'kind'" }],
        matchScore: 0,
      },
    });
  });

  it("discriminated union: wrong discriminator type → matchScore 0", () => {
    const schema = parseSchemaOrThrow(
      'type Cat = { kind: "cat" }; type Dog = { kind: "dog" }; type Pet = Cat | Dog',
    );
    const petType = schema.typeDeclarations["Pet"]!.valueType;
    expect(
      jsonMatchesType(
        safeCast(objStrict([["kind", num(123)]])),
        petType as SyntheticType,
        "thorough",
        schema,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [
          {
            message: "Expected string but got number",
            suggestions: ['"cat"', '"dog"'],
          },
        ],
        matchScore: 0,
      },
    });
  });

  it("discriminated union: unknown discriminant string → matchScore 0.5", () => {
    const schema = parseSchemaOrThrow(
      'type Cat = { kind: "cat" }; type Dog = { kind: "dog" }; type Pet = Cat | Dog',
    );
    const petType = schema.typeDeclarations["Pet"]!.valueType;
    expect(
      jsonMatchesType(
        safeCast(objStrict([["kind", str("bird")]])),
        petType as SyntheticType,
        "thorough",
        schema,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [
          {
            message: 'Expected one of ["cat","dog"]',
            suggestions: ['"cat"', '"dog"'],
          },
        ],
        matchScore: 0.5,
      },
    });
  });

  it("discriminated union: valid discriminant with child mismatch propagates member interface score", () => {
    const schema = parseSchemaOrThrow(
      'type Cat = { kind: "cat"; name: string; age: number }; type Dog = { kind: "dog"; breed: string }; type Pet = Cat | Dog',
    );
    const petType = schema.typeDeclarations["Pet"]!.valueType;
    expect(
      jsonMatchesType(
        safeCast(
          objStrict([
            ["kind", str("cat")],
            ["name", str("Felix")],
            ["age", str("bad")],
          ]),
        ),
        petType as SyntheticType,
        "thorough",
        schema,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected number but got string" }],
        matchScore: 5 / 6,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - matchScore: Interfaces
// ---------------------------------------------------------------------------

describe("jsonMatchesType - matchScore: Interfaces", () => {
  it("interface: 1 of 2 required fields has wrong type → matchScore 0.75", () => {
    expect(
      jsonMatchesType(
        safeCast(
          objStrict([
            ["name", str("Alice")],
            ["age", str("bad")],
          ]),
        ),
        ifaceType({ name: { text: "string" }, age: { text: "number" } }),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected number but got string" }],
        matchScore: 0.75,
      },
    });
  });

  it("interface: 1 of 2 required fields is missing → matchScore 2/3", () => {
    expect(
      jsonMatchesType(
        safeCast(objStrict([["name", str("Alice")]])),
        ifaceType({ name: { text: "string" }, age: { text: "number" } }),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Missing required field 'age'" }],
        matchScore: 2 / 3,
      },
    });
  });

  it("interface: empty object with missing required fields → matchScore 0", () => {
    expect(
      jsonMatchesType(
        safeCast(objStrict([])),
        ifaceType({ name: { text: "string" }, age: { text: "number" } }),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [
          { message: "Missing required field 'name'" },
          { message: "Missing required field 'age'" },
        ],
        matchScore: 0,
      },
    });
  });

  it("interface: valid required field plus unknown field → matchScore 2/3", () => {
    expect(
      jsonMatchesType(
        safeCast(
          objStrict([
            ["name", str("Alice")],
            ["extra", num(1)],
          ]),
        ),
        ifaceType({ name: { text: "string" } }),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Unknown field 'extra'", suggestions: [] }],
        matchScore: 2 / 3,
      },
    });
  });

  it("interface: unknown field includes missing required and optional fields in suggestions", () => {
    expect(
      jsonMatchesType(
        safeCast(
          objStrict([
            ["name", str("Alice")],
            ["extra", num(1)],
          ]),
        ),
        ifaceType({
          name: { text: "string" },
          age: { text: "number" },
          bio: { text: "string", optional: true },
        }),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [
          {
            message: "Unknown field 'extra'",
            suggestions: ["age", "bio"],
          },
          {
            message: "Missing required field 'age'",
          },
        ],
        matchScore: 0.5,
      },
    });
  });

  it("interface: 1 required and 1 optional field with wrong optional type → matchScore 2/3", () => {
    expect(
      jsonMatchesType(
        safeCast(
          objStrict([
            ["name", str("Alice")],
            ["nickname", num(123)],
          ]),
        ),
        ifaceType({
          name: { text: "string" },
          nickname: { text: "string", optional: true },
        }),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected string but got number" }],
        matchScore: 2 / 3,
      },
    });
  });

  it("interface: only optional fields with 1 valid and 1 invalid → matchScore 0.5", () => {
    expect(
      jsonMatchesType(
        safeCast(
          objStrict([
            ["a", str("ok")],
            ["b", num(123)],
          ]),
        ),
        ifaceType({
          a: { text: "string", optional: true },
          b: { text: "string", optional: true },
        }),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected string but got number" }],
        matchScore: 0.5,
      },
    });
  });

  it("interface: nested interface failure propagates partial score", () => {
    const schema = parseSchemaOrThrow(
      "type User = { name: string; age: number; }; type Wrapper = { user: User; };",
    );
    const wrapperType = schema.typeDeclarations["Wrapper"]!.valueType;
    expect(
      jsonMatchesType(
        safeCast(
          objStrict([
            [
              "user",
              objStrict([
                ["name", str("Alice")],
                ["age", str("bad")],
              ]),
            ],
          ]),
        ),
        resolveType(wrapperType, schema),
        "thorough",
        schema,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected number but got string" }],
        matchScore: 0.875,
      },
    });
  });

  it("interface: non-object value → matchScore 0", () => {
    expect(
      jsonMatchesType(
        str("not an object"),
        ifaceType({ name: { text: "string" } }),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected object but got string" }],
        matchScore: 0,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - matchScore: Records
// ---------------------------------------------------------------------------

describe("jsonMatchesType - matchScore: Records", () => {
  it("record: 2 entries, 1 match and 1 mismatch → matchScore 0.5", () => {
    expect(
      jsonMatchesType(
        safeCast(
          objStrict([
            ["a", str("hello")],
            ["b", num(123)],
          ]),
        ),
        recordType("string"),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected string but got number" }],
        matchScore: 0.5,
      },
    });
  });

  it("record: 1 entry with nested partial score 0.5 → matchScore 0.5", () => {
    const schema = parseSchemaOrThrow(
      'type Status = "ok" | "done"; type MyRec = {[key: string]: Status};',
    );
    const recType = schema.typeDeclarations["MyRec"]!.valueType;
    expect(
      jsonMatchesType(
        safeCast(objStrict([["a", str("wrong")]])),
        resolveType(recType, schema),
        "thorough",
        schema,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [
          {
            message: 'Expected one of ["ok","done"]',
            suggestions: ['"ok"', '"done"'],
          },
        ],
        matchScore: 0.5,
      },
    });
  });

  it("record: non-object value → matchScore 0", () => {
    expect(
      jsonMatchesType(
        safeCast(arrStrict([])),
        recordType("number"),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected object but got array" }],
        matchScore: 0,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - matchScore: Arrays
// ---------------------------------------------------------------------------

describe("jsonMatchesType - matchScore: Arrays", () => {
  it("array: 1 of 2 elements matches, second fails → matchScore 0.5", () => {
    const arrT: ArrayType = {
      kind: "array",
      elementType: primType("number"),
    };
    expect(
      jsonMatchesType(
        arrStrict([num(1), str("bad")]) as LooseJsonValue,
        arrT,
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected number but got string" }],
        matchScore: 0.5,
      },
    });
  });

  it("array: 1 of 3 elements matches, second fails → matchScore 2/3", () => {
    const arrT: ArrayType = {
      kind: "array",
      elementType: primType("number"),
    };
    expect(
      jsonMatchesType(
        arrStrict([num(1), str("bad"), num(3)]) as LooseJsonValue,
        arrT,
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected number but got string" }],
        matchScore: 2 / 3,
      },
    });
  });

  it("array: first element fails, second element matches → matchScore 0.5", () => {
    const arrT: ArrayType = {
      kind: "array",
      elementType: primType("number"),
    };
    expect(
      jsonMatchesType(
        arrStrict([str("bad"), num(1)]) as LooseJsonValue,
        arrT,
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected number but got string" }],
        matchScore: 0.5,
      },
    });
  });

  it("array of interfaces: partial score from failing element propagates", () => {
    const arrT: ArrayType = {
      kind: "array",
      elementType: ifaceType({
        name: { text: "string" },
        age: { text: "number" },
      }),
    };
    expect(
      jsonMatchesType(
        arrStrict([
          objStrict([
            ["name", str("Alice")],
            ["age", num(30)],
          ]),
          objStrict([
            ["name", str("Bob")],
            ["age", str("bad")],
          ]),
        ]) as LooseJsonValue,
        arrT,
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected number but got string" }],
        matchScore: 0.875,
      },
    });
  });

  it("array: non-array value → matchScore 0", () => {
    const arrT: ArrayType = {
      kind: "array",
      elementType: primType("number"),
    };
    expect(
      jsonMatchesType(safeCast(objStrict([])), arrT, "thorough", EMPTY_VIEW),
    ).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected array but got object" }],
        matchScore: 0,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - Optionals and Any
// ---------------------------------------------------------------------------

describe("jsonMatchesType - Optionals and Any", () => {
  it("optional matches null value", () => {
    const optType: SyntheticType = {
      kind: "optional",
      innerType: primType("string"),
    };
    expect(jsonMatchesType(nullVal(), optType, "thorough", EMPTY_VIEW)).toMatch(
      { kind: "match" },
    );
  });

  it("optional matches inner type when non-null", () => {
    const optType: SyntheticType = {
      kind: "optional",
      innerType: primType("string"),
    };
    expect(
      jsonMatchesType(str("hello"), optType, "thorough", EMPTY_VIEW),
    ).toMatch({ kind: "match" });
  });

  it("optional propagates mismatch details when non-null", () => {
    const optType: SyntheticType = {
      kind: "optional",
      innerType: primType("string"),
    };
    expect(jsonMatchesType(num(42), optType, "thorough", EMPTY_VIEW)).toMatch({
      kind: "mismatch",
      details: {
        reasons: [{ message: "Expected string but got number" }],
        matchScore: 0,
      },
    });
  });

  it("any type matches in fast mode", () => {
    const anyType: SyntheticType = { kind: "any" };
    expect(jsonMatchesType(num(42), anyType, "fast", EMPTY_VIEW)).toMatch({
      kind: "match",
    });
  });

  it("any type matches in thorough mode", () => {
    const anyType: SyntheticType = { kind: "any" };
    expect(
      jsonMatchesType(
        safeCast(objStrict([["x", str("y")]])),
        anyType,
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({ kind: "match" });
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - fast mode short-circuiting
// ---------------------------------------------------------------------------

describe("jsonMatchesType - fast mode short-circuit", () => {
  it("array: stops at first element mismatch", () => {
    const arrT: ArrayType = {
      kind: "array",
      elementType: primType("number"),
    };
    expect(
      jsonMatchesType(
        arrStrict([num(1), str("bad"), num(2)]) as LooseJsonValue,
        arrT,
        "fast",
        EMPTY_VIEW,
      ),
    ).toMatch({ kind: "mismatch" });
  });

  it("interface: stops at first field type mismatch", () => {
    expect(
      jsonMatchesType(
        safeCast(
          objStrict([
            ["name", num(42)],
            ["age", num(30)],
          ]),
        ),
        ifaceType({ name: { text: "string" }, age: { text: "number" } }),
        "fast",
        EMPTY_VIEW,
      ),
    ).toMatch({ kind: "mismatch" });
  });

  it("interface: stops on unknown field", () => {
    expect(
      jsonMatchesType(
        safeCast(objStrict([["extra", str("x")]])),
        ifaceType({ name: { text: "string" } }),
        "fast",
        EMPTY_VIEW,
      ),
    ).toMatch({ kind: "mismatch" });
  });

  it("record: stops at first value type mismatch", () => {
    expect(
      jsonMatchesType(
        safeCast(objStrict([["x", str("bad")]])),
        recordType("number"),
        "fast",
        EMPTY_VIEW,
      ),
    ).toMatch({ kind: "mismatch" });
  });

  it("boolean-literal: returns mismatch in fast mode", () => {
    expect(
      jsonMatchesType(bool(false), boolLitType(true), "fast", EMPTY_VIEW),
    ).toMatch({ kind: "mismatch" });
  });

  it("string-literal: returns mismatch in fast mode", () => {
    expect(
      jsonMatchesType(str("no"), litType("yes"), "fast", EMPTY_VIEW),
    ).toMatch({ kind: "mismatch" });
  });

  it("primitive: returns mismatch in fast mode", () => {
    expect(
      jsonMatchesType(str("no"), primType("number"), "fast", EMPTY_VIEW),
    ).toMatch({ kind: "mismatch" });
  });

  it("string union: returns mismatch in fast mode", () => {
    const schema = parseSchemaOrThrow('type S = "a" | "b"');
    const unionType = schema.typeDeclarations["S"]!.valueType;
    expect(
      jsonMatchesType(str("c"), unionType as SyntheticType, "fast", schema),
    ).toMatch({ kind: "mismatch" });
  });

  it("interface union: returns mismatch in fast mode", () => {
    const schema = parseSchemaOrThrow(
      'type Cat = { kind: "cat" }; type Dog = { kind: "dog" }; type Pet = Cat | Dog',
    );
    const petType = schema.typeDeclarations["Pet"]!.valueType;
    expect(
      jsonMatchesType(
        safeCast(objStrict([["kind", str("bird")]])),
        petType as SyntheticType,
        "fast",
        schema,
      ),
    ).toMatch({ kind: "mismatch" });
  });
});
