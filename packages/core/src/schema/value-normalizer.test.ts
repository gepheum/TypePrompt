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
    const val = normalizeSchemaValue("hello", toSchemaType(schema), "user");
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
      "user",
    );
    expect(Object.keys(normalized as object)).toMatch(["name", "age"]);
  });

  it("handles null or undefined input gracefully", () => {
    const schema = parse(`
      type Input = string;
    `);
    expect(normalizeSchemaValue(null, toSchemaType(schema), "user")).toBe(null);
    expect(normalizeSchemaValue(undefined, toSchemaType(schema), "user")).toBe(
      undefined,
    );
  });

  it("sets missing optional fields to null in assistant mode", () => {
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
      "assistant",
    );
    expect(normalized).toMatch({
      name: "Alice",
      bio: null,
      details: {
        nickname: null,
      },
    });
  });

  describe("mode: 'user' with @omitDefault", () => {
    it("omits default values for optional, array, and primitive fields with @omitDefault", () => {
      const schema = parse(`
        type Input = {
          name: string;
          /// @omitDefault
          nickname?: string;
          /// @omitDefault
          tags: string[];
          /// @omitDefault
          count: integer;
          /// @omitDefault
          note: string;
          /// @omitDefault
          active: boolean;
          // Fields without @omitDefault should NOT be omitted:
          plainCount: integer;
          plainNote: string;
          plainTags: string[];
          plainOpt?: string;
        };
      `);
      const normalized = normalizeSchemaValue(
        {
          name: "Alice",
          nickname: null,
          tags: [],
          count: 0,
          note: "",
          active: false,
          plainCount: 0,
          plainNote: "",
          plainTags: [],
          plainOpt: null,
        },
        toSchemaType(schema),
        "user",
      );
      expect(normalized).toMatch({
        name: "Alice",
        plainCount: 0,
        plainNote: "",
        plainTags: [],
        plainOpt: null,
      });
      const obj = normalized as Record<string, unknown>;
      expect("nickname" in obj).toBe(false);
      expect("tags" in obj).toBe(false);
      expect("count" in obj).toBe(false);
      expect("note" in obj).toBe(false);
      expect("active" in obj).toBe(false);
    });

    it("omits missing optional fields annotated with @omitDefault", () => {
      const schema = parse(`
        type Input = {
          name: string;
          /// @omitDefault
          nickname?: string;
          plainOpt?: string;
        };
      `);
      const normalized = normalizeSchemaValue(
        { name: "Alice" },
        toSchemaType(schema),
        "user",
      );
      expect(normalized).toMatch({
        name: "Alice",
        plainOpt: null,
      });
      const obj = normalized as Record<string, unknown>;
      expect("nickname" in obj).toBe(false);
    });

    it("keeps non-default values for fields annotated with @omitDefault", () => {
      const schema = parse(`
        type Input = {
          /// @omitDefault
          nickname?: string;
          /// @omitDefault
          tags: string[];
          /// @omitDefault
          count: integer;
          /// @omitDefault
          note: string;
          /// @omitDefault
          active: boolean;
        };
      `);
      const normalized = normalizeSchemaValue(
        {
          nickname: "Ali",
          tags: ["admin"],
          count: 42,
          note: "Important",
          active: true,
        },
        toSchemaType(schema),
        "user",
      );
      expect(normalized).toMatch({
        nickname: "Ali",
        tags: ["admin"],
        count: 42,
        note: "Important",
        active: true,
      });
    });

    it("omits default values for type aliases to primitive or array", () => {
      const schema = parse(`
        type Text = string;
        type Counter = integer;
        type Flag = boolean;
        type List = string[];
        type Input = {
          /// @omitDefault
          title: Text;
          /// @omitDefault
          total: Counter;
          /// @omitDefault
          enabled: Flag;
          /// @omitDefault
          items: List;
        };
      `);
      const normalized = normalizeSchemaValue(
        {
          title: "",
          total: 0,
          enabled: false,
          items: [],
        },
        toSchemaType(schema),
        "user",
      );
      expect(normalized).toMatch({});
      const obj = normalized as Record<string, unknown>;
      expect("title" in obj).toBe(false);
      expect("total" in obj).toBe(false);
      expect("enabled" in obj).toBe(false);
      expect("items" in obj).toBe(false);
    });

    it("handles nested structures and arrays of objects", () => {
      const schema = parse(`
        type Item = {
          id: string;
          /// @omitDefault
          score: integer;
        };
        type Input = {
          /// @omitDefault
          mainItem?: Item;
          items: Item[];
        };
      `);
      const normalized = normalizeSchemaValue(
        {
          mainItem: null,
          items: [
            { id: "1", score: 0 },
            { id: "2", score: 10 },
          ],
        },
        toSchemaType(schema),
        "user",
      );
      expect(normalized).toMatch({
        items: [{ id: "1" }, { id: "2", score: 10 }],
      });
      const obj = normalized as Record<string, unknown>;
      expect("mainItem" in obj).toBe(false);
    });
  });

  describe("mode: 'assistant' with @omitDefault", () => {
    it("outputs every field even if default and annotated with @omitDefault", () => {
      const schema = parse(`
        type Input = {
          name: string;
          /// @omitDefault
          nickname?: string;
          /// @omitDefault
          tags: string[];
          /// @omitDefault
          count: integer;
          /// @omitDefault
          note: string;
          /// @omitDefault
          active: boolean;
        };
      `);
      const normalized = normalizeSchemaValue(
        {
          name: "Alice",
          tags: [],
          count: 0,
          note: "",
          active: false,
        },
        toSchemaType(schema),
        "assistant",
      );
      expect(normalized).toMatch({
        name: "Alice",
        nickname: null,
        tags: [],
        count: 0,
        note: "",
        active: false,
      });
    });
  });

  describe("optional fields which are not set", () => {
    const schema = parse(`
      type Input = {
        name: string;
        /// @omitDefault
        omittedOpt?: string;
        plainOpt?: string;
        nested?: {
          /// @omitDefault
          omittedChildOpt?: integer;
          plainChildOpt?: integer;
        };
      };
    `);

    it("in assistant mode, always outputs 'null' for not set optional fields", () => {
      const normalized = normalizeSchemaValue(
        { name: "Alice", nested: {} },
        toSchemaType(schema),
        "assistant",
      );
      expect(normalized).toMatch({
        name: "Alice",
        omittedOpt: null,
        plainOpt: null,
        nested: {
          omittedChildOpt: null,
          plainChildOpt: null,
        },
      });
      const obj = normalized as Record<string, unknown>;
      expect("omittedOpt" in obj).toBe(true);
      expect("plainOpt" in obj).toBe(true);
      expect(obj.omittedOpt).toBe(null);
      expect(obj.plainOpt).toBe(null);
    });

    it("in user mode, skips the field if it has @omitDefault, otherwise outputs 'null'", () => {
      const normalized = normalizeSchemaValue(
        { name: "Alice", nested: {} },
        toSchemaType(schema),
        "user",
      );
      expect(normalized).toMatch({
        name: "Alice",
        plainOpt: null,
        nested: {
          plainChildOpt: null,
        },
      });
      const obj = normalized as Record<string, unknown>;
      expect("omittedOpt" in obj).toBe(false);
      expect("plainOpt" in obj).toBe(true);
      expect(obj.plainOpt).toBe(null);

      const nestedObj = obj.nested as Record<string, unknown>;
      expect("omittedChildOpt" in nestedObj).toBe(false);
      expect("plainChildOpt" in nestedObj).toBe(true);
      expect(nestedObj.plainChildOpt).toBe(null);
    });

    it("in user mode, skips @omitDefault optional field when set to undefined or null, outputs null for plain", () => {
      const normalizedUndefined = normalizeSchemaValue(
        { name: "Alice", omittedOpt: undefined, plainOpt: undefined },
        toSchemaType(schema),
        "user",
      );
      const undefinedObj = normalizedUndefined as Record<string, unknown>;
      expect("omittedOpt" in undefinedObj).toBe(false);
      expect("plainOpt" in undefinedObj).toBe(true);
      expect(undefinedObj.plainOpt).toBe(null);

      const normalizedNull = normalizeSchemaValue(
        { name: "Alice", omittedOpt: null, plainOpt: null },
        toSchemaType(schema),
        "user",
      );
      const nullObj = normalizedNull as Record<string, unknown>;
      expect("omittedOpt" in nullObj).toBe(false);
      expect("plainOpt" in nullObj).toBe(true);
      expect(nullObj.plainOpt).toBe(null);
    });
  });
});
