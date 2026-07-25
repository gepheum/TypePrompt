import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { MappedText } from "../util/common-types.js";
import { parseSchema } from "./schema-parser.js";

function textNode(source: string): MappedText {
  return {
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

// ---------------------------------------------------------------------------
// Basic success cases
// ---------------------------------------------------------------------------

describe("parseSchema – interfaces", () => {
  it("parses a simple interface declaration", () => {
    const result = parseSchema(textNode("type Response = { name: string; };"));
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          kind: "type",
          name: { text: "Response" },
          valueType: {
            kind: "interface",
            fields: {
              name: {
                name: { text: "name" },
                optional: false,
                type: { kind: "type-name", name: { text: "string" } },
                doc: "",
              },
            },
          },
          doc: "",
        },
      },
    });
  });

  it("parses an interface with multiple fields", () => {
    const result = parseSchema(
      textNode(
        "type Response = { name: string; age: number; active: boolean; };",
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          valueType: {
            fields: {
              name: { type: { kind: "type-name", name: { text: "string" } } },
              age: { type: { kind: "type-name", name: { text: "number" } } },
              active: {
                type: { kind: "type-name", name: { text: "boolean" } },
              },
            },
          },
        },
      },
    });
  });

  it("parses optional fields", () => {
    const result = parseSchema(
      textNode("type Response = { required: string; optional?: number; };"),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          valueType: {
            fields: {
              required: { optional: false },
              optional: { optional: true },
            },
          },
        },
      },
    });
  });

  it("parses an interface with no fields", () => {
    const result = parseSchema(textNode("type Response = { };"));
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          kind: "type",
          valueType: { kind: "interface", fields: {} },
        },
      },
    });
  });

  it("parses a nested inline interface field", () => {
    const result = parseSchema(
      textNode(
        "type Response = { address: { street: string; city: string }; };",
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          valueType: {
            fields: {
              address: {
                type: {
                  kind: "interface",
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
      },
    });
  });

  it("accepts comma as field separator", () => {
    const result = parseSchema(
      textNode("type Response = { name: string, age: number };"),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts newline as implicit field separator", () => {
    const result = parseSchema(
      textNode(
        ["type Response = {", "  name: string", "  age: number", "};"].join(
          "\n",
        ),
      ),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("records correct source span for type name", () => {
    const source = "type Response = { name: string; };";
    const result = parseSchema(textNode(source));
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          name: { text: "Response", start: 5, end: 13 },
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
    const result = parseSchema(textNode("type Response = string;"));
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
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
    const result = parseSchema(textNode("type Response = string[];"));
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
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
    const result = parseSchema(textNode("type Response = string[][];"));
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
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
      textNode('type Response = "active" | "inactive";'),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
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
      textNode(
        'type Response = { kind: "circle"; radius: number } | { kind: "rect"; width: number; height: number };',
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
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
      textNode(
        ["type Response =", '  | "active"', '  | "inactive";'].join("\n"),
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
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
      textNode('type Response = ("active" | "inactive");'),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
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
      textNode(["type Response =", "  string"].join("\n")),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("parses a type alias to an inline interface", () => {
    const result = parseSchema(
      textNode("type Response = { name: string; age: number };"),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
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
      textNode(
        [
          "type Response = { value: Status; };",
          'type Status = "active" | "inactive";',
        ].join("\n"),
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: { kind: "type" },
        Status: { kind: "type" },
      },
    });
  });

  it("resolves a cross-type reference", () => {
    const result = parseSchema(
      textNode(
        [
          "type Response = { value: Status; };",
          'type Status = "active" | "inactive";',
        ].join("\n"),
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          valueType: {
            fields: {
              value: {
                type: { kind: "type-name", name: { text: "Status" } },
              },
            },
          },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Shared type names
// ---------------------------------------------------------------------------

describe("parseSchema – shared type names", () => {
  it("parses a shared type name as a type alias", () => {
    const result = parseSchema(textNode("type Response = shared.Profile;"));
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          valueType: { kind: "shared-type-name", name: { text: "Profile" } },
        },
      },
    });
  });

  it("parses a shared type name as a field type", () => {
    const result = parseSchema(
      textNode("type Response = { user: shared.Profile; };"),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          valueType: {
            fields: {
              user: {
                type: { kind: "shared-type-name", name: { text: "Profile" } },
              },
            },
          },
        },
      },
    });
  });

  it("parses an array of a shared type", () => {
    const result = parseSchema(textNode("type Response = shared.Profile[];"));
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          valueType: {
            kind: "array",
            elementType: {
              kind: "shared-type-name",
              name: { text: "Profile" },
            },
          },
        },
      },
    });
  });

  it("parses a union containing a shared type name", () => {
    const result = parseSchema(
      textNode('type Response = shared.Profile | "guest";'),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          valueType: {
            kind: "union",
            members: [
              { kind: "shared-type-name", name: { text: "Profile" } },
              { kind: "string-literal", value: "guest" },
            ],
          },
        },
      },
    });
  });

  it("records correct spans for the shared keyword and the name", () => {
    // "type Response = shared.Profile;"
    //  0123456789012345678901234567890
    //                  ^     ^
    //                  16    23
    const result = parseSchema(textNode("type Response = shared.Profile;"));
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          valueType: {
            shared: { start: 16, end: 22 },
            name: { text: "Profile", start: 23, end: 30 },
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
  it("accepts a single-line comment", () => {
    const result = parseSchema(
      textNode("// This is a comment\ntype Response = { name: string; };"),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts a non-JSDoc block comment", () => {
    const result = parseSchema(
      textNode("/* comment */\ntype Response = { name: string; };"),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("extracts JSDoc from a single-line /** ... */ comment on a type", () => {
    const result = parseSchema(
      textNode(
        ["/** A named user. */", "type Response = { name: string; };"].join(
          "\n",
        ),
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: { Response: { doc: "A named user." } },
    });
  });

  it("extracts JSDoc from a multi-line comment on a type", () => {
    const result = parseSchema(
      textNode(
        [
          "/**",
          " * A named user.",
          " */",
          "type Response = { name: string; };",
        ].join("\n"),
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: { Response: { doc: "A named user." } },
    });
  });

  it("extracts JSDoc from a comment on a field", () => {
    const result = parseSchema(
      textNode(
        [
          "type Response = {",
          "  /** The user's name. */",
          "  name: string;",
          "};",
        ].join("\n"),
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: {
        Response: {
          valueType: { fields: { name: { doc: "The user's name." } } },
        },
      },
    });
  });

  it("accepts a non-JSDoc block comment before a type", () => {
    const result = parseSchema(
      textNode(
        ["/* ordinary comment */", "type Response = { name: string; };"].join(
          "\n",
        ),
      ),
    );
    expect(result).toMatch({ kind: "success" });
  });

  it("accepts a single-line comment inside an interface body", () => {
    const result = parseSchema(
      textNode(
        [
          //
          "type Response = {", //
          "  // a comment", //
          "  name: string;",
          "};", //
        ].join("\n"),
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: { Response: { valueType: { fields: { name: {} } } } },
    });
  });

  it("accepts a non-JSDoc block comment inside an interface body", () => {
    const result = parseSchema(
      textNode(
        [
          "type Response = {",
          "  /* a comment */",
          "  name: string;",
          "};",
        ].join("\n"),
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: { Response: { valueType: { fields: { name: {} } } } },
    });
  });

  it("accepts single-line comments between two type declarations", () => {
    const result = parseSchema(
      textNode(
        [
          "type Response = { value: string; };",
          "// separator",
          "type Other = { id: number; };",
        ].join("\n"),
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: { Response: {}, Other: {} },
    });
  });

  it("accepts a non-JSDoc block comment between two type declarations", () => {
    const result = parseSchema(
      textNode(
        [
          "type Response = { value: string; };",
          "/* separator */",
          "type Other = { id: number; };",
        ].join("\n"),
      ),
    );
    expect(result).toMatch({
      kind: "success",
      typeDeclarations: { Response: {}, Other: {} },
    });
  });
});

// ---------------------------------------------------------------------------
// Tokenizer error cases
// ---------------------------------------------------------------------------

describe("parseSchema – tokenizer errors", () => {
  it("reports error for an identifier starting with a digit", () => {
    const result = parseSchema(textNode("type Response = { 1name: string; };"));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Invalid identifier" }],
    });
  });

  it("reports error for an identifier containing an underscore", () => {
    const result = parseSchema(
      textNode("type Response = { my_field: string; };"),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Must not contain underscores" }],
    });
  });

  it("reports error for an unterminated double-quoted string literal", () => {
    const result = parseSchema(textNode('type Response = "unterminated;'));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unterminated string literal" }],
    });
  });

  it("reports error for an unterminated single-quoted string literal", () => {
    const result = parseSchema(textNode("type Response = 'unterminated;"));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unterminated string literal" }],
    });
  });

  it("reports error for a string literal containing an escape sequence", () => {
    const result = parseSchema(textNode('type Response = "with\\\\escape";'));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Must not contain escape sequences" }],
    });
  });

  it("reports error for an unterminated multi-line comment", () => {
    const result = parseSchema(
      textNode("/* unterminated\ntype Response = { name: string; };"),
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
  it("reports error for type names that conflict by case", () => {
    const result = parseSchema(
      textNode(
        [
          "type Response = { value: string; };",
          "type response = { other: string; };",
        ].join("\n"),
      ),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /conflicts with/ }],
    });
  });
});
