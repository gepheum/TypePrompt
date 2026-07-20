import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { MappedText } from "../util/common-types.js";
import { parseSchema } from "./schema-parser.js";
import type { SchemaValidationContext } from "./schema-types.js";
import { validateSchema } from "./schema-validator.js";

const TEMPLATE: SchemaValidationContext = {
  kind: "template",
  argTypeNames: [],
};
const META: SchemaValidationContext = { kind: "meta" };

function textNode(source: string): MappedText {
  return {
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

function parseDeclarations(source: string) {
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
      parseDeclarations("type Response = { name: string; };"),
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a string literal union", () => {
    const result = validateSchema(
      parseDeclarations('type Response = "active" | "inactive";'),
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates a cross-type reference", () => {
    const result = validateSchema(
      parseDeclarations(
        [
          "type Response = { status: Status; };",
          'type Status = "active" | "inactive";',
        ].join("\n"),
      ),
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("validates with argTypeNames", () => {
    const result = validateSchema(
      parseDeclarations(
        [
          "type Response = { value: string; };",
          "type Input = { query: string; };",
        ].join("\n"),
      ),
      { kind: "template", argTypeNames: ["Input"] },
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
      parseDeclarations('type Meta = { role: "admin" | "user"; }'),
      META,
    );
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Required type
// ---------------------------------------------------------------------------

describe("validateSchema – required type", () => {
  it("reports missing Response in template context", () => {
    const result = validateSchema(parseDeclarations(""), TEMPLATE);
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Missing required type 'Response'" }],
    });
  });

  it("reports missing Meta in meta context", () => {
    const result = validateSchema(parseDeclarations(""), META);
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Missing required type 'Meta'" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Naming errors
// ---------------------------------------------------------------------------

describe("validateSchema – naming errors", () => {
  it("reports a type name starting with lowercase", () => {
    const result = validateSchema(
      parseDeclarations("type response = { name: string; };"),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Must start with uppercase letter and contain only alphanumeric characters",
        },
        {
          message: "Missing required type 'Response'",
        },
      ],
    });
  });

  it("reports a field name starting with uppercase", () => {
    const result = validateSchema(
      parseDeclarations("type Response = { Name: string; };"),
      TEMPLATE,
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

  it("reports a string literal value starting with uppercase", () => {
    const result = validateSchema(
      parseDeclarations('type Response = "Active" | "inactive";'),
      TEMPLATE,
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
        "type Response = { myField: string; myfield: number; };",
      ),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /conflicts with/ }],
    });
  });
});

// ---------------------------------------------------------------------------
// Type reference errors
// ---------------------------------------------------------------------------

describe("validateSchema - type references", () => {
  it("reports an unknown type reference", () => {
    const result = validateSchema(
      parseDeclarations("type Response = { value: Unknown; };"),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unknown type 'Unknown'" }],
    });
  });

  it("reports a direct circular reference", () => {
    const result = validateSchema(
      parseDeclarations("type Response = { child: Response; };"),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Type 'Response' circularly references itself" }],
    });
  });

  it("reports an indirect circular reference", () => {
    const result = validateSchema(
      parseDeclarations(
        [
          "type Response = { next: Other; };",
          "type Other = { back: Response; };",
        ].join("\n"),
      ),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Type 'Response' circularly references itself" },
        { message: "Type 'Other' circularly references itself" },
      ],
    });
  });

  it("reports an unused type", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Response = { name: string; };\ntype Unused = string;",
      ),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Type 'Unused' is not used" }],
    });
  });

  it("does not flag a type used only via an argTypeName as unused", () => {
    const result = validateSchema(
      parseDeclarations(
        [
          "type Response = { value: string; };",
          "type Input = { items: Helper[]; };",
          "type Helper = { id: string; };",
        ].join("\n"),
      ),
      { kind: "template", argTypeNames: ["Input"] },
    );
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Union type errors
// ---------------------------------------------------------------------------

describe("validateSchema - union type errors", () => {
  it("reports a union with a primitive member", () => {
    const result = validateSchema(
      parseDeclarations("type Response = string | number;"),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: /Union members must be either all strings or all interfaces/,
        },
      ],
    });
  });

  it("reports a union with an array member", () => {
    const result = validateSchema(
      parseDeclarations('type Response = "a"[] | "b"[];'),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: /Union members must be either all strings or all interfaces/,
        },
      ],
    });
  });

  it("reports a union mixing strings and interfaces", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Response = "active" | { kind: "inactive"; value: string };',
      ),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: /Union members must be either all strings or all interfaces/,
        },
      ],
    });
  });

  it("reports an interface union member without a string literal discriminator", () => {
    const result = validateSchema(
      parseDeclarations(
        "type Response = { kind: string; } | { kind: string; };",
      ),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "The first field of an interface in a union must be a string literal",
        },
        {
          message:
            "The first field of an interface in a union must be a string literal",
        },
      ],
    });
  });

  it("reports an interface union member with no first field", () => {
    const result = validateSchema(
      parseDeclarations('type Response = {} | { kind: "b"; };'),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "The first field of an interface in a union must be a string literal",
        },
      ],
    });
  });

  it("reports interface union members with mismatched discriminator field names", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Response = { kind: "a"; value: string } | { type: "b"; value: string };',
      ),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message:
            /The first field of an interface in a union must have the same name as/,
        },
      ],
    });
  });

  it("reports duplicate discriminator values in an interface union", () => {
    const result = validateSchema(
      parseDeclarations(
        'type Response = { kind: "same"; x: number } | { kind: "same"; y: number };',
      ),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /duplicated/ }, { message: /duplicated/ }],
    });
  });

  it("reports duplicate string literals in a string union", () => {
    const result = validateSchema(
      parseDeclarations('type Response = "active" | "active";'),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /duplicated/ }, { message: /duplicated/ }],
    });
  });

  it("allows a valid three-member interface union", () => {
    const result = validateSchema(
      parseDeclarations(
        [
          "type Response =",
          '  | { kind: "a"; x: number }',
          '  | { kind: "b"; y: string }',
          '  | { kind: "c"; z: boolean };',
        ].join("\n"),
      ),
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Meta context errors
// ---------------------------------------------------------------------------

describe("validateSchema – meta context", () => {
  it("reports Meta type not being an interface", () => {
    const result = validateSchema(
      parseDeclarations("type Meta = string;"),
      META,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Type 'Meta' must be an interface" }],
    });
  });

  it("reports a Meta field with array type", () => {
    const result = validateSchema(
      parseDeclarations("type Meta = { tags: string[]; };"),
      META,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Fields of 'Meta' must be strings, numbers, booleans" },
      ],
    });
  });

  it("reports a Meta field with interface type", () => {
    const result = validateSchema(
      parseDeclarations("type Meta = { nested: { value: string }; };"),
      META,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Fields of 'Meta' must be strings, numbers, booleans" },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Schema output fields
// ---------------------------------------------------------------------------

describe("validateSchema - Schema fields", () => {
  it("collects field names and string literal values as identifiers", () => {
    const result = validateSchema(
      parseDeclarations('type Response = { name: string; role: "admin"; }'),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      identifiers: new Set(["name", "role", "admin"]),
    });
  });

  it("collects string literal values from unions as identifiers", () => {
    const result = validateSchema(
      parseDeclarations('type Response = "active" | "inactive";'),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      identifiers: new Set(["active", "inactive"]),
    });
  });
});
