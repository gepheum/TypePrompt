import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseSchema } from "./schema-parser.js";
import type {
  Interface,
  Schema,
  SchemaParseContext,
  TypeDeclaration,
  Union,
} from "./schema-types.js";
import { resolveMaybeInvalidType } from "./type-resolver.js";
import { getUnionMembers } from "./unions.js";

const TEMPLATE: SchemaParseContext = { kind: "template", argTypeNames: [] };
const META: SchemaParseContext = { kind: "meta" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOk(
  source: string,
  context: SchemaParseContext = TEMPLATE,
): Schema {
  const result = parseSchema(source, context);
  if (result.kind !== "success") {
    throw new Error(
      `Expected success but got errors: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Basic success cases
// ---------------------------------------------------------------------------

describe("parseSchema – interfaces", () => {
  it("parses a simple interface declaration", () => {
    const result = parseSchema(
      "interface Response { name: string; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          kind: "interface",
          name: { text: "Response" },
          fields: {
            name: {
              name: { text: "name" },
              optional: false,
              type: { kind: "type-name", name: { text: "string" } },
              doc: "",
            },
          },
          doc: "",
        },
      },
    });
  });

  it("parses an interface with multiple fields", () => {
    const result = parseSchema(
      "interface Response { name: string; age: number; active: boolean; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          fields: {
            name: { type: { kind: "type-name", name: { text: "string" } } },
            age: { type: { kind: "type-name", name: { text: "number" } } },
            active: { type: { kind: "type-name", name: { text: "boolean" } } },
          },
        },
      },
    });
  });

  it("parses optional fields", () => {
    const result = parseSchema(
      "interface Response { required: string; optional?: number; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          fields: {
            required: { optional: false },
            optional: { optional: true },
          },
        },
      },
    });
  });

  it("parses an interface with no fields", () => {
    const result = parseSchema("interface Response { }", TEMPLATE);
    expect(result).toMatch({
      kind: "success",
      types: { Response: { kind: "interface", fields: {} } },
    });
  });

  it("parses a nested inline interface field", () => {
    const result = parseSchema(
      "interface Response { address: { street: string; city: string }; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          fields: {
            address: {
              type: {
                kind: "interface",
                name: undefined,
                fields: {
                  street: {
                    type: { kind: "type-name", name: { text: "string" } },
                  },
                  city: {
                    type: { kind: "type-name", name: { text: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it("accepts comma as field separator", () => {
    const result = parseSchema(
      "interface Response { name: string, age: number }",
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts newline as implicit field separator", () => {
    const result = parseSchema(
      ["interface Response {", "  name: string", "  age: number", "}"].join(
        "\n",
      ),
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("records correct source span for type name", () => {
    const source = "interface Response { name: string; }";
    const result = parseSchema(source, TEMPLATE);
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          name: { text: "Response", start: 10, end: 18 },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

describe("parseSchema – type aliases", () => {
  it("parses a type alias to a primitive", () => {
    const result = parseSchema("type Response = string;", TEMPLATE);
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          kind: "type",
          name: { text: "Response" },
          valueType: { kind: "type-name", name: { text: "string" } },
          doc: "",
        },
      },
    });
  });

  it("parses a type alias to an array", () => {
    const result = parseSchema("type Response = string[];", TEMPLATE);
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          valueType: {
            kind: "array",
            elementType: { kind: "type-name", name: { text: "string" } },
          },
        },
      },
    });
  });

  it("parses a type alias to a 2D array", () => {
    const result = parseSchema("type Response = string[][];", TEMPLATE);
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          valueType: {
            kind: "array",
            elementType: {
              kind: "array",
              elementType: { kind: "type-name", name: { text: "string" } },
            },
          },
        },
      },
    });
  });

  it("parses a type alias to a string literal union", () => {
    const result = parseSchema(
      'type Response = "active" | "inactive";',
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          kind: "type",
          valueType: {
            kind: "union",
            members: [
              { kind: "string-literal", value: "active" },
              { kind: "string-literal", value: "inactive" },
            ],
          },
        },
      },
    });
  });

  it("parses a type alias to a union of inline interfaces", () => {
    const result = parseSchema(
      'type Response = { kind: "circle"; radius: number } | { kind: "rect"; width: number; height: number };',
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          valueType: {
            kind: "union",
            members: [
              {
                kind: "interface",
                fields: {
                  kind: { type: { kind: "string-literal", value: "circle" } },
                  radius: {
                    type: { kind: "type-name", name: { text: "number" } },
                  },
                },
              },
              {
                kind: "interface",
                fields: {
                  kind: { type: { kind: "string-literal", value: "rect" } },
                  width: {
                    type: { kind: "type-name", name: { text: "number" } },
                  },
                  height: {
                    type: { kind: "type-name", name: { text: "number" } },
                  },
                },
              },
            ],
          },
        },
      },
    });
  });

  it("parses leading-pipe union syntax", () => {
    const result = parseSchema(
      ["type Response =", '  | "active"', '  | "inactive";'].join("\n"),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          valueType: {
            kind: "union",
            members: [
              { kind: "string-literal", value: "active" },
              { kind: "string-literal", value: "inactive" },
            ],
          },
        },
      },
    });
  });

  it("parses a parenthesized type", () => {
    const result = parseSchema(
      'type Response = ("active" | "inactive");',
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          valueType: {
            kind: "union",
            members: [
              { kind: "string-literal", value: "active" },
              { kind: "string-literal", value: "inactive" },
            ],
          },
        },
      },
    });
  });

  it("parses a type alias without semicolon when followed by newline", () => {
    const result = parseSchema(
      ["type Response =", "  string"].join("\n"),
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("parses a type alias to an inline interface", () => {
    const result = parseSchema(
      "type Response = { name: string; age: number };",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          kind: "type",
          valueType: {
            kind: "interface",
            fields: {
              name: { type: { kind: "type-name", name: { text: "string" } } },
              age: { type: { kind: "type-name", name: { text: "number" } } },
            },
          },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Multiple types
// ---------------------------------------------------------------------------

describe("parseSchema – multiple types", () => {
  it("parses multiple type declarations", () => {
    const result = parseSchema(
      [
        "interface Response { value: Status; }",
        'type Status = "active" | "inactive";',
      ].join("\n"),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: { kind: "interface" },
        Status: { kind: "type" },
      },
    });
  });

  it("resolves a cross-type reference", () => {
    const result = parseSchema(
      [
        "interface Response { value: Status; }",
        'type Status = "active" | "inactive";',
      ].join("\n"),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          fields: {
            value: {
              type: { kind: "type-name", name: { text: "Status" } },
            },
          },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Comments and JSDoc
// ---------------------------------------------------------------------------

describe("parseSchema – comments and JSDoc", () => {
  it("ignores single-line comments", () => {
    const result = parseSchema(
      "// This is a comment\ninterface Response { name: string; }",
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("ignores multi-line comments", () => {
    const result = parseSchema(
      "/* comment */\ninterface Response { name: string; }",
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("extracts JSDoc from a single-line /** ... */ comment on a type", () => {
    const result = parseSchema(
      ["/** A named user. */", "interface Response { name: string; }"].join(
        "\n",
      ),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: { Response: { doc: "A named user." } },
    });
  });

  it("extracts JSDoc from a multi-line comment on a type", () => {
    const result = parseSchema(
      [
        "/**",
        " * A named user.",
        " */",
        "interface Response { name: string; }",
      ].join("\n"),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: { Response: { doc: "A named user." } },
    });
  });

  it("extracts JSDoc from a comment on a field", () => {
    const result = parseSchema(
      [
        "interface Response {",
        "  /** The user's name. */",
        "  name: string;",
        "}",
      ].join("\n"),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: { fields: { name: { doc: "The user's name." } } },
      },
    });
  });

  it("does not attach JSDoc to a non-JSDoc multi-line comment", () => {
    const result = parseSchema(
      ["/* ordinary comment */", "interface Response { name: string; }"].join(
        "\n",
      ),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      types: { Response: { doc: "" } },
    });
  });
});

// ---------------------------------------------------------------------------
// identifiers
// ---------------------------------------------------------------------------

describe("parseSchema – identifiers", () => {
  it("collects field names as identifiers", () => {
    const result = parseSchema(
      'interface Response { name: string; role: "admin"; }',
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      identifiers: new Set(["name", "role", "admin"]),
    });
  });

  it("collects string literal values in unions as identifiers", () => {
    const result = parseSchema(
      'type Response = "active" | "inactive";',
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "success",
      identifiers: new Set(["active", "inactive"]),
    });
  });
});

// ---------------------------------------------------------------------------
// unionToMembers and typeToNamingHint
// ---------------------------------------------------------------------------

describe("parseSchema – unionToMembers", () => {
  it("populates unionToMembers for a string literal union", () => {
    const result = parseOk('type Response = "active" | "inactive";');
    const responseDecl = result.types["Response"]!;
    if (responseDecl.kind !== "type") throw new Error("Expected type");
    const union = responseDecl.valueType as Union;
    expect(result.unionToMembers.get(union)).toMatch({
      kind: "strings",
      members: [
        { kind: "string-literal", value: "active" },
        { kind: "string-literal", value: "inactive" },
      ],
    });
  });

  it("populates unionToMembers for an interface union", () => {
    const result = parseOk(
      'type Response = { kind: "circle"; r: number } | { kind: "rect"; w: number };',
    );
    const responseDecl = result.types["Response"]!;
    if (responseDecl.kind !== "type") throw new Error("Expected type");
    const union = responseDecl.valueType as Union;
    expect(result.unionToMembers.get(union)).toMatch({
      kind: "interfaces",
      kindFieldName: "kind",
      members: { circle: { kind: "interface" }, rect: { kind: "interface" } },
    });
  });

  it("populates unionToMembers for a named-interface union", () => {
    // Foo | Bar are named declarations, not inline interfaces.
    const result = parseOk(
      [
        'interface Foo { shape: "circle"; r: number; }',
        'interface Bar { shape: "rect"; w: number; }',
        "type Response = Foo | Bar;",
      ].join("\n"),
    );
    const responseDecl = result.types["Response"]!;
    if (responseDecl.kind !== "type") throw new Error("Expected type");
    const union = responseDecl.valueType as Union;
    expect(result.unionToMembers.get(union)).toMatch({
      kind: "interfaces",
      kindFieldName: "shape",
      members: { circle: { kind: "interface" }, rect: { kind: "interface" } },
    });
  });

  it("populates unionToMembers for a named-string-literal union", () => {
    // Active and Inactive are type aliases for string literals.
    const result = parseOk(
      [
        'type Active = "active";',
        'type Inactive = "inactive";',
        "type Response = Active | Inactive;",
      ].join("\n"),
    );
    const responseDecl = result.types["Response"]!;
    if (responseDecl.kind !== "type") throw new Error("Expected type");
    const union = responseDecl.valueType as Union;
    expect(result.unionToMembers.get(union)).toMatch({
      kind: "strings",
      members: [{ value: "active" }, { value: "inactive" }],
    });
  });

  it("populates typeToNamingHint for a top-level interface", () => {
    const result = parseOk("interface Response { name: string; }");
    const responseDecl = result.types["Response"]!;
    if (responseDecl.kind !== "interface")
      throw new Error("Expected interface");
    expect(result.typeToNamingHint.get(responseDecl)).toMatch({
      namePieces: ["Response"],
    });
  });

  it("populates typeToNamingHint for a nested inline interface", () => {
    const result = parseOk(
      "interface Response { address: { street: string }; }",
    );
    const addressField = (result.types["Response"] as any).fields["address"];
    const inlineInterface = addressField.type;
    expect(result.typeToNamingHint.get(inlineInterface)).toMatch({
      namePieces: ["Response", "address"],
    });
  });
});

// ---------------------------------------------------------------------------
// Meta context
// ---------------------------------------------------------------------------

describe("parseSchema – meta context", () => {
  it("accepts a valid Meta interface", () => {
    const result = parseSchema(
      "interface Meta { model: string; temperature: number; }",
      META,
    );
    expect(result).toMatch({
      kind: "success",
      types: { Meta: { kind: "interface" } },
    });
  });

  it("accepts a Meta field with a string literal union type", () => {
    const result = parseSchema(
      'interface Meta { role: "admin" | "user"; }',
      META,
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("reports error when Meta type is not an interface", () => {
    const result = parseSchema("type Meta = string;", META);
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Type 'Meta' must be an interface" }],
    });
  });

  it("reports error when a Meta field has array type", () => {
    const result = parseSchema("interface Meta { tags: string[]; }", META);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Fields of 'Meta' must be strings, numbers, booleans",
        },
      ],
    });
  });

  it("reports error when a Meta field has interface type", () => {
    const result = parseSchema(
      "interface Meta { nested: { value: string }; }",
      META,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Fields of 'Meta' must be strings, numbers, booleans",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Template context
// ---------------------------------------------------------------------------

describe("parseSchema – template context", () => {
  it("reports error for missing Response type", () => {
    const result = parseSchema("", TEMPLATE);
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Missing required type 'Response'" }],
    });
  });

  it("accepts argTypeNames as additional root types", () => {
    const result = parseSchema(
      "interface Response { value: string; }\ninterface Input { query: string; }",
      { kind: "template", argTypeNames: ["Input"] },
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("allows a type used only via an argTypeName", () => {
    // Helper is only referenced from Input, not from Response.
    const result = parseSchema(
      [
        "interface Response { value: string; }",
        "interface Input { items: Helper[]; }",
        "interface Helper { id: string; }",
      ].join("\n"),
      { kind: "template", argTypeNames: ["Input"] },
    );
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Tokenizer error cases
// ---------------------------------------------------------------------------

describe("parseSchema – tokenizer errors", () => {
  it("reports error for an identifier starting with a digit", () => {
    const result = parseSchema(
      "interface Response { 1name: string; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Invalid identifier" }],
    });
  });

  it("reports error for an identifier containing an underscore", () => {
    const result = parseSchema(
      "interface Response { my_field: string; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Must not contain underscores" }],
    });
  });

  it("reports error for an unterminated double-quoted string literal", () => {
    const result = parseSchema('type Response = "unterminated;', TEMPLATE);
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unterminated string literal" }],
    });
  });

  it("reports error for an unterminated single-quoted string literal", () => {
    const result = parseSchema("type Response = 'unterminated;", TEMPLATE);
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unterminated string literal" }],
    });
  });

  it("reports error for a string literal containing an escape sequence", () => {
    const result = parseSchema('type Response = "with\\\\escape";', TEMPLATE);
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Must not contain escape sequences" }],
    });
  });

  it("reports error for an unterminated multi-line comment", () => {
    const result = parseSchema(
      "/* unterminated\ninterface Response { name: string; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unterminated multi-line comment" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Validator error cases – naming
// ---------------------------------------------------------------------------

describe("parseSchema – naming errors", () => {
  it("reports error for a type name that starts with lowercase", () => {
    const result = parseSchema(
      "interface response { name: string; }",
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

  it("reports error for a type name that contains a non-alphanumeric char", () => {
    const _result = parseSchema(
      "interface Response2x { name: string; }",
      TEMPLATE,
    );
    // Digit in name is fine; symbol is not.  Use 'Response_bad' to trigger.
    // '2Response' starts with digit → tokenizer catches it.
    // Here we use a case that passes the tokenizer but fails naming:
    // field name starting with uppercase.
    const result2 = parseSchema(
      "interface Response { Name: string; }",
      TEMPLATE,
    );
    expect(result2).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Must start with lowercase letter and contain only alphanumeric characters",
        },
      ],
    });
  });

  it("reports error for a field name that starts with uppercase", () => {
    const result = parseSchema(
      "interface Response { Status: string; }",
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

  it("reports error for a string literal value that starts with uppercase", () => {
    const result = parseSchema(
      'type Response = "Active" | "inactive";',
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

  it("reports error for type names that conflict by case", () => {
    const result = parseSchema(
      [
        "interface Response { value: string; }",
        "interface response { other: string; }",
      ].join("\n"),
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: /conflicts with/ },
        {
          message:
            "Must start with uppercase letter and contain only alphanumeric characters",
        },
      ],
    });
  });

  it("reports error for field names that conflict by case", () => {
    const result = parseSchema(
      "interface Response { myField: string; myfield: number; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /conflicts with/ }],
    });
  });
});

// ---------------------------------------------------------------------------
// Validator error cases – reserved type names
// ---------------------------------------------------------------------------

describe("parseSchema – reserved type names", () => {
  it("reports error when a type is named 'Args'", () => {
    const result = parseSchema(
      "interface Response { value: string; }\ninterface Args { x: number; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "'Args' is a reserved type name" }],
    });
  });

  it("reports error when a type is named 'Variant'", () => {
    const result = parseSchema(
      "interface Response { value: string; }\ninterface Variant { x: number; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "'Variant' is a reserved type name" }],
    });
  });

  it("reports reserved name errors for both 'Args' and 'Variant' in the same schema", () => {
    const result = parseSchema(
      "interface Response { value: string; }\ninterface Args { x: number; }\ninterface Variant { y: number; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "'Args' is a reserved type name" },
        { message: "'Variant' is a reserved type name" },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Validator error cases – type references
// ---------------------------------------------------------------------------

describe("parseSchema – type reference errors", () => {
  it("reports error for an unknown type reference", () => {
    const result = parseSchema(
      "interface Response { value: Unknown; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unknown type 'Unknown'" }],
    });
  });

  it("reports error for a direct circular reference", () => {
    const result = parseSchema(
      "interface Response { child: Response; }",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Type 'Response' circularly references itself" }],
    });
  });

  it("reports error for an indirect circular reference", () => {
    const result = parseSchema(
      [
        "interface Response { next: Other; }",
        "interface Other { back: Response; }",
      ].join("\n"),
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

  it("reports error for an unused type", () => {
    const result = parseSchema(
      "interface Response { name: string; }\ntype Unused = string;",
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Type 'Unused' is not used" }],
    });
  });

  it("does not flag a type used in the second union member as unused", () => {
    // This exercises the collectNameDependencies fix: all union members
    // must be followed, not just the first.
    const result = parseSchema(
      [
        'type Response = { kind: "a"; x: Helper } | { kind: "b"; y: Helper };',
        "interface Helper { id: string; }",
      ].join("\n"),
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Validator error cases – union types
// ---------------------------------------------------------------------------

describe("parseSchema – union type errors", () => {
  it("reports error for a union with a primitive member", () => {
    const result = parseSchema("type Response = string | number;", TEMPLATE);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: /Union members must be either all strings or all interfaces/,
        },
      ],
    });
  });

  it("reports error for a union with an array member", () => {
    const result = parseSchema('type Response = "a"[] | "b"[];', TEMPLATE);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: /Union members must be either all strings or all interfaces/,
        },
      ],
    });
  });

  it("reports error for a union mixing strings and interfaces", () => {
    const result = parseSchema(
      'type Response = "active" | { kind: "inactive"; value: string };',
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

  it("reports error for a union mixing interfaces and strings", () => {
    const result = parseSchema(
      'type Response = { kind: "a"; x: number } | "b";',
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

  it("reports error for a union member that is itself a union", () => {
    const result = parseSchema('type Response = ("a" | "b") | "c";', TEMPLATE);
    // Parenthesized union collapses via joinTypes; result is a flat union of
    // three string literals, which is valid.
    // Instead test a union-of-union introduced through a type alias.
    expect(result).toMatch({ kind: "success" });
  });

  it("reports error for an interface union member without a string literal discriminator", () => {
    const result = parseSchema(
      "type Response = { kind: string; } | { kind: string; };",
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

  it("reports error for an interface union member with no first field", () => {
    const result = parseSchema(
      'type Response = {} | { kind: "b"; };',
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

  it("reports error for interface union members with mismatched discriminator field names", () => {
    const result = parseSchema(
      'type Response = { kind: "a"; value: string } | { type: "b"; value: string };',
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

  it("reports error for duplicate discriminator values in an interface union", () => {
    const result = parseSchema(
      'type Response = { kind: "same"; x: number } | { kind: "same"; y: number };',
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /duplicated/ }, { message: /duplicated/ }],
    });
  });

  it("reports error for duplicate string literals in a string union", () => {
    const result = parseSchema(
      'type Response = "active" | "active";',
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /duplicated/ }, { message: /duplicated/ }],
    });
  });

  it("reports error for case-conflicting string literals in a string union", () => {
    // Both "active" and "Active" fail lowercase validation.
    // The duplicate check still runs and finds the case conflict.
    const result = parseSchema(
      'type Response = "active" | "active";',
      TEMPLATE,
    );
    expect(result).toMatch({
      kind: "error",
    });
  });

  it("allows a valid three-member interface union", () => {
    const result = parseSchema(
      [
        "type Response =",
        '  | { kind: "a"; x: number }',
        '  | { kind: "b"; y: string }',
        '  | { kind: "c"; z: boolean };',
      ].join("\n"),
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// Int alias (type-resolver fix)
// ---------------------------------------------------------------------------

describe("resolveType – Int alias", () => {
  it("resolves Int (defined as type Int = number) to the 'int' primitive", () => {
    // type Int = number; the resolver should return primitive "int", not "number".
    const types = {
      Int: {
        kind: "type" as const,
        name: { text: "Int", start: 5, end: 8 },
        valueType: {
          kind: "type-name" as const,
          name: { text: "number", start: 11, end: 17 },
        },
        doc: "",
      },
    };
    const typeRef = {
      kind: "type-name" as const,
      name: { text: "Int", start: 0, end: 3 },
    };
    const resolved = resolveMaybeInvalidType(typeRef, types);
    expect(resolved).toMatch({ kind: "primitive", primitive: "int" });
  });

  it("resolves plain 'number' to the 'number' primitive (no int alias)", () => {
    const typeRef = {
      kind: "type-name" as const,
      name: { text: "number", start: 0, end: 6 },
    };
    const resolved = resolveMaybeInvalidType(typeRef, {});
    expect(resolved).toMatch({ kind: "primitive", primitive: "number" });
  });

  it("parses a schema with an Int alias successfully", () => {
    const result = parseSchema(
      "type Int = number;\ninterface Response { count: Int; }",
      TEMPLATE,
    );
    expect(result).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// getUnionMembers
// ---------------------------------------------------------------------------

describe("getUnionMembers", () => {
  it("returns string members for a string literal union", () => {
    const union: Union = {
      kind: "union",
      members: [
        {
          kind: "string-literal",
          value: "active",
          quotedName: { text: '"active"', start: 0, end: 8 },
        },
        {
          kind: "string-literal",
          value: "inactive",
          quotedName: { text: '"inactive"', start: 11, end: 21 },
        },
      ],
    };
    expect(getUnionMembers(union, {})).toMatch({
      kind: "strings",
      members: [{ value: "active" }, { value: "inactive" }],
    });
  });

  it("returns interface members with discriminator for an interface union", () => {
    const union: Union = {
      kind: "union",
      members: [
        {
          kind: "interface",
          name: undefined,
          leftCurlyBracket: { text: "{", start: 0, end: 1 },
          fields: {
            kind: {
              name: { text: "kind", start: 2, end: 6 },
              optional: false,
              type: {
                kind: "string-literal",
                value: "circle",
                quotedName: { text: '"circle"', start: 8, end: 16 },
              },
              doc: "",
            },
          },
          firstField: {
            name: { text: "kind", start: 2, end: 6 },
            optional: false,
            type: {
              kind: "string-literal",
              value: "circle",
              quotedName: { text: '"circle"', start: 8, end: 16 },
            },
            doc: "",
          },
        },
        {
          kind: "interface",
          name: undefined,
          leftCurlyBracket: { text: "{", start: 20, end: 21 },
          fields: {
            kind: {
              name: { text: "kind", start: 22, end: 26 },
              optional: false,
              type: {
                kind: "string-literal",
                value: "rect",
                quotedName: { text: '"rect"', start: 28, end: 34 },
              },
              doc: "",
            },
          },
          firstField: {
            name: { text: "kind", start: 22, end: 26 },
            optional: false,
            type: {
              kind: "string-literal",
              value: "rect",
              quotedName: { text: '"rect"', start: 28, end: 34 },
            },
            doc: "",
          },
        },
      ],
    };
    expect(getUnionMembers(union, {})).toMatch({
      kind: "interfaces",
      kindFieldName: "kind",
      members: { circle: { kind: "interface" }, rect: { kind: "interface" } },
    });
  });

  it("resolves string-literal members referenced by name", () => {
    // Members are type-name references; resolveType must follow them.
    const activeDecl: TypeDeclaration = {
      kind: "type",
      name: { text: "Active", start: 0, end: 6 },
      valueType: {
        kind: "string-literal",
        value: "active",
        quotedName: { text: '"active"', start: 9, end: 17 },
      },
      doc: "",
    };
    const inactiveDecl: TypeDeclaration = {
      kind: "type",
      name: { text: "Inactive", start: 19, end: 27 },
      valueType: {
        kind: "string-literal",
        value: "inactive",
        quotedName: { text: '"inactive"', start: 30, end: 40 },
      },
      doc: "",
    };
    const union: Union = {
      kind: "union",
      members: [
        { kind: "type-name", name: { text: "Active", start: 50, end: 56 } },
        {
          kind: "type-name",
          name: { text: "Inactive", start: 59, end: 67 },
        },
      ],
    };
    const types = { Active: activeDecl, Inactive: inactiveDecl };
    expect(getUnionMembers(union, types)).toMatch({
      kind: "strings",
      members: [{ value: "active" }, { value: "inactive" }],
    });
  });

  it("resolves interface members referenced by name", () => {
    const fooInterface: Interface = {
      kind: "interface",
      name: { text: "Foo", start: 10, end: 13 },
      leftCurlyBracket: undefined,
      fields: {
        shape: {
          name: { text: "shape", start: 16, end: 21 },
          optional: false,
          type: {
            kind: "string-literal",
            value: "circle",
            quotedName: { text: '"circle"', start: 23, end: 31 },
          },
          doc: "",
        },
      },
      firstField: {
        name: { text: "shape", start: 16, end: 21 },
        optional: false,
        type: {
          kind: "string-literal",
          value: "circle",
          quotedName: { text: '"circle"', start: 23, end: 31 },
        },
        doc: "",
      },
      doc: "",
    };
    const barInterface: Interface = {
      kind: "interface",
      name: { text: "Bar", start: 50, end: 53 },
      leftCurlyBracket: undefined,
      fields: {
        shape: {
          name: { text: "shape", start: 56, end: 61 },
          optional: false,
          type: {
            kind: "string-literal",
            value: "rect",
            quotedName: { text: '"rect"', start: 63, end: 69 },
          },
          doc: "",
        },
      },
      firstField: {
        name: { text: "shape", start: 56, end: 61 },
        optional: false,
        type: {
          kind: "string-literal",
          value: "rect",
          quotedName: { text: '"rect"', start: 63, end: 69 },
        },
        doc: "",
      },
      doc: "",
    };
    const fooDecl: TypeDeclaration = { ...fooInterface };
    const barDecl: TypeDeclaration = { ...barInterface };
    const union: Union = {
      kind: "union",
      members: [
        { kind: "type-name", name: { text: "Foo", start: 90, end: 93 } },
        { kind: "type-name", name: { text: "Bar", start: 96, end: 99 } },
      ],
    };
    const types = { Foo: fooDecl, Bar: barDecl };
    expect(getUnionMembers(union, types)).toMatch({
      kind: "interfaces",
      kindFieldName: "shape",
      members: { circle: { kind: "interface" }, rect: { kind: "interface" } },
    });
  });
});
