import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { MappedText } from "../util/shared-types.js";
import { EMPTY_SCHEMA } from "./empty-schema.js";
import { parseSchema } from "./schema-parser.js";
import type {
  Interface,
  Schema,
  SchemaContext,
  SchemaParseResult,
  Union,
} from "./schema-types.js";
import { validateSchema } from "./schema-validator.js";

function textNode(source: string, path = "schema.ts"): MappedText {
  return {
    path,
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

function parseDeclarations<Context extends SchemaContext>(
  source: string,
  context: Context,
  path = "schema.ts",
): SchemaParseResult<Context> {
  const result = parseSchema(textNode(source, path), context);
  if (result.kind !== "success") {
    throw new Error(`Parse failed: ${JSON.stringify(result)}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Success cases
// ---------------------------------------------------------------------------

describe("validateSchema - success", () => {
  it("validates a simple interface", () => {
    const result = validateSchema(
      parseDeclarations("type Output = { name: string; };", "namespace"),
      null,
    );
    expect([result]).toMatch([{ kind: "success" }]);
  });

  it("validates a string literal union", () => {
    const result = validateSchema(
      parseDeclarations('type Output = "active" | "inactive";', "namespace"),
      null,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a cross-type reference", () => {
    const result = validateSchema(
      parseDeclarations(
        [
          "type Output = { status: Status; };",
          'type Status = "active" | "inactive";',
        ].join("\n"),
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a schema containing any", () => {
    const result = validateSchema(
      parseDeclarations("type Output = any;", "internal"),
      null,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a schema containing a boolean literal field", () => {
    const result = validateSchema(
      parseDeclarations("type Output = { flag: true; };", "namespace"),
      null,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a boolean-discriminated union", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Output = { success: true; value: string } | { success: false; error: string };",
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a record type", () => {
    const result = validateSchema(
      parseDeclarations("type Output = { [key: string]: number };", "internal"),
      null,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a valid Meta interface", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Meta = { model: string; temperature: number; };",
        "meta",
      ),
      null,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts a Meta field with a string literal union type", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Meta = { role: "admin" | "user" | "FOO/-BAR_-3.1"; }',
        "meta",
      ),
      null,
    );
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Required type
// ---------------------------------------------------------------------------

describe("validateSchema - required type", () => {
  it("reports missing Input/Output in template context", () => {
    const result = validateSchema(
      parseDeclarations("", "template"),
      EMPTY_SCHEMA,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Missing required type 'Input'" },
        { message: "Missing required type 'Output'" },
      ],
    });
  });

  it("reports missing Meta in meta context", () => {
    const result = validateSchema(parseDeclarations("", "meta"), null);
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Missing required type 'Meta'" }],
    });
  });

  it("reports missing Input/Output in tool context", () => {
    const result = validateSchema(parseDeclarations("", "tool"), EMPTY_SCHEMA);
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Missing required type 'Input'" },
        { message: "Missing required type 'Output'" },
      ],
    });
  });

  it("accepts empty declarations in namespace context (no required types)", () => {
    const result = validateSchema(parseDeclarations("", "namespace"), null);
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Template Output and Tool Input restrictions
// ---------------------------------------------------------------------------

describe("validateSchema - template Output and tool Input restrictions", () => {
  it("accepts string for template Output", () => {
    const result = validateSchema(
      parseDeclarations("type Input = {}; type Output = string;", "template"),
      EMPTY_SCHEMA,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts interface for template Output", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Input = {}; interface Output { count: number; }",
        "template",
      ),
      EMPTY_SCHEMA,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts type alias pointing to interface for template Output", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Input = {}; interface Result { count: number; } type Output = Result;",
        "template",
      ),
      EMPTY_SCHEMA,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts type alias pointing to string for template Output", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Input = {}; type MyString = string; type Output = MyString;",
        "template",
      ),
      EMPTY_SCHEMA,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("rejects non-string non-interface for template Output", () => {
    const cases = [
      "type Output = number;",
      "type Output = boolean;",
      "type Output = integer;",
      "type Output = string[];",
      'type Output = "a" | "b";',
      'type Output = { kind: "a" } | { kind: "b" };',
    ];
    for (const code of cases) {
      const result = validateSchema(
        parseDeclarations(`type Input = {}; ${code}`, "template"),
        EMPTY_SCHEMA,
      );
      expect(result).toMatch({
        kind: "error",
        errors: [{ message: "Output type must be 'string' or an interface" }],
      });
    }
  });

  it("accepts interface for tool Input", () => {
    const result = validateSchema(
      parseDeclarations(
        "interface Input { query: string; } type Output = number;",
        "tool",
      ),
      EMPTY_SCHEMA,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts type alias pointing to interface for tool Input", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Query = { query: string; }; type Input = Query; type Output = number;",
        "tool",
      ),
      EMPTY_SCHEMA,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("rejects non-interface for tool Input", () => {
    const cases = [
      "type Input = string;",
      "type Input = number;",
      "type Input = boolean;",
      "type Input = integer;",
      "type Input = string[];",
      'type Input = "a" | "b";',
      'type Input = { kind: "a" } | { kind: "b" };',
    ];
    for (const code of cases) {
      const result = validateSchema(
        parseDeclarations(`${code} type Output = number;`, "tool"),
        EMPTY_SCHEMA,
      );
      expect(result).toMatch({
        kind: "error",
        errors: [{ message: "Input type must be an interface" }],
      });
    }
  });

  it("allows arbitrary types for tool Output", () => {
    const cases = [
      "type Output = number;",
      "type Output = boolean;",
      "type Output = string[];",
      'type Output = "a" | "b";',
    ];
    for (const code of cases) {
      const result = validateSchema(
        parseDeclarations(`type Input = {}; ${code}`, "tool"),
        EMPTY_SCHEMA,
      );
      expect(result).toMatch({ kind: "success" });
    }
  });

  it("allows arbitrary types for template Input", () => {
    const cases = [
      "type Input = number;",
      "type Input = boolean;",
      "type Input = string[];",
      'type Input = "a" | "b";',
    ];
    for (const code of cases) {
      const result = validateSchema(
        parseDeclarations(`${code} type Output = string;`, "template"),
        EMPTY_SCHEMA,
      );
      expect(result).toMatch({ kind: "success" });
    }
  });
});

// ---------------------------------------------------------------------------
// Naming errors
// ---------------------------------------------------------------------------

describe("validateSchema - naming errors", () => {
  it("reports a type name starting with lowercase", () => {
    const result = validateSchema(
      parseDeclarations("type response = { name: string; };", "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Must start with uppercase letter and contain only alphanumeric characters",
        },
      ],
    });
  });

  it("reports a field name starting with uppercase", () => {
    const result = validateSchema(
      parseDeclarations("type Output = { Name: string; };", "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Must start with lowercase letter and contain only alphanumeric characters",
        },
      ],
    });
  });

  it("reports field names that conflict by case", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Output = { myField: string; myfield: number; };",
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "'myfield' and 'myField' differ only by casing" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Type reference errors
// ---------------------------------------------------------------------------

describe("validateSchema - type references", () => {
  it("reports an invalid string literal starting wiht a digit", () => {
    const result = validateSchema(
      parseDeclarations("type Output = {status: '3foo'};", "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "String must start with a letter" }],
    });
  });

  it("reports an invalid string literal containing invalid character", () => {
    const result = validateSchema(
      parseDeclarations("type Output = {status: 'foo bar'};", "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "String must only contain letters, digits, or allowed symbols (_ - . /)",
        },
      ],
    });
  });

  it("reports an unknown type reference", () => {
    const result = validateSchema(
      parseDeclarations("type Output = { value: Unknown; };", "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unknown type 'Unknown'", suggestions: ["Output"] }],
    });
  });

  it("reports a direct circular reference", () => {
    const result = validateSchema(
      parseDeclarations("type Output = { child: Output; };", "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Type 'Output' circularly references itself" }],
    });
  });

  it("reports an indirect circular reference", () => {
    const result = validateSchema(
      parseDeclarations(
        [
          "type Output = { next: Other; };",
          "type Other = { back: Output; };",
        ].join("\n"),
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Type 'Output' circularly references itself" },
        { message: "Type 'Other' circularly references itself" },
      ],
    });
  });

  it("reports an unused type", () => {
    const result = validateSchema(
      parseDeclarations(
        [
          "type Output = { name: string; };",
          "type Unused = string;",
          "type Input = string;",
        ].join("\n"),
        "template",
      ),
      EMPTY_SCHEMA,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Type 'Unused' is not used" }],
    });
  });

  it("reports an unused type in tool context", () => {
    const result = validateSchema(
      parseDeclarations(
        [
          "type Output = { name: string; };",
          "type Unused = string;",
          "type Input = {};",
        ].join("\n"),
        "tool",
      ),
      EMPTY_SCHEMA,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Type 'Unused' is not used" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Union type errors
// ---------------------------------------------------------------------------

describe("validateSchema - union type errors", () => {
  it("reports a union with a primitive member", () => {
    const result = validateSchema(
      parseDeclarations("type Output = string | number;", "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected: string literal or interface" }],
    });
  });

  it("reports a union with an array member", () => {
    const result = validateSchema(
      parseDeclarations("type Output = integer[] | string[];", "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected: string literal or interface" }],
    });
  });

  it("reports a boolean literal as a direct union member", () => {
    const result = validateSchema(
      parseDeclarations("type Output = true | false;", "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected: string literal or interface" }],
    });
  });

  it("reports an any type as a direct union member", () => {
    const result = validateSchema(
      parseDeclarations("type Output = any | string;", "internal"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected: string literal or interface" }],
    });
  });

  it("reports a union mixing strings and interfaces", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Output = "active" | { kind: "inactive"; value: string };',
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected: string literal" }],
    });
  });

  it("reports a union mixing interfaces and strings (interface first)", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Output = { kind: "active" } | "inactive";',
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "All members of a discriminated union must be interfaces" },
      ],
    });
  });

  it("reports an interface union member without a string/boolean literal discriminator", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Output = { kind: string; } | { kind: string; };",
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Discriminator ('kind') is not a string/boolean literal",
        },
      ],
    });
  });

  it("reports an interface union member with no first field", () => {
    const result = validateSchema(
      parseDeclarations('type Output = {} | { kind: "b"; };', "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Can't have an empty interface in a discriminated union",
        },
      ],
    });
  });

  it("reports interface union members with mismatched discriminator field names", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Output = { kind: "a"; value: string } | { type: "b"; value: string };',
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { start: 45 },
          message: "Discriminator name 'type' does not match 'kind'",
        },
      ],
    });
  });

  it("reports duplicate discriminant in an interface union", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Output = { kind: "same"; x: number } | { kind: "same"; y: number };',
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Duplicate discriminant 'same'" },
        { message: "Duplicate discriminant 'same'" },
      ],
    });
  });

  it("reports case-only duplicate discriminants in an interface union", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Output = { kind: "foo"; x: number } | { kind: "fOO"; y: number };',
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "'fOO' and 'foo' differ only by casing" }],
    });
  });

  it("reports case-only duplicate members in a string literal union", () => {
    const result = validateSchema(
      parseDeclarations('type Output = "foo" | "fOO";', "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "'fOO' and 'foo' differ only by casing" },
        { message: "'fOO' and 'foo' differ only by casing" },
      ],
    });
  });

  it("reports mixed string and boolean discriminant types", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Output = { kind: true; x: number } | { kind: "b"; y: number };',
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: 'Expected: boolean literal discriminant; got: "b"',
        },
      ],
    });
  });

  it("reports duplicate string literals in a string union", () => {
    const result = validateSchema(
      parseDeclarations('type Output = "active" | "active";', "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Duplicate member 'active'" },
        { message: "Duplicate member 'active'" },
      ],
    });
  });

  it("allows a valid three-member interface union", () => {
    const result = validateSchema(
      parseDeclarations(
        [
          "type Output =",
          '  | { kind: "a"; x: number }',
          '  | { kind: "b"; y: string }',
          '  | { kind: "c"; z: boolean };',
        ].join("\n"),
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Shared type names
// ---------------------------------------------------------------------------

describe("validateSchema - shared type names", () => {
  function makeTemplateContext(namespaceSource: string): Schema {
    const ns = validateSchema(
      parseDeclarations(namespaceSource, "namespace"),
      null,
    );
    if (ns.kind !== "success") {
      throw new Error(
        `Namespace schema failed: ${ns.errors.map((e) => e.message).join(", ")}`,
      );
    }
    return ns;
  }

  it("accepts shared.X in template context when X exists in namespace schema", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Input = string;\ntype Output = shared.Profile;",
        "template",
      ),
      makeTemplateContext("type Profile = { name: string; };"),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts shared.X as a field type in template context", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Input = string;\ntype Output = { user: shared.Profile; };",
        "template",
      ),
      makeTemplateContext("type Profile = { name: string; };"),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts shared.X when X refers to another type in namespace schema", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Input = string;\ntype Output = shared.User;",
        "template",
      ),
      makeTemplateContext(
        [
          "type Address = { city: string; };",
          "type User = { name: string; address: Address; };",
        ].join("\n"),
      ),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("flattens a shared union member into a template union", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Input = shared.Status | 'custom';\ntype Output = string;",
        "template",
      ),
      makeTemplateContext("type Status = 'active' | 'inactive';"),
    );
    expect(result).toMatch({ kind: "success" });
    if (result.kind !== "success") throw new Error();
    const inputUnion = result.typeDeclarations["Input"]!.valueType as Union;
    const unionMembers = result.unionToMembers.get(inputUnion)!;
    expect(unionMembers.kind).toBe("strings");
    if (unionMembers.kind === "strings") {
      expect(Object.keys(unionMembers.values).sort()).toMatch([
        "active",
        "custom",
        "inactive",
      ]);
    }
  });

  it("accepts a recursive discriminated union in namespace schema used in template", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Input = shared.Node;\ntype Output = string;",
        "template",
      ),
      makeTemplateContext(
        [
          "type Node = Leaf | Branch;",
          "type Leaf = { kind: 'leaf'; value: number; };",
          "type Branch = { kind: 'branch'; left: Node; right: Node; };",
        ].join("\n"),
      ),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("reports error for shared.X in namespace context", () => {
    const result = validateSchema(
      parseDeclarations("type Output = shared.Profile;", "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "'shared' not allowed inside <namespace> elements" }],
    });
  });

  it("reports error for shared.X in meta context", () => {
    const result = validateSchema(
      parseDeclarations("type Meta = { field: shared.Profile; };", "meta"),
      null,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "'shared' not allowed inside <meta> elements" }],
    });
  });

  it("reports error when the referenced type does not exist in namespace schema", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Input = string;\ntype Output = shared.Missing;",
        "template",
      ),
      makeTemplateContext("type Profile = { name: string; };"),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unknown type 'Missing'", suggestions: ["Profile"] }],
    });
  });
});

// ---------------------------------------------------------------------------
// Schema output fields
// ---------------------------------------------------------------------------

describe("validateSchema - Schema fields", () => {
  it("collects field names and string literal values as identifiers", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Output = { name: string; role: "admin"; }',
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "success",
      identifiers: {
        name: { start: 16, end: 20 },
        role: { start: 30, end: 34 },
        admin: { start: 37, end: 42 },
      },
    });
  });

  it("collects string literal values from a string literal union as identifiers", () => {
    const result = validateSchema(
      parseDeclarations('type Output = "active" | "inactive";', "namespace"),
      null,
    );
    expect(result).toMatch({
      kind: "success",
      identifiers: {
        active: { start: 15, end: 21 },
        inactive: { start: 26, end: 34 },
      },
    });
  });

  it("collects field names and discriminant values from a discriminated union as identifiers", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Output = { kind: "a"; val: string } | { kind: "b"; num: number };',
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "success",
      identifiers: {
        kind: { start: 16, end: 20 },
        val: { start: 27, end: 30 },
        num: { start: 56, end: 59 },
        a: { start: 23, end: 24 },
        b: { start: 52, end: 53 },
      },
    });
  });

  it("keeps the first Span when an identifier appears multiple times", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Output = { name: string; user: { name: string; }; };",
        "namespace",
      ),
      null,
    );
    expect(result).toMatch({
      kind: "success",
      identifiers: {
        name: { start: 16, end: 20 },
        user: { start: 30, end: 34 },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// validateSchema - namingHints
// ---------------------------------------------------------------------------

describe("validateSchema - namingHints", () => {
  it("registers a top-level interface with the type name as the first piece", () => {
    const schema = validateSchema(
      parseDeclarations("type Output = { name: string; };", "namespace"),
      null,
    ) as { kind: "success" } & ReturnType<typeof validateSchema>;
    if (schema.kind !== "success") throw new Error();
    const iface = schema.typeDeclarations["Output"]!.valueType as Interface;
    expect(schema.namingHints.defaultScope.get(iface)).toMatch({
      namePieces: [{ kind: "type", name: "Output" }],
    });
  });

  it("registers a nested inline interface with the enclosing field name", () => {
    const schema = validateSchema(
      parseDeclarations(
        "type Output = { address: { street: string; city: string }; };",
        "namespace",
      ),
      null,
    );
    if (schema.kind !== "success") throw new Error();
    const outer = schema.typeDeclarations["Output"]!.valueType as Interface;
    const inner = outer.fields["address"]!.type as Interface;
    expect(schema.namingHints.defaultScope.get(inner)).toMatch({
      namePieces: [
        { kind: "type", name: "Output" },
        { kind: "field", name: "address" },
      ],
    });
  });

  it("registers a doubly-nested inline interface with two field pieces", () => {
    const schema = validateSchema(
      parseDeclarations(
        "type Output = { location: { address: { street: string } } };",
        "namespace",
      ),
      null,
    );
    if (schema.kind !== "success") throw new Error();
    const outer = schema.typeDeclarations["Output"]!.valueType as Interface;
    const mid = outer.fields["location"]!.type as Interface;
    const inner = mid.fields["address"]!.type as Interface;
    expect(schema.namingHints.defaultScope.get(inner)).toMatch({
      namePieces: [
        { kind: "type", name: "Output" },
        { kind: "field", name: "location" },
        { kind: "field", name: "address" },
      ],
    });
  });

  it("registers a top-level string-literal union with the type name as the first piece", () => {
    const schema = validateSchema(
      parseDeclarations('type Output = "a" | "b";', "namespace"),
      null,
    );
    if (schema.kind !== "success") throw new Error();
    const union = schema.typeDeclarations["Output"]!.valueType as Union;
    expect(schema.namingHints.defaultScope.get(union)).toMatch({
      namePieces: [{ kind: "type", name: "Output" }],
    });
  });

  it("registers a discriminated interface union and each member with its discriminant", () => {
    const schema = validateSchema(
      parseDeclarations(
        'type Output = { kind: "cat"; name: string } | { kind: "dog"; breed: string };',
        "namespace",
      ),
      null,
    );
    if (schema.kind !== "success") throw new Error();
    const union = schema.typeDeclarations["Output"]!.valueType as Union;
    const members = schema.unionToMembers.get(union)!;
    if (members.kind !== "interfaces") throw new Error();

    expect(schema.namingHints.defaultScope.get(union)).toMatch({
      namePieces: [{ kind: "type", name: "Output" }],
    });

    const catHint = schema.namingHints.defaultScope.get(
      members.members["cat"]!.resolved,
    );
    expect(catHint).toMatch({
      namePieces: [
        { kind: "type", name: "Output" },
        {
          kind: "member",
          discriminator: "kind",
          discriminant: { type: "string", value: "cat" },
        },
      ],
    });

    const dogHint = schema.namingHints.defaultScope.get(
      members.members["dog"]!.resolved,
    );
    expect(dogHint).toMatch({
      namePieces: [
        { kind: "type", name: "Output" },
        {
          kind: "member",
          discriminator: "kind",
          discriminant: { type: "string", value: "dog" },
        },
      ],
    });
  });

  it("registers boolean-discriminated union members with boolean discriminant type", () => {
    const schema = validateSchema(
      parseDeclarations(
        "type Output = { success: true; value: string } | { success: false; error: string };",
        "namespace",
      ),
      null,
    );
    if (schema.kind !== "success") throw new Error();
    const union = schema.typeDeclarations["Output"]!.valueType as Union;
    const members = schema.unionToMembers.get(union)!;
    if (members.kind !== "interfaces") throw new Error();

    const trueHint = schema.namingHints.defaultScope.get(
      members.members["true"]!.resolved,
    );
    expect(trueHint).toMatch({
      namePieces: [
        { kind: "type", name: "Output" },
        {
          kind: "member",
          discriminator: "success",
          discriminant: { type: "boolean", value: true },
        },
      ],
    });

    const falseHint = schema.namingHints.defaultScope.get(
      members.members["false"]!.resolved,
    );
    expect(falseHint).toMatch({
      namePieces: [
        { kind: "type", name: "Output" },
        {
          kind: "member",
          discriminator: "success",
          discriminant: { type: "boolean", value: false },
        },
      ],
    });
  });

  it("traverses into an array element type to register nested interfaces", () => {
    const schema = validateSchema(
      parseDeclarations("type Output = { name: string }[];", "namespace"),
      null,
    );
    if (schema.kind !== "success") throw new Error();
    const arrayType = schema.typeDeclarations["Output"]!.valueType;
    if (arrayType.kind !== "array") throw new Error();
    const iface = arrayType.elementType as Interface;
    expect(schema.namingHints.defaultScope.get(iface)).toMatch({
      namePieces: [{ kind: "type", name: "Output" }],
    });
  });

  it("populates the shared scope from the namespace schema's defaultScope", () => {
    const ns = validateSchema(
      parseDeclarations("type Profile = { name: string; };", "namespace"),
      null,
    );
    if (ns.kind !== "success") throw new Error();
    const template = validateSchema(
      parseDeclarations(
        "type Input = string;\ntype Output = shared.Profile;",
        "template",
      ),
      ns,
    );
    if (template.kind !== "success") throw new Error();
    // shared scope is the namespace's defaultScope
    expect(template.namingHints.shared).toBe(ns.namingHints.defaultScope);
  });
});

// ---------------------------------------------------------------------------
// validateSchema - definition links
// ---------------------------------------------------------------------------

describe("validateSchema - definition links", () => {
  it("returns empty definition links when schema has no type references", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Output = { name: string; count: number; };",
        "namespace",
      ),
      null,
    );
    if (result.kind !== "success") throw new Error();
    expect(result.definitionLinks).toMatch([]);
  });

  it("populates definition links for local type references in interface fields", () => {
    const source = [
      "type Output = { status: Status; };",
      'type Status = "active" | "inactive";',
    ].join("\n");
    const result = validateSchema(
      parseDeclarations(source, "namespace", "schema.ts"),
      null,
    );
    if (result.kind !== "success") throw new Error();

    expect(result.definitionLinks).toMatch([
      {
        reference: {
          start: 24,
          end: 30,
          path: "schema.ts",
        },
        definition: {
          start: 40,
          end: 46,
          path: "schema.ts",
        },
      },
    ]);
  });

  it("populates definition links for nested type references in arrays, records, optionals, and unions", () => {
    const source = [
      "type Output = {",
      "  items: Item[];",
      "  map: { [key: string]: Item };",
      "  opt?: Item;",
      "  result: Success | Failure;",
      "};",
      "type Item = { id: string; };",
      "type Success = { ok: true; };",
      "type Failure = { ok: false; };",
    ].join("\n");
    const result = validateSchema(
      parseDeclarations(source, "internal", "schema.ts"),
      null,
    );
    if (result.kind !== "success") throw new Error();

    expect(result.definitionLinks).toMatch([
      {
        reference: { start: 25, end: 29, path: "schema.ts" },
        definition: { start: 116, end: 120, path: "schema.ts" },
      },
      {
        reference: { start: 57, end: 61, path: "schema.ts" },
        definition: { start: 116, end: 120, path: "schema.ts" },
      },
      {
        reference: { start: 73, end: 77, path: "schema.ts" },
        definition: { start: 116, end: 120, path: "schema.ts" },
      },
      {
        reference: { start: 89, end: 96, path: "schema.ts" },
        definition: { start: 145, end: 152, path: "schema.ts" },
      },
      {
        reference: { start: 99, end: 106, path: "schema.ts" },
        definition: { start: 175, end: 182, path: "schema.ts" },
      },
    ]);
  });

  it("populates definition links for namespaced and local type references in template context", () => {
    const nsSource = [
      "type Profile = { name: string; address: Address; };",
      "type Address = { street: string; };",
    ].join("\n");
    const ns = validateSchema(
      parseDeclarations(nsSource, "namespace", "shared.ts"),
      null,
    );
    // Verify definition link within the namespace schema itself
    expect(ns).toMatch({
      kind: "success",
      definitionLinks: [
        {
          reference: { start: 40, end: 47, path: "shared.ts" },
          definition: { start: 57, end: 64, path: "shared.ts" },
        },
      ],
    });
    if (ns.kind !== "success") throw new Error();

    const templateSource = [
      "type Input = { user: shared.Profile; local: Extra; };",
      "type Extra = { note: string; };",
      "type Output = shared.Address;",
    ].join("\n");
    const template = validateSchema(
      parseDeclarations(templateSource, "template", "template.ts"),
      ns,
    );
    expect(template).toMatch({
      kind: "success",
      definitionLinks: [
        {
          reference: {
            start: 28,
            end: 35,
            path: "template.ts",
          },
          definition: {
            start: 5,
            end: 12,
            path: "shared.ts",
          },
        },
        {
          reference: {
            start: 44,
            end: 49,
            path: "template.ts",
          },
          definition: {
            start: 59,
            end: 64,
            path: "template.ts",
          },
        },
        {
          reference: {
            start: 107,
            end: 114,
            path: "template.ts",
          },
          definition: {
            start: 57,
            end: 64,
            path: "shared.ts",
          },
        },
      ],
    });
  });

  describe("@omitDefault decorator validation", () => {
    it("allows @omitDefault on primitive fields", () => {
      const result = validateSchema(
        parseDeclarations(
          `type Output = {
            /// @omitDefault
            str: string;
            /// @omitDefault
            num: number;
            /// @omitDefault
            int: integer;
            /// @omitDefault
            bool: boolean;
          };`,
          "namespace",
        ),
        null,
      );
      expect([result]).toMatch([{ kind: "success" }]);
    });

    it("allows @omitDefault on array fields", () => {
      const result = validateSchema(
        parseDeclarations(
          `type Output = {
            /// @omitDefault
            tags: string[];
            /// @omitDefault
            matrix: number[][];
          };`,
          "namespace",
        ),
        null,
      );
      expect([result]).toMatch([{ kind: "success" }]);
    });

    it("allows @omitDefault on optional fields", () => {
      const result = validateSchema(
        parseDeclarations(
          `type Status = "active" | "inactive";
          type Output = {
            /// @omitDefault
            optStr?: string;
            /// @omitDefault
            optUnion?: Status;
            /// @omitDefault
            optNested?: { a: string };
          };`,
          "namespace",
        ),
        null,
      );
      expect([result]).toMatch([{ kind: "success" }]);
    });

    it("allows @omitDefault on type aliases resolving to primitive or array", () => {
      const result = validateSchema(
        parseDeclarations(
          `type Text = string;
          type List = number[];
          type Output = {
            /// @omitDefault
            name: Text;
            /// @omitDefault
            items: List;
          };`,
          "namespace",
        ),
        null,
      );
      expect([result]).toMatch([{ kind: "success" }]);
    });

    it("rejects @omitDefault on string literal fields", () => {
      const source = `type Output = {
        /// @omitDefault
        kind: "fixed";
      };`;
      const result = validateSchema(
        parseDeclarations(source, "namespace"),
        null,
      );
      const start = source.indexOf("@omitDefault");
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            span: { start, end: start + "@omitDefault".length },
            message:
              "'@omitDefault' can only be applied to optional, array, or primitive fields",
          },
        ],
      });
    });

    it("rejects @omitDefault on boolean literal fields", () => {
      const source = `type Output = {
        /// @omitDefault
        enabled: true;
      };`;
      const result = validateSchema(
        parseDeclarations(source, "namespace"),
        null,
      );
      const start = source.indexOf("@omitDefault");
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            span: { start, end: start + "@omitDefault".length },
            message:
              "'@omitDefault' can only be applied to optional, array, or primitive fields",
          },
        ],
      });
    });

    it("rejects @omitDefault on required interface fields", () => {
      const source = `type Child = { a: string };
      type Output = {
        /// @omitDefault
        inline: { a: string };
        /// @omitDefault
        named: Child;
      };`;
      const result = validateSchema(
        parseDeclarations(source, "namespace"),
        null,
      );
      const first = source.indexOf("@omitDefault");
      const second = source.indexOf("@omitDefault", first + 1);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            span: { start: first, end: first + "@omitDefault".length },
            message:
              "'@omitDefault' can only be applied to optional, array, or primitive fields",
          },
          {
            span: { start: second, end: second + "@omitDefault".length },
            message:
              "'@omitDefault' can only be applied to optional, array, or primitive fields",
          },
        ],
      });
    });

    it("rejects @omitDefault on required union fields", () => {
      const source = `type Status = "active" | "inactive";
      type Output = {
        /// @omitDefault
        status: Status;
        /// @omitDefault
        inlineStatus: "yes" | "no";
      };`;
      const result = validateSchema(
        parseDeclarations(source, "namespace"),
        null,
      );
      const first = source.indexOf("@omitDefault");
      const second = source.indexOf("@omitDefault", first + 1);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            span: { start: first, end: first + "@omitDefault".length },
            message:
              "'@omitDefault' can only be applied to optional, array, or primitive fields",
          },
          {
            span: { start: second, end: second + "@omitDefault".length },
            message:
              "'@omitDefault' can only be applied to optional, array, or primitive fields",
          },
        ],
      });
    });

    it("rejects @omitDefault on record and any fields", () => {
      const source = `type Output = {
        /// @omitDefault
        map: { [k: string]: number };
        /// @omitDefault
        data: any;
      };`;
      const result = validateSchema(
        parseDeclarations(source, "internal"),
        null,
      );
      const first = source.indexOf("@omitDefault");
      const second = source.indexOf("@omitDefault", first + 1);
      expect(result).toMatch({
        kind: "error",
        errors: [
          {
            span: { start: first, end: first + "@omitDefault".length },
            message:
              "'@omitDefault' can only be applied to optional, array, or primitive fields",
          },
          {
            span: { start: second, end: second + "@omitDefault".length },
            message:
              "'@omitDefault' can only be applied to optional, array, or primitive fields",
          },
        ],
      });
    });
  });
});
