import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { MappedText } from "../util/shared-types.js";
import { EMPTY_SCHEMA } from "./empty-schema.js";
import { parseSchema } from "./schema-parser.js";
import type {
  Interface,
  SchemaValidationContext,
  TypeDeclaration,
  Union,
} from "./schema-types.js";
import { validateSchema } from "./schema-validator.js";

function textNode(source: string): MappedText {
  return {
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

function parseDeclarations(source: string): {
  readonly [name: string]: TypeDeclaration;
} {
  const result = parseSchema(textNode(source));
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.typeDeclarations;
}

// ---------------------------------------------------------------------------
// Success cases
// ---------------------------------------------------------------------------

describe("validateSchema – success", () => {
  it("validates a simple interface", () => {
    const result = validateSchema(
      parseDeclarations("type Output = { name: string; };"),
      NAMESPACE,
    );
    expect([result]).toMatch([{ kind: "success" }]);
  });

  it("validates a string literal union", () => {
    const result = validateSchema(
      parseDeclarations('type Output = "active" | "inactive";'),
      NAMESPACE,
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
      ),
      NAMESPACE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a schema containing any", () => {
    const result = validateSchema(
      parseDeclarations("type Output = any;"),
      NAMESPACE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a schema containing a boolean literal field", () => {
    const result = validateSchema(
      parseDeclarations("type Output = { flag: true; };"),
      NAMESPACE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a boolean-discriminated union", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Output = { success: true; value: string } | { success: false; error: string };",
      ),
      NAMESPACE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a record type", () => {
    const result = validateSchema(
      parseDeclarations("type Output = { [key: string]: number };"),
      NAMESPACE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a valid Meta interface", () => {
    const result = validateSchema(
      parseDeclarations("type Meta = { model: string; temperature: number; };"),
      META,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts a Meta field with a string literal union type", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Meta = { role: "admin" | "user" | "FOO/-BAR_-3.1"; }',
      ),
      META,
    );
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Required type
// ---------------------------------------------------------------------------

describe("validateSchema – required type", () => {
  it("reports missing Input/Output in template context", () => {
    const result = validateSchema(parseDeclarations(""), TEMPLATE);
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Missing required type 'Input'" },
        { message: "Missing required type 'Output'" },
      ],
    });
  });

  it("reports missing Meta in meta context", () => {
    const result = validateSchema(parseDeclarations(""), META);
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Missing required type 'Meta'" }],
    });
  });

  it("reports missing Input/Output in tool context", () => {
    const result = validateSchema(parseDeclarations(""), TOOL);
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Missing required type 'Input'" },
        { message: "Missing required type 'Output'" },
      ],
    });
  });

  it("accepts empty declarations in namespace context (no required types)", () => {
    const result = validateSchema(parseDeclarations(""), NAMESPACE);
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Naming errors
// ---------------------------------------------------------------------------

describe("validateSchema – naming errors", () => {
  it("reports a type name starting with lowercase", () => {
    const result = validateSchema(
      parseDeclarations("type response = { name: string; };"),
      NAMESPACE,
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
      parseDeclarations("type Output = { Name: string; };"),
      NAMESPACE,
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
      parseDeclarations("type Output = { myField: string; myfield: number; };"),
      NAMESPACE,
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
      parseDeclarations("type Output = '3foo';"),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "String must start with a letter" }],
    });
  });

  it("reports an invalid string literal containing invalid character", () => {
    const result = validateSchema(
      parseDeclarations("type Output = 'foo bar';"),
      NAMESPACE,
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
      parseDeclarations("type Output = { value: Unknown; };"),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unknown type 'Unknown'" }],
    });
  });

  it("reports a direct circular reference", () => {
    const result = validateSchema(
      parseDeclarations("type Output = { child: Output; };"),
      NAMESPACE,
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
      ),
      NAMESPACE,
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
          "type Input = integer;",
        ].join("\n"),
      ),
      TEMPLATE,
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
          "type Input = integer;",
        ].join("\n"),
      ),
      TOOL,
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
      parseDeclarations("type Output = string | number;"),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected: string literal or interface" }],
    });
  });

  it("reports a union with an array member", () => {
    const result = validateSchema(
      parseDeclarations('type Output = "a"[] | "b"[];'),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected: string literal or interface" }],
    });
  });

  it("reports a boolean literal as a direct union member", () => {
    const result = validateSchema(
      parseDeclarations("type Output = true | false;"),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected: string literal or interface" }],
    });
  });

  it("reports an any type as a direct union member", () => {
    const result = validateSchema(
      parseDeclarations("type Output = any | string;"),
      NAMESPACE,
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
      ),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Expected: string literal" }],
    });
  });

  it("reports a union mixing interfaces and strings (interface first)", () => {
    const result = validateSchema(
      parseDeclarations('type Output = { kind: "active" } | "inactive";'),
      NAMESPACE,
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
      parseDeclarations("type Output = { kind: string; } | { kind: string; };"),
      NAMESPACE,
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
      parseDeclarations('type Output = {} | { kind: "b"; };'),
      NAMESPACE,
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

  it("reports an optional discriminator field", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Output = { kind?: "a"; x: number } | { kind?: "b"; y: number };',
      ),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Discriminator ('kind') can't be optional" }],
    });
  });

  it("reports interface union members with mismatched discriminator field names", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Output = { kind: "a"; value: string } | { type: "b"; value: string };',
      ),
      NAMESPACE,
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
      ),
      NAMESPACE,
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
      ),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "'fOO' and 'foo' differ only by casing" }],
    });
  });

  it("reports case-only duplicate members in a string literal union", () => {
    const result = validateSchema(
      parseDeclarations('type Output = "foo" | "fOO";'),
      NAMESPACE,
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
      ),
      NAMESPACE,
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
      parseDeclarations('type Output = "active" | "active";'),
      NAMESPACE,
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
      ),
      NAMESPACE,
    );
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Shared type names
// ---------------------------------------------------------------------------

