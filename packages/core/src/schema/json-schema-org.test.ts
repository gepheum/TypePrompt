import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { MappedText } from "../util/shared-types.js";
import { toJsonSchema } from "./json-schema-org.js";
import { parseSchema } from "./schema-parser.js";
import type { Schema } from "./schema-types.js";
import { validateSchema } from "./schema-validator.js";

function textNode(source: string, path = "schema.ts"): MappedText {
  return {
    path,
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

function compile(
  source: string,
  path = "schema.ts",
  context: "namespace" | "internal" = "internal",
): Schema {
  const parsed = parseSchema(textNode(source, path), context);
  if (parsed.kind !== "success") {
    throw new Error(
      `Parse failed: ${parsed.errors.map((e) => e.message).join(", ")}`,
    );
  }
  const validated = validateSchema(parsed, null);
  if (validated.kind !== "success") {
    throw new Error(
      `Validation failed: ${validated.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return validated;
}

function compileTemplate(
  templateSource: string,
  namespaceSource: string,
  path = "template-schema.ts",
): Schema {
  const ns = compile(namespaceSource, "schema.ts", "namespace");
  const parsed = parseSchema(textNode(templateSource, path), "template");
  if (parsed.kind !== "success") {
    throw new Error(
      `Parse failed: ${parsed.errors.map((e) => e.message).join(", ")}`,
    );
  }
  const validated = validateSchema(parsed, ns);
  if (validated.kind !== "success") {
    throw new Error(
      `Validation failed: ${validated.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return validated;
}

function gen(source: string, typeName = "Output"): Record<string, unknown> {
  const schema = compile(source);
  return toJsonSchema(typeName, schema, schema.unionToMembers);
}

// ---------------------------------------------------------------------------
// Primitive types
// ---------------------------------------------------------------------------

describe("toJsonSchema - primitive types", () => {
  it("generates { type: string } for string", () => {
    expect(gen("type Output = string;")).toMatch({ type: "string" });
  });

  it("generates { type: number } for number", () => {
    expect(gen("type Output = number;")).toMatch({ type: "number" });
  });

  it("generates { type: boolean } for boolean", () => {
    expect(gen("type Output = boolean;")).toMatch({ type: "boolean" });
  });

  it("generates { type: integer } for integer", () => {
    expect(gen("type Output = integer;")).toMatch({ type: "integer" });
  });
});

// ---------------------------------------------------------------------------
// any type
// ---------------------------------------------------------------------------

describe("toJsonSchema - any type", () => {
  it("generates an unconstrained schema {} for any", () => {
    // any → {} means no constraints: all values are valid
    expect(gen("type Output = any;").$defs).toBe(undefined);
    expect(gen("type Output = any;").type).toBe(undefined);
  });
});

// ---------------------------------------------------------------------------
// Literal types
// ---------------------------------------------------------------------------

describe("toJsonSchema - literal types", () => {
  it("generates a string const schema for a string literal", () => {
    expect(gen('type Output = { status: "active" }')).toMatch({
      type: "object",
      properties: {
        status: { type: "string", const: "active" },
      },
      required: ["status"],
      additionalProperties: false,
    });
  });

  it("generates a boolean const true schema for a true literal", () => {
    expect(gen("type Output = { status: true }")).toMatch({
      type: "object",
      properties: {
        status: { type: "boolean", const: true },
      },
      required: ["status"],
      additionalProperties: false,
    });
  });

  it("generates a boolean const false schema for a false literal", () => {
    expect(gen("type Output = { status: false }")).toMatch({
      type: "object",
      properties: {
        status: { type: "boolean", const: false },
      },
      required: ["status"],
      additionalProperties: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Array types
// ---------------------------------------------------------------------------

describe("toJsonSchema - array types", () => {
  it("generates an array schema with an items sub-schema", () => {
    expect(gen("type Output = string[];")).toMatch({
      type: "array",
      items: { type: "string" },
    });
  });

  it("generates nested array schemas", () => {
    expect(gen("type Output = number[][];")).toMatch({
      type: "array",
      items: { type: "array", items: { type: "number" } },
    });
  });
});

// ---------------------------------------------------------------------------
// Interface types
// ---------------------------------------------------------------------------

describe("toJsonSchema - interface types", () => {
  it("generates an empty object schema for an empty interface", () => {
    expect(gen("type Output = {};")).toMatch({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
  });

  it("includes all fields in required and uses anyOf with null for optional fields", () => {
    const result = gen("type Output = { name?: string; age?: number; };");
    expect(result).toMatch({
      type: "object",
      properties: {
        name: { anyOf: [{ type: "string" }, { type: "null" }] },
        age: { anyOf: [{ type: "number" }, { type: "null" }] },
      },
      required: ["name", "age"],
      additionalProperties: false,
    });
  });

  it("lists all non-optional fields in required", () => {
    expect(gen("type Output = { name: string; age: number; };")).toMatch({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name", "age"],
      additionalProperties: false,
    });
  });

  it("includes optional fields in required with anyOf with null", () => {
    expect(
      gen("type Output = { name: string; age?: number; id: string; };"),
    ).toMatch({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { anyOf: [{ type: "number" }, { type: "null" }] },
        id: { type: "string" },
      },
      required: ["name", "age", "id"],
      additionalProperties: false,
    });
  });

  it("always sets additionalProperties to false", () => {
    expect(gen("type Output = { name: string; };")).toMatch({
      additionalProperties: false,
    });
  });

  it("adds description from JSDoc to a field schema", () => {
    expect(
      gen(
        [
          "type Output = {",
          "  /** The user's full name. */",
          "  name: string;",
          "  age: number;",
          "};",
        ].join("\n"),
      ),
    ).toMatch({
      type: "object",
      properties: {
        name: { type: "string", description: "The user's full name." },
        age: { type: "number" },
      },
    });
  });

  it("wraps a $ref in anyOf when the field has a description", () => {
    const schema = gen(
      [
        "type Output = {",
        "  /** Where the person lives. */",
        "  address: Address;",
        "};",
        "type Address = { city: string; };",
      ].join("\n"),
    );
    const properties = schema.properties as Record<string, unknown>;
    expect(properties.address).toMatch({
      anyOf: [{ $ref: "#/$defs/Address" }],
      description: "Where the person lives.",
    });
    expect(Object.keys(properties.address as object).sort()).toMatch([
      "anyOf",
      "description",
    ]);
  });

  it("supports nested inline interfaces", () => {
    expect(
      gen("type Output = { address: { street: string; city: string }; };"),
    ).toMatch({
      type: "object",
      properties: {
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
          },
          required: ["street", "city"],
          additionalProperties: false,
        },
      },
      required: ["address"],
      additionalProperties: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

describe("toJsonSchema - record types", () => {
  it("generates additionalProperties for a record type", () => {
    expect(gen("type Output = { [key: string]: number };")).toMatch({
      type: "object",
      additionalProperties: { type: "number" },
    });
  });

  it("supports records with string literal value types", () => {
    expect(gen('type Output = { [key: string]: "a" | "b" };')).toMatch({
      type: "object",
      additionalProperties: { enum: ["a", "b"] },
    });
  });
});

// ---------------------------------------------------------------------------
// String literal unions
// ---------------------------------------------------------------------------

describe("toJsonSchema - string literal unions", () => {
  it("generates an enum schema for a string literal union", () => {
    expect(gen('type Output = "active" | "inactive";')).toMatch({
      enum: ["active", "inactive"],
    });
  });

  it("preserves member order in enum", () => {
    expect(gen('type Output = "c" | "a" | "b";')).toMatch({
      enum: ["c", "a", "b"],
    });
  });
});

// ---------------------------------------------------------------------------
// Discriminated interface unions (string discriminant)
// ---------------------------------------------------------------------------

describe("toJsonSchema - discriminated interface unions", () => {
  it("generates anyOf for a two-member discriminated union", () => {
    expect(
      gen(
        'type Output = { kind: "circle"; radius: number } | { kind: "rect"; width: number; height: number };',
      ),
    ).toMatch({
      anyOf: [
        {
          type: "object",
          properties: {
            kind: { type: "string", const: "circle" },
            radius: { type: "number" },
          },
          required: ["kind", "radius"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            kind: { type: "string", const: "rect" },
            width: { type: "number" },
            height: { type: "number" },
          },
          required: ["kind", "width", "height"],
          additionalProperties: false,
        },
      ],
    });
  });

  it("preserves member order in anyOf", () => {
    const result = gen(
      'type Output = { kind: "a" } | { kind: "b" } | { kind: "c" };',
    );
    expect(result).toMatch({
      anyOf: [
        { properties: { kind: { const: "a" } } },
        { properties: { kind: { const: "b" } } },
        { properties: { kind: { const: "c" } } },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Discriminated interface unions (boolean discriminant)
// ---------------------------------------------------------------------------

describe("toJsonSchema - boolean-discriminated unions", () => {
  it("generates anyOf with boolean const fields", () => {
    expect(
      gen(
        "type Output = { success: true; value: string } | { success: false; error: string };",
      ),
    ).toMatch({
      anyOf: [
        {
          type: "object",
          properties: {
            success: { type: "boolean", const: true },
            value: { type: "string" },
          },
          required: ["success", "value"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            success: { type: "boolean", const: false },
            error: { type: "string" },
          },
          required: ["success", "error"],
          additionalProperties: false,
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Named type refs and $defs
// ---------------------------------------------------------------------------

describe("toJsonSchema - named type refs and $defs", () => {
  it("emits a $ref for a field of a named type", () => {
    expect(
      gen(
        [
          "type Output = { status: Status; };",
          'type Status = "active" | "inactive";',
        ].join("\n"),
      ),
    ).toMatch({
      type: "object",
      properties: {
        status: { $ref: "#/$defs/Status" },
      },
      required: ["status"],
      additionalProperties: false,
      $defs: {
        Status: { enum: ["active", "inactive"] },
      },
    });
  });

  it("does not emit $defs when there are no named refs", () => {
    const result = gen("type Output = { name: string; };");
    expect(result.required).toMatch(["name"]);
    expect(result.$defs).toBe(undefined);
  });

  it("emits the same $ref for repeated uses of the same named type", () => {
    expect(
      gen(
        [
          "type Output = { a: Status; b: Status; };",
          'type Status = "active" | "inactive";',
        ].join("\n"),
      ),
    ).toMatch({
      properties: {
        a: { $ref: "#/$defs/Status" },
        b: { $ref: "#/$defs/Status" },
      },
      $defs: {
        Status: { enum: ["active", "inactive"] },
      },
    });
  });

  it("adds description from JSDoc to the $defs entry", () => {
    expect(
      gen(
        [
          "type Output = { status: Status; };",
          "/** The current status. */",
          'type Status = "active" | "inactive";',
        ].join("\n"),
      ),
    ).toMatch({
      $defs: {
        Status: {
          enum: ["active", "inactive"],
          description: "The current status.",
        },
      },
    });
  });

  it("generates nested $defs when a ref itself uses another named type", () => {
    expect(
      gen(
        [
          "type Output = { person: Person; };",
          "type Person = { name: string; address: Address; };",
          "type Address = { city: string; };",
        ].join("\n"),
      ),
    ).toMatch({
      type: "object",
      properties: { person: { $ref: "#/$defs/Person" } },
      $defs: {
        Person: {
          type: "object",
          properties: {
            name: { type: "string" },
            address: { $ref: "#/$defs/Address" },
          },
          required: ["name", "address"],
          additionalProperties: false,
        },
        Address: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
          additionalProperties: false,
        },
      },
    });
  });

  it("handles a top-level type alias to a named type", () => {
    expect(
      gen(
        ["type Output = Status;", 'type Status = "active" | "inactive";'].join(
          "\n",
        ),
      ),
    ).toMatch({ enum: ["active", "inactive"] });
  });

  it("inlines the target of a top-level alias instead of emitting a root $ref", () => {
    const schema = gen(
      ["type Output = Person;", "type Person = { name: string; };"].join("\n"),
    );
    expect(schema).toMatch({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    });
    expect(Object.keys(schema).sort()).toMatch([
      "additionalProperties",
      "properties",
      "required",
      "type",
    ]);
  });

  it("follows a chain of top-level aliases to the final type", () => {
    const schema = gen(
      [
        "type Output = Foo;",
        "type Foo = Bar;",
        "type Bar = { name: string; };",
      ].join("\n"),
    );
    expect(schema).toMatch({
      type: "object",
      properties: { name: { type: "string" } },
    });
    expect(schema.$defs).toMatch(undefined);
  });

  it("points references to any alias in the root chain at the final type", () => {
    const schema = gen(
      [
        "type Output = Foo;",
        "type Foo = Bar;",
        "type Bar =",
        '  | { kind: "leaf"; label: string; }',
        '  | { kind: "viaFoo"; children: Foo[]; }',
        '  | { kind: "viaOutput"; parent: Output; }',
        '  | { kind: "viaBar"; next: Bar; };',
      ].join("\n"),
    );
    const members = schema.anyOf as Array<{
      properties: Record<string, unknown>;
    }>;
    expect(members.length).toMatch(4);
    expect(members[1]!.properties.children).toMatch({
      type: "array",
      items: { $ref: "#/$defs/Bar" },
    });
    expect(members[2]!.properties.parent).toMatch({ $ref: "#/$defs/Bar" });
    expect(members[3]!.properties.next).toMatch({ $ref: "#/$defs/Bar" });
    expect(Object.keys(schema.$defs as object)).toMatch(["Bar"]);
  });

  it("adds the root type's doc as the root description", () => {
    expect(gen("/** Some doc */\ntype Output = { n: number };")).toMatch({
      type: "object",
      description: "Some doc",
    });
  });

  it("uses the first doc found along a root alias chain", () => {
    expect(
      gen(
        [
          "/** Output doc */",
          "type Output = Foo;",
          "/** Foo doc */",
          "type Foo = { n: number };",
        ].join("\n"),
      ),
    ).toMatch({ type: "object", description: "Output doc" });
    const schema = gen(
      [
        "type Output = Foo;",
        "type Foo = Bar;",
        "/** Bar doc */",
        "type Bar = { n: number };",
      ].join("\n"),
    );
    expect(schema).toMatch({ type: "object", description: "Bar doc" });
  });

  it("omits the root description when no type in the chain has a doc", () => {
    const schema = gen("type Output = { n: number };");
    expect(schema.description).toMatch(undefined);
  });

  it("collapses non-root aliases into a single $defs entry", () => {
    const schema = gen(
      [
        "type Output = { a: Foo; b: Bar; };",
        "type Foo = Bar;",
        "type Bar = { name: string; };",
      ].join("\n"),
    );
    expect(schema).toMatch({
      properties: {
        a: { $ref: "#/$defs/Bar" },
        b: { $ref: "#/$defs/Bar" },
      },
    });
    expect(Object.keys(schema.$defs as object)).toMatch(["Bar"]);
  });
});

// ---------------------------------------------------------------------------
// Shared type refs (template context)
// ---------------------------------------------------------------------------

describe("toJsonSchema - shared type refs", () => {
  function genTemplate(
    templateSource: string,
    namespaceSource: string,
    typeName = "Output",
  ): Record<string, unknown> {
    const schema = compileTemplate(templateSource, namespaceSource);
    return toJsonSchema(typeName, schema, schema.unionToMembers);
  }

  it("emits a _-prefixed $ref for a shared type", () => {
    expect(
      genTemplate(
        "type Input = string;\ntype Output = shared.Profile;",
        "type Profile = { name: string; };",
      ),
    ).toMatch({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    });
  });

  it("follows a local alias to a shared type", () => {
    const schema = compileTemplate(
      [
        "type Input = string;",
        "type Output = { a: Local; b: shared.Profile; };",
        "type Local = shared.Profile;",
      ].join("\n"),
      "type Profile = { name: string; };",
    );
    const json = toJsonSchema("Output", schema, schema.unionToMembers);
    expect(json).toMatch({
      properties: {
        a: { $ref: "#/$defs/_Profile" },
        b: { $ref: "#/$defs/_Profile" },
      },
    });
    expect(Object.keys(json.$defs as object)).toMatch(["_Profile"]);
  });

  it("uses _-prefixed def name to avoid collision with local type names", () => {
    // Both a local type named Profile and a shared type named Profile can coexist.
    const schema = compileTemplate(
      [
        "type Profile = { id: number; };",
        "type Input = string;",
        "type Output = { local: Profile; remote: shared.Profile; };",
      ].join("\n"),
      "type Profile = { name: string; };",
    );
    expect(toJsonSchema("Output", schema, schema.unionToMembers)).toMatch({
      properties: {
        local: { $ref: "#/$defs/Profile" },
        remote: { $ref: "#/$defs/_Profile" },
      },
      required: ["local", "remote"],
      $defs: {
        Profile: {
          properties: { id: { type: "number" } },
        },
        _Profile: {
          properties: { name: { type: "string" } },
        },
      },
    });
  });

  it("emits _-prefixed $refs when one shared interface refers to another shared interface", () => {
    const schema = compileTemplate(
      "type Input = string;\ntype Output = shared.User;",
      [
        "type Address = { city: string; };",
        "type User = { name: string; address: Address; };",
      ].join("\n"),
    );
    expect(toJsonSchema("Output", schema, schema.unionToMembers)).toMatch({
      type: "object",
      properties: {
        name: { type: "string" },
        address: { $ref: "#/$defs/_Address" },
      },
      required: ["name", "address"],
      additionalProperties: false,
      $defs: {
        _Address: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
          additionalProperties: false,
        },
      },
    });
  });
});
