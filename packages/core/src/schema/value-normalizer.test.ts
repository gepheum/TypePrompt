import { expect } from "buckwheat";
import { describe, it } from "mocha";
import type { MappedText } from "../util/shared-types.js";
import { parseSchema } from "./schema-parser.js";
import type { Schema, SchemaType, SchemaView } from "./schema-types.js";
import { normalizeSchemaValue } from "./value-normalizer.js";

function parse(source: string): SchemaView {
  const node: MappedText = {
    path: "test.ts",
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const result = parseSchema(node, "template");
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return {
    typeDeclarations: result.typeDeclarations,
    sharedDeclarations: {},
  };
}

function toSchemaType(schema: SchemaView, typeName = "Input"): SchemaType {
  const decl = schema.typeDeclarations[typeName];
  if (!decl) {
    throw new Error(`Type '${typeName}' not found in schema`);
  }
  return {
    type: decl.valueType,
    schema: schema as Schema,
  };
}

describe("normalizeSchemaValue", () => {
  it("returns primitive values as is", () => {
    const schema = parse(`
      type Input = string;
    `);
    const val = normalizeSchemaValue("hello", toSchemaType(schema));
    expect(val).toBe("hello");
  });

  it("orders interface fields according to declaration order", () => {
    const schema = parse(`
      type Input = {
        name: string;
        age: number;
      };
    `);
    const normalized = normalizeSchemaValue(
      { age: 30, name: "Alice" },
      toSchemaType(schema),
    );
    expect(Object.keys(normalized as object)).toMatch(["name", "age"]);
  });

  it("handles null or undefined input gracefully", () => {
    const schema = parse(`
      type Input = string;
    `);
    expect(normalizeSchemaValue(null, toSchemaType(schema))).toBe(null);
    expect(normalizeSchemaValue(undefined, toSchemaType(schema))).toBe(
      undefined,
    );
  });

  it("sets missing optional fields to null", () => {
    const schema = parse(`
      type Input = {
        name: string;
        bio?: string;
        details?: {
          nickname?: string;
        };
      };
    `);
    const normalized = normalizeSchemaValue(
      { name: "Alice", details: {} },
      toSchemaType(schema),
    );
    expect(normalized).toMatch({
      name: "Alice",
      bio: null,
      details: {
        nickname: null,
      },
    });
  });
});