describe("validateSchema – shared type names", () => {
  function makeTemplateContext(
    namespaceSource: string,
  ): SchemaValidationContext {
    const ns = validateSchema(parseDeclarations(namespaceSource), NAMESPACE);
    if (ns.kind !== "success") {
      throw new Error(
        `Namespace schema failed: ${ns.errors.map((e) => e.message).join(", ")}`,
      );
    }
    return { kind: "template", namespaceSchema: ns };
  }

  it("accepts shared.X in template context when X exists in namespace schema", () => {
    const result = validateSchema(
      parseDeclarations("type Input = string;\ntype Output = shared.Profile;"),
      makeTemplateContext("type Profile = { name: string; };"),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts shared.X as a field type in template context", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Input = string;\ntype Output = { user: shared.Profile; };",
      ),
      makeTemplateContext("type Profile = { name: string; };"),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("reports error for shared.X in namespace context", () => {
    const result = validateSchema(
      parseDeclarations("type Output = shared.Profile;"),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "'shared' not allowed inside <namespace> elements" }],
    });
  });

  it("reports error for shared.X in meta context", () => {
    const result = validateSchema(
      parseDeclarations("type Meta = { field: shared.Profile; };"),
      META,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "'shared' not allowed inside <meta> elements" }],
    });
  });

  it("reports error when the referenced type does not exist in namespace schema", () => {
    const result = validateSchema(
      parseDeclarations("type Input = string;\ntype Output = shared.Missing;"),
      { kind: "template", namespaceSchema: EMPTY_SCHEMA },
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unknown type 'Missing'" }],
    });
  });

  it("reports error for shared.X in tool context", () => {
    const result = validateSchema(
      parseDeclarations("type Input = string;\ntype Output = shared.Profile;"),
      TOOL,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "'shared' not allowed inside <tool> elements" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Schema output fields
// ---------------------------------------------------------------------------

describe("validateSchema - Schema fields", () => {
  it("collects field names and string literal values as identifiers", () => {
    const result = validateSchema(
      parseDeclarations('type Output = { name: string; role: "admin"; }'),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "success",
      identifiers: new Set(["name", "role", "admin"]),
    });
  });

  it("collects string literal values from a string literal union as identifiers", () => {
    const result = validateSchema(
      parseDeclarations('type Output = "active" | "inactive";'),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "success",
      identifiers: new Set(["active", "inactive"]),
    });
  });

  it("collects field names and discriminant values from a discriminated union as identifiers", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Output = { kind: "a"; val: string } | { kind: "b"; num: number };',
      ),
      NAMESPACE,
    );
    expect(result).toMatch({
      kind: "success",
      identifiers: new Set(["kind", "val", "num", "a", "b"]),
    });
  });
});

const NAMESPACE: SchemaValidationContext = {
  kind: "namespace",
};

const META: SchemaValidationContext = { kind: "meta" };

const TEMPLATE: SchemaValidationContext = {
  kind: "template",
  namespaceSchema: EMPTY_SCHEMA,
};

const TOOL: SchemaValidationContext = {
  kind: "tool",
  namespaceSchema: EMPTY_SCHEMA,
};

// ---------------------------------------------------------------------------
// validateSchema – namingHints
// ---------------------------------------------------------------------------

describe("validateSchema – namingHints", () => {
  it("registers a top-level interface with the type name as the first piece", () => {
    const schema = validateSchema(
      parseDeclarations("type Output = { name: string; };"),
      NAMESPACE,
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
      ),
      NAMESPACE,
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
      ),
      NAMESPACE,
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
      parseDeclarations('type Output = "a" | "b";'),
      NAMESPACE,
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
      ),
      NAMESPACE,
    );
    if (schema.kind !== "success") throw new Error();
    const union = schema.typeDeclarations["Output"]!.valueType as Union;
    const members = schema.unionToMembers.get(union)!;
    if (members.kind !== "interfaces") throw new Error();

    expect(schema.namingHints.defaultScope.get(union)).toMatch({
      namePieces: [{ kind: "type", name: "Output" }],
    });

    const catHint = schema.namingHints.defaultScope.get(
      members.members["cat"]!,
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
      members.members["dog"]!,
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
      ),
      NAMESPACE,
    );
    if (schema.kind !== "success") throw new Error();
    const union = schema.typeDeclarations["Output"]!.valueType as Union;
    const members = schema.unionToMembers.get(union)!;
    if (members.kind !== "interfaces") throw new Error();

    const trueHint = schema.namingHints.defaultScope.get(
      members.members["true"]!,
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
      members.members["false"]!,
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
      parseDeclarations("type Output = { name: string }[];"),
      NAMESPACE,
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
      parseDeclarations("type Profile = { name: string; };"),
      NAMESPACE,
    );
    if (ns.kind !== "success") throw new Error();
    const template = validateSchema(
      parseDeclarations("type Input = string;\ntype Output = shared.Profile;"),
      { kind: "template", namespaceSchema: ns },
    );
    if (template.kind !== "success") throw new Error();
    // shared scope is the namespace's defaultScope
    expect(template.namingHints.shared).toBe(ns.namingHints.defaultScope);
  });
});
