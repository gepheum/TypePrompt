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

function compile(source: string, path = "schema.ts"): Schema {
  const parsed = parseSchema(textNode(source, path));
  if (parsed.kind !== "success") {
    throw new Error(
      `Parse failed: ${parsed.errors.map((e) => e.message).join(", ")}`,
    );
  }
  const validated = validateSchema(parsed, {
    kind: "namespace",
  });
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
  const ns = compile(namespaceSource);
  const parsed = parseSchema(textNode(templateSource, path));
  if (parsed.kind !== "success") {
    throw new Error(
      `Parse failed: ${parsed.errors.map((e) => e.message).join(", ")}`,
    );
  }
  const validated = validateSchema(parsed, {
    kind: "template",
    namespaceSchema: ns,
  });
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

  it("does not include required when all fields are optional", () => {
    const result = gen("type Output = { name?: string; age?: number; };");
    expect(result).toMatch({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      additionalProperties: false,
    });
    // No required array should be emitted when all fields are optional.
    expect(result.required).toBe(undefined);
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

  it("excludes optional fields from required", () => {
    expect(
      gen("type Output = { name: string; age?: number; id: string; };"),
    ).toMatch({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
        id: { type: "string" },
      },
      required: ["name", "id"],
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
  it("generates oneOf for a two-member discriminated union", () => {
    expect(
      gen(
        'type Output = { kind: "circle"; radius: number } | { kind: "rect"; width: number; height: number };',
      ),
    ).toMatch({
      oneOf: [
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

  it("preserves member order in oneOf", () => {
    const result = gen(
      'type Output = { kind: "a" } | { kind: "b" } | { kind: "c" };',
    );
    expect(result).toMatch({
      oneOf: [
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
  it("generates oneOf with boolean const fields", () => {
    expect(
      gen(
        "type Output = { success: true; value: string } | { success: false; error: string };",
      ),
    ).toMatch({
      oneOf: [
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
    ).toMatch({
      $ref: "#/$defs/Status",
      $defs: { Status: { enum: ["active", "inactive"] } },
    });
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
      $ref: "#/$defs/_Profile",
      $defs: {
        _Profile: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
          additionalProperties: false,
        },
      },
    });
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
});
