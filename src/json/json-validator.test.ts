import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseSchema } from "../schema/schema-parser.js";
import type {
  Array,
  BooleanLiteral,
  Interface,
  PrimitiveType,
  RecordType,
  Schema,
  StringLiteral,
  SyntheticType,
} from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import type { MappedText, Span } from "../util/shared-types.js";
import { joinTextNodes } from "../util/text-node-joiner.js";
import type {
  JsonArray,
  JsonBoolean,
  JsonEllipsis,
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

function parseSchemaOrThrow(source: string): Schema {
  const textNode: MappedText = joinTextNodes(
    [
      {
        text: source,
        offsetMap: [
          {
            textPosition: 0,
            sourcePosition: 0,
          },
        ],
      },
    ],
    0,
  );
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
  return { start: 0, end: text.length };
}

function str(value: string): JsonString {
  return { kind: "string", firstToken: span(`"${value};"`), value };
}

function num(value: number): JsonNumber {
  return { kind: "number", firstToken: span(String(value)), value };
}

function bool(value: boolean): JsonBoolean {
  return { kind: "boolean", firstToken: span(String(value)), value };
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

  it("accepts a value of any type for an any type", () => {
    const schema = parseSchemaOrThrow("type Response = any");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(1), type, schema)).toMatch([]);
    expect(validateJson(str("x"), type, schema)).toMatch([]);
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
  it("returns 2 errors when a number is given for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(42), type, schema)).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Expected string but got number" },
    ]);
  });

  it("returns 2 errors when an object is given for a string type", () => {
    const schema = parseSchemaOrThrow("type Response = string");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([]), type, schema)).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Expected string but got object" },
    ]);
  });

  it("returns 2 errors when a number is given for a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "a" | "b"');
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(1), type, schema)).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Expected string but got number" },
    ]);
  });

  it("returns 2 errors when the discriminator field is missing", () => {
    const schema = parseSchemaOrThrow(
      'type Cat = { kind: "cat"; }; type Dog = { kind: "dog"; }; type Response = Cat | Dog',
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["name", str("Felix")]]), type, schema),
    ).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Missing required field 'kind'" },
    ]);
  });

  it("returns 2 errors for an object with a wrong-typed field", () => {
    const schema = parseSchemaOrThrow("type Response = { name: string; };");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([["name", num(42)]]), type, schema)).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Expected string but got number" },
    ]);
  });

  it("returns 2 errors for a string not in a string union", () => {
    const schema = parseSchemaOrThrow('type Response = "a" | "b"');
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(str("c"), type, schema)).toMatch([
      { message: "Does not match type 'Response'" },
      { message: 'Expected one of ["a","b"]' },
    ]);
  });

  it("returns 2 errors for an unknown discriminant value in an interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Response = { kind: "cat" } | { kind: "dog" }',
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["kind", str("fish")]]), type, schema),
    ).toMatch([
      { message: "Does not match type 'Response'" },
      { message: 'Expected one of ["cat","dog"]' },
    ]);
  });

  it("returns 2 errors for a missing required field", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { name: string; age: number; };",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["name", str("Alice")]]), type, schema),
    ).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Missing required field 'age'" },
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

  it("accepts the boundary values -2147483648 and 2147483647", () => {
    const schema = parseSchemaOrThrow("type Response = integer");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(-2147483648), type, schema)).toMatch([]);
    expect(validateJson(num(2147483647), type, schema)).toMatch([]);
  });

  it("rejects a float with a close-match error", () => {
    const schema = parseSchemaOrThrow("type Response = integer");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(3.14), type, schema)).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Expected int but got float" },
    ]);
  });

  it("rejects an out-of-range integer with the same close-match error", () => {
    const schema = parseSchemaOrThrow("type Response = integer");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(num(2147483648), type, schema)).toMatch([
      { message: "Does not match type 'Response'" },
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

  it("rejects the opposite boolean value with a close-match error", () => {
    const schema = parseSchemaOrThrow("type Response = { status: true }");
    const type = schema.typeDeclarations["Response"]!;
    expect(
      validateJson(objStrict([["status", bool(false)]]), type, schema),
    ).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Expected true" },
    ]);
  });

  it("rejects a non-boolean with 2 errors", () => {
    const schema = parseSchemaOrThrow("type Response = { status: true }");
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([["status", num(1)]]), type, schema)).toMatch(
      [
        { message: "Does not match type 'Response'" },
        { message: "Expected true" },
      ],
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

  it("rejects a non-object with 2 errors", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { [key: string]: number }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(str("oops"), type, schema)).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Expected object but got string" },
    ]);
  });

  it("rejects a wrong-typed record value with a close-match error", () => {
    const schema = parseSchemaOrThrow(
      "type Response = { [key: string]: number }",
    );
    const type = schema.typeDeclarations["Response"]!;
    expect(validateJson(objStrict([["x", str("bad")]]), type, schema)).toMatch([
      { message: "Does not match type 'Response'" },
      { message: "Expected number but got string" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// validateJson - interface extras
// ---------------------------------------------------------------------------

describe("validateJson - interface extras", () => {
  it("rejects an object with an unknown field", () => {
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
      { message: "Does not match type 'Response'" },
      { message: "Unknown field 'extra'" },
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
      { message: "Does not match type 'Response'" },
      { message: "Expected boolean but got string" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - helpers
// ---------------------------------------------------------------------------

// Minimal SchemaView (no named types, no unions).
const EMPTY_VIEW = {
  typeDeclarations: {},
  sharedDeclarations: {},
  unionToMembers: new Map(),
} as unknown as Schema;

const ELLIPSIS: LooseJsonValue = {
  kind: "ellipsis",
  firstToken: { start: 0, end: 3 },
};

function primType(
  text: "string" | "number" | "boolean" | "integer",
): PrimitiveType {
  return {
    kind: "primitive",
    primitive: { text, start: 0, end: text.length },
  };
}

function litType(value: string): StringLiteral {
  return {
    kind: "string-literal",
    value,
    quotedName: { text: `"${value}"`, start: 0, end: value.length + 2 },
  };
}

function boolLitType(value: boolean): BooleanLiteral {
  const text = String(value) as "true" | "false";
  return {
    kind: "boolean-literal",
    span: { text, start: 0, end: text.length },
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
    leftCurlyBracket: { start: 0, end: 1 },
    fields: Object.fromEntries(
      Object.entries(fields).map(([name, { optional = false, text }]) => [
        name,
        {
          name: { text: name, start: 0, end: name.length },
          optional,
          type: primType(text),
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
    leftCurlyBracket: { start: 0, end: 1 },
    keyName: "key",
    valueType: primType(valueText),
  };
}

// ---------------------------------------------------------------------------
// jsonMatchesType - result shape and mode
// ---------------------------------------------------------------------------

describe("jsonMatchesType - result shape and mode", () => {
  it("returns { kind: 'match' } on a successful match", () => {
    expect(
      jsonMatchesType(str("hi"), primType("string"), "thorough", EMPTY_VIEW),
    ).toMatch({ kind: "match" });
  });

  it("fast mode: mismatch returns no details", () => {
    const result = jsonMatchesType(
      num(1),
      primType("string"),
      "fast",
      EMPTY_VIEW,
    );
    expect(result).toMatch({ kind: "mismatch" });
    expect((result as any).details).toBe(undefined);
  });

  it("thorough mode: mismatch includes reason and matchScore", () => {
    expect(
      jsonMatchesType(num(1), primType("string"), "thorough", EMPTY_VIEW),
    ).toMatch({
      kind: "mismatch",
      details: {
        reason: { message: "Expected string but got number" },
        matchScore: 0,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - ellipsis value
// ---------------------------------------------------------------------------

describe("jsonMatchesType - ellipsis value", () => {
  it("ellipsis matches any type in thorough mode", () => {
    expect(
      jsonMatchesType(ELLIPSIS, primType("string"), "thorough", EMPTY_VIEW),
    ).toMatch({ kind: "match" });
    expect(
      jsonMatchesType(ELLIPSIS, litType("ok"), "thorough", EMPTY_VIEW),
    ).toMatch({ kind: "match" });
    expect(
      jsonMatchesType(
        ELLIPSIS,
        ifaceType({ name: { text: "string" } }),
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({ kind: "match" });
  });

  it("ellipsis matches any type in fast mode too", () => {
    expect(
      jsonMatchesType(ELLIPSIS, primType("number"), "fast", EMPTY_VIEW),
    ).toMatch({ kind: "match" });
  });

  it("a loose object with an ellipsis satisfies an interface even when required fields are absent", () => {
    const loosObj: LooseJsonValue = {
      kind: "object",
      firstToken: { start: 0, end: 1 },
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
// jsonMatchesType - matchScore
// ---------------------------------------------------------------------------

describe("jsonMatchesType - matchScore", () => {
  it("string-literal: wrong string value → matchScore 0.5", () => {
    expect(
      jsonMatchesType(str("bad"), litType("ok"), "thorough", EMPTY_VIEW),
    ).toMatch({ kind: "mismatch", details: { matchScore: 0.5 } });
  });

  it("string-literal: wrong kind → matchScore 0", () => {
    expect(
      jsonMatchesType(num(1), litType("ok"), "thorough", EMPTY_VIEW),
    ).toMatch({ kind: "mismatch", details: { matchScore: 0 } });
  });

  it("boolean-literal: opposite value → matchScore 0.5", () => {
    expect(
      jsonMatchesType(bool(false), boolLitType(true), "thorough", EMPTY_VIEW),
    ).toMatch({ kind: "mismatch", details: { matchScore: 0.5 } });
  });

  it("boolean-literal: wrong kind → matchScore 0", () => {
    expect(
      jsonMatchesType(num(1), boolLitType(true), "thorough", EMPTY_VIEW),
    ).toMatch({ kind: "mismatch", details: { matchScore: 0 } });
  });

  it("string union: non-matching string → matchScore 0.5", () => {
    const schema = parseSchemaOrThrow('type S = "a" | "b"');
    const unionType = schema.typeDeclarations["S"]!.valueType;
    expect(
      jsonMatchesType(str("c"), unionType as SyntheticType, "thorough", schema),
    ).toMatch({
      kind: "mismatch",
      details: { matchScore: 0.5 },
    });
  });

  it("array: first element matches, second fails → matchScore 0.5", () => {
    // matchScoreTotal = 1 after first, += mismatch score 0 → 1 / 2 = 0.5
    const arrT: Array = { kind: "array", elementType: primType("number") };
    expect(
      jsonMatchesType(
        arrStrict([num(1), str("bad")]) as LooseJsonValue,
        arrT,
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({ kind: "mismatch", details: { matchScore: 0.5 } });
  });

  it("array: first element fails → matchScore 0", () => {
    const arrT: Array = { kind: "array", elementType: primType("number") };
    expect(
      jsonMatchesType(
        arrStrict([str("bad"), num(1)]) as LooseJsonValue,
        arrT,
        "thorough",
        EMPTY_VIEW,
      ),
    ).toMatch({ kind: "mismatch", details: { matchScore: 0 } });
  });
});

// ---------------------------------------------------------------------------
// jsonMatchesType - fast mode short-circuiting
// ---------------------------------------------------------------------------

describe("jsonMatchesType - fast mode short-circuit", () => {
  it("array: stops at first element mismatch", () => {
    const arrT: Array = { kind: "array", elementType: primType("number") };
    const result = jsonMatchesType(
      arrStrict([num(1), str("bad"), num(2)]) as LooseJsonValue,
      arrT,
      "fast",
      EMPTY_VIEW,
    );
    expect(result).toMatch({ kind: "mismatch" });
    expect((result as any).details).toBe(undefined);
  });

  it("interface: stops at first field type mismatch", () => {
    const result = jsonMatchesType(
      safeCast(
        objStrict([
          ["name", num(42)],
          ["age", num(30)],
        ]),
      ),
      ifaceType({ name: { text: "string" }, age: { text: "number" } }),
      "fast",
      EMPTY_VIEW,
    );
    expect(result).toMatch({ kind: "mismatch" });
    expect((result as any).details).toBe(undefined);
  });

  it("interface: stops on unknown field", () => {
    const result = jsonMatchesType(
      safeCast(objStrict([["extra", str("x")]])),
      ifaceType({ name: { text: "string" } }),
      "fast",
      EMPTY_VIEW,
    );
    expect(result).toMatch({ kind: "mismatch" });
    expect((result as any).details).toBe(undefined);
  });

  it("record: stops at first value type mismatch", () => {
    const result = jsonMatchesType(
      safeCast(objStrict([["x", str("bad")]])),
      recordType("number"),
      "fast",
      EMPTY_VIEW,
    );
    expect(result).toMatch({ kind: "mismatch" });
    expect((result as any).details).toBe(undefined);
  });
});
