import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { Example } from "./example-parser.js";
import { parseExample } from "./example-parser.js";
import { validateExample } from "./example-validator.js";
import { parseSchema, Schema } from "./schema-parser.js";

function parseSchemaOrThrow(schemaSource: string): Schema {
  const parsed = parseSchema(schemaSource);
  if (parsed.kind === "error") {
    throw new Error(
      `Schema parse failed: ${parsed.errors
        .map((error) => error.message)
        .join(", ")}`,
    );
  }
  return parsed;
}

function parseExampleOrThrow(exampleSource: string): Example {
  const parsed = parseExample(exampleSource);
  if (parsed.kind === "error") {
    throw new Error(
      `Example parse failed: ${parsed.errors
        .map((error) => error.message)
        .join(", ")}`,
    );
  }
  return parsed;
}

describe("validateExample", () => {
  it("accepts primitive examples that match the target type", () => {
    const schema = parseSchemaOrThrow("type Response = string;");
    const example = parseExampleOrThrow('"hello"');

    expect(validateExample(example, schema, "Response")).toMatch([]);
  });

  it("reports mismatch for primitive examples", () => {
    const schema = parseSchemaOrThrow("type Response = number;");
    const example = parseExampleOrThrow('"hello"');

    expect(validateExample(example, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
        sourceSpan: {
          start: 0,
          end: 7,
        },
      },
    ]);
  });

  it("rejects null values for non-nullable named aliases", () => {
    const schema = parseSchemaOrThrow(
      "type Response = Maybe; type Maybe = string;",
    );
    const invalidNull = parseExampleOrThrow("null");
    const invalidNumber = parseExampleOrThrow("0");

    expect(validateExample(invalidNull, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
    expect(validateExample(invalidNumber, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("supports validating against a non-Response type name", () => {
    const schema = parseSchemaOrThrow(
      "type Response = Foo; type Foo = boolean;",
    );
    const example = parseExampleOrThrow("true");

    expect(validateExample(example, schema, "Foo")).toMatch([]);
  });

  it("reports unknown target type names", () => {
    const schema = parseSchemaOrThrow("type Response = string;");
    const example = parseExampleOrThrow('"x"');

    expect(validateExample(example, schema, "Missing")).toMatch([
      {
        message: "Unknown type 'Missing'",
        sourceSpan: {
          start: 0,
          end: 3,
        },
      },
    ]);
  });

  it("treats standalone ellipsis as wildcard for any type", () => {
    const schema = parseSchemaOrThrow("interface Response { name: string; }");
    const example = parseExampleOrThrow("...");

    expect(validateExample(example, schema, "Response")).toMatch([]);
  });

  it("treats object-only ellipsis as wildcard for any type", () => {
    const schema = parseSchemaOrThrow("type Response = string;");
    const example = parseExampleOrThrow("{...}");

    expect(validateExample(example, schema, "Response")).toMatch([]);
  });

  it("allows missing required object fields when object has ellipsis", () => {
    const schema = parseSchemaOrThrow(
      "interface Response { name: string; age: number; }",
    );
    const example = parseExampleOrThrow('{"name": "Ada", ...}');

    expect(validateExample(example, schema, "Response")).toMatch([]);
  });

  it("rejects interface type when example value is not an object", () => {
    const schema = parseSchemaOrThrow("interface Response { name: string; }");
    const example = parseExampleOrThrow('"not-object"');

    expect(validateExample(example, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("rejects missing required interface fields without ellipsis", () => {
    const schema = parseSchemaOrThrow(
      "interface Response { name: string; age: number; }",
    );
    const example = parseExampleOrThrow('{"name": "Ada"}');

    expect(validateExample(example, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("rejects unexpected object keys even when object has ellipsis", () => {
    const schema = parseSchemaOrThrow("interface Response { name: string; }");
    const example = parseExampleOrThrow('{"name": "Ada", "extra": 1, ...}');

    expect(validateExample(example, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("validates arrays using the element type", () => {
    const schema = parseSchemaOrThrow("type Response = string[];");

    const valid = parseExampleOrThrow('["a", "b"]');
    const invalid = parseExampleOrThrow('["a", 1]');

    expect(validateExample(valid, schema, "Response")).toMatch([]);
    expect(validateExample(invalid, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("rejects array type when example value is not an array", () => {
    const schema = parseSchemaOrThrow("type Response = string[];");
    const invalid = parseExampleOrThrow('"not-array"');

    expect(validateExample(invalid, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("rejects non-object values for inline-interface type refs", () => {
    const schema = parseSchemaOrThrow(
      'type Response = { kind: "ok"; count: number; };',
    );
    const invalid = parseExampleOrThrow('"wrong"');

    expect(validateExample(invalid, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("rejects missing required fields for inline-interface type refs", () => {
    const schema = parseSchemaOrThrow(
      'type Response = { kind: "ok"; count: number; };',
    );
    const invalid = parseExampleOrThrow('{"kind": "ok"}');

    expect(validateExample(invalid, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("supports unions with string literals and inline interfaces", () => {
    const schema = parseSchemaOrThrow(
      'type Response = "ok" | { kind: "err"; message: string; };',
    );

    const successExample = parseExampleOrThrow('"ok"');
    const errorExample = parseExampleOrThrow('{"kind": "err", "message": "x"}');
    const badExample = parseExampleOrThrow('{"kind": "err", "message": 1}');

    expect(validateExample(successExample, schema, "Response")).toMatch([]);
    expect(validateExample(errorExample, schema, "Response")).toMatch([]);
    expect(validateExample(badExample, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("rejects string values that do not match string-literal union members", () => {
    const schema = parseSchemaOrThrow('type Response = "ok" | "err";');
    const invalid = parseExampleOrThrow('"maybe"');

    expect(validateExample(invalid, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("fails when schema type graph references an unknown nested type", () => {
    const schema = parseSchemaOrThrow(
      "type Response = Wrapper; type Wrapper = Missing;",
    );
    const example = parseExampleOrThrow('"x"');

    expect(validateExample(example, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("accepts recursive named type examples", () => {
    const schema = parseSchemaOrThrow(
      "interface Node { next?: Node; } type Response = Node;",
    );
    const valid = parseExampleOrThrow('{"next": {"next": {}}}');

    expect(validateExample(valid, schema, "Response")).toMatch([]);
  });

  it("rejects invalid recursive named type examples", () => {
    const schema = parseSchemaOrThrow(
      "interface Node { next?: Node; } type Response = Node;",
    );
    const invalid = parseExampleOrThrow('{"next": 1}');

    expect(validateExample(invalid, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("does not loop forever on direct self-referential aliases", () => {
    const schema = parseSchemaOrThrow(
      "type Response = Loop; type Loop = Loop;",
    );
    const example = parseExampleOrThrow("{}");

    expect(validateExample(example, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });

  it("accepts recursive type with multiple branches where each value is distinct", () => {
    const schema = parseSchemaOrThrow(
      "interface Pair { left?: Pair; right?: Pair; } type Response = Pair;",
    );
    const valid = parseExampleOrThrow(
      '{"left": {"left": {}, "right": {}}, "right": {"left": {}, "right": {}}}',
    );

    expect(validateExample(valid, schema, "Response")).toMatch([]);
  });

  it("rejects recursive type when a branch has invalid type", () => {
    const schema = parseSchemaOrThrow(
      "interface Pair { left?: Pair; right?: Pair; } type Response = Pair;",
    );
    const invalid = parseExampleOrThrow(
      '{"left": {"left": {}, "right": "wrong"}, "right": {}}',
    );

    expect(validateExample(invalid, schema, "Response")).toMatch([
      {
        message: "Example does not match type 'Response'",
      },
    ]);
  });
});
