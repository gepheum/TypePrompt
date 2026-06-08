import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseTemplateFile } from "./parser.js";

describe("parseTemplateFile", () => {
  it("parses a template header, expressions, schema, and example", () => {
    const parsed = parseTemplateFile(
      [
        "Foo/Bar:",
        "  Hello $name and ${ value : hide }.",
        "  $<schema>",
        "    interface Out { value: string; }",
        "  $</schema>",
        "  $<example>",
        '    {"value":"x$y"}',
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            name: { text: "Foo" },
            variantName: { text: "Bar" },
            parameters: ["name", "value"],
            pieces: [
              {
                kind: "text",
                text: "Hello ",
              },
              {
                kind: "expression",
                expression: "name",
                hide: false,
              },
              {
                kind: "text",
                text: " and ",
              },
              {
                kind: "expression",
                expression: "value",
                hide: true,
              },
              {
                kind: "text",
              },
              {
                kind: "schema",
                types: {
                  Out: {
                    kind: "interface",
                    name: { text: "Out" },
                  },
                },
              },
              {
                kind: "text",
                text: "\n",
              },
              {
                kind: "example",
                example: {
                  value: {
                    kind: "object",
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("requires end of line after ':'", () => {
    const parsed = parseTemplateFile(
      ["Foo:  ", "  $<schema>$</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        {
          message: "Expected end of line after ':'",
        },
        {
          message: "Template header line must not be indented",
        },
      ],
      value: {
        templates: [],
      },
    });
  });

  it("reports body indentation mismatch", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  first", " second", "  $<schema>$</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        {
          message: "Expected line to start with template indent '  '",
        },
      ],
      value: {
        templates: [
          {
            name: { text: "Foo" },
            parameters: [],
            pieces: [
              {
                kind: "text",
                text: "first\nsecond\n",
              },
              {
                kind: "schema",
                text: "",
              },
            ],
          },
        ],
      },
    });
  });

  it("allows templates with zero or multiple schema sections", () => {
    const none = parseTemplateFile(["Foo:", "  plain text"].join("\n"));

    const many = parseTemplateFile(
      ["Foo:", "  $<schema>$</schema>", "  $<schema>$</schema>"].join("\n"),
    );

    expect(none).toMatch({
      errors: [],
      value: {
        templates: [
          {
            name: { text: "Foo" },
            pieces: [
              {
                kind: "text",
                text: "plain text",
              },
            ],
          },
        ],
      },
    });

    expect(many).toMatch({
      errors: [],
      value: {
        templates: [
          {
            name: { text: "Foo" },
            pieces: [
              {
                kind: "schema",
              },
              {
                kind: "text",
                text: "\n",
              },
              {
                kind: "schema",
              },
            ],
          },
        ],
      },
    });
  });

  it("rejects schema self-closing tags", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  before", "  $<schema   />", "  after"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [{ message: "Invalid '$' sequence" }],
      value: {
        templates: [
          {
            name: { text: "Foo" },
            parameters: [],
            pieces: [{ kind: "text", text: "before\n$<schema   />\nafter" }],
          },
        ],
      },
    });
  });

  it("parses JSON example and reports JSON errors leniently", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        '    {"a": [1, true, null, ]}',
        "  $</example>",
        "",
        "Bar:",
        "  $<schema>$</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        {
          message: "Invalid JSON value",
        },
      ],
      value: {
        templates: [
          {
            name: { text: "Foo" },
            pieces: [
              { kind: "schema", text: "" },
              { kind: "text", text: "\n" },
              {
                kind: "text",
                text: "\n",
              },
            ],
          },
          {
            name: { text: "Bar" },
            pieces: [{ kind: "schema", text: "" }],
          },
        ],
      },
    });
  });

  it("keeps parsing after invalid placeholder", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  bad: $-x",
        "  $<schema>$</schema>",
        "",
        "Bar:",
        "  ok $name",
        "  $<schema>$</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        {
          message: "Invalid '$' sequence",
        },
      ],
      value: {
        templates: [
          {
            name: { text: "Foo" },
            parameters: [],
            pieces: [
              {
                kind: "text",
                text: "bad: $-x\n",
              },
              {
                kind: "schema",
                text: "",
              },
              {
                kind: "text",
                text: "\n",
              },
            ],
          },
          {
            name: { text: "Bar" },
            parameters: ["name"],
            pieces: [
              {
                kind: "text",
                text: "ok ",
              },
              {
                kind: "expression",
                expression: "name",
              },
              {
                kind: "text",
                text: "\n",
              },
              {
                kind: "schema",
                text: "",
              },
            ],
          },
        ],
      },
    });
  });

  it("returns empty result for empty file", () => {
    const parsed = parseTemplateFile("");

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [],
      },
    });
  });

  it("supports top-level # comments before and between templates", () => {
    const parsed = parseTemplateFile(
      [
        "# comment before first template",
        "",
        "Foo:",
        "  $<schema>$</schema>",
        "# comment between templates",
        "Bar:",
        "  $<schema>$</schema>",
        "# trailing comment",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [{ name: { text: "Foo" } }, { name: { text: "Bar" } }],
      },
    });
  });

  it("keeps indented # lines as template body text", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  # not a top-level comment", "  $<schema>$</schema>"].join(
        "\n",
      ),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "text", text: "# not a top-level comment\n" },
              { kind: "schema", text: "" },
            ],
          },
        ],
      },
    });
  });

  it("reports header without identifier", () => {
    const parsed = parseTemplateFile(
      [":", "Foo:", "  $<schema>$</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        {
          message: "Expected template identifier",
        },
      ],
      value: {
        templates: [
          {
            name: { text: "Foo" },
            pieces: [{ kind: "schema" }],
          },
        ],
      },
    });
  });

  it("reports missing variant identifier", () => {
    const parsed = parseTemplateFile(
      ["Foo/:", "Bar:", "  $<schema>$</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        {
          message: "Expected variant identifier after '/'",
        },
      ],
      value: {
        templates: [
          {
            name: { text: "Bar" },
          },
        ],
      },
    });
  });

  it("reports missing colon in header", () => {
    const parsed = parseTemplateFile(
      ["Foo/Bar", "Baz:", "  $<schema>$</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        {
          expected: ":",
        },
      ],
      value: {
        templates: [
          {
            name: { text: "Baz" },
            pieces: [{ kind: "schema" }],
          },
        ],
      },
    });
  });

  it("allows empty lines in template body without indentation", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "", "  line", "", "  $<schema>$</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            name: { text: "Foo" },
            pieces: [
              { kind: "text", text: "\nline\n\n" },
              { kind: "schema", text: "" },
            ],
          },
        ],
      },
    });
  });

  it("preserves unindented empty lines as text line breaks within body", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  first", "", "  second", "", "", "  $<schema>$</schema>"].join(
        "\n",
      ),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "text", text: "first\n\nsecond\n\n\n" },
              { kind: "schema", text: "" },
            ],
          },
        ],
      },
    });
  });

  it("supports $$ as escaped dollar", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  price is $$5 and $$10", "  $<schema>$</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            parameters: [],
            pieces: [
              { kind: "text", text: "price is $5 and $10\n" },
              { kind: "schema", text: "" },
            ],
          },
        ],
      },
    });
  });

  it("reports invalid braced placeholder modifiers", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  ${name:oops}", "  $<schema>$</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        {
          message: "Invalid expression placeholder",
        },
      ],
      value: {
        templates: [
          {
            parameters: [],
            pieces: [
              { kind: "text", text: "${name:oops}\n" },
              { kind: "schema", text: "" },
            ],
          },
        ],
      },
    });
  });

  it("reports missing closing brace in braced placeholder", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  hello ${name", "  $<schema>$</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        {
          expected: "}",
        },
      ],
      value: {
        templates: [
          {
            parameters: [],
            pieces: [
              { kind: "text", text: "hello ${name\n" },
              { kind: "schema", text: "" },
            ],
          },
        ],
      },
    });
  });

  it("supports spaced schema tags", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<  schema   >",
        "    type Out = string;",
        "  $</schema   >",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                text: "\n  type Out = string;\n",
                types: {
                  Out: { kind: "type", name: { text: "Out" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("reports missing closing schema tag", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  before", "  $<schema>", "    interface Out {}"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        {
          message: "Missing '$</schema>'",
        },
      ],
      value: {
        templates: [
          {
            pieces: [
              { kind: "text", text: "before\n" },
              {
                kind: "schema",
                types: {
                  Out: { kind: "interface", name: { text: "Out" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("does not close example section on $</example> inside JSON string", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        '    {"text": "value with $</example> and #</example> inside"}',
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "schema", text: "" },
              { kind: "text", text: "\n" },
              {
                kind: "example",
                example: {
                  value: {
                    kind: "object",
                    entries: [
                      {
                        key: { value: "text" },
                        value: {
                          kind: "string",
                          value:
                            "value with $</example> and #</example> inside",
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("does not close schema section on $</schema> inside type string literal", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>",
        '    type Marker = "$</schema> and #</schema>";',
        "    interface Out { value: Marker; }",
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                types: {
                  Marker: { kind: "type", name: { text: "Marker" } },
                  Out: { kind: "interface", name: { text: "Out" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("does not close schema section on $</schema> inside TypeScript comments", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>",
        "    // line comment with $</schema> and #</schema>",
        "    /* block comment with $</schema> and #</schema> */",
        "    interface Out { value: string; }",
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                types: {
                  Out: { kind: "interface", name: { text: "Out" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("parses JSON example with object and array", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        '    {"a": [1, 2, 3], "b": false}',
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "schema", text: "" },
              { kind: "text", text: "\n" },
              {
                kind: "example",
                example: {
                  value: {
                    kind: "object",
                    entries: [
                      {
                        key: { value: "a" },
                        value: {
                          kind: "array",
                          values: [
                            { kind: "number", value: 1 },
                            { kind: "number", value: 2 },
                            { kind: "number", value: 3 },
                          ],
                        },
                      },
                      {
                        key: { value: "b" },
                        value: { kind: "boolean", value: false },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("continues parsing templates after bad JSON example", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        "    [1, 2,",
        "  $</example>",
        "Bar:",
        "  text $param",
        "  $<schema>$</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        {
          expected: "]",
        },
      ],
      value: {
        templates: [
          {
            name: { text: "Foo" },
          },
          {
            name: { text: "Bar" },
            parameters: ["param"],
          },
        ],
      },
    });
  });

  // --- expression hide ---

  it("sets hide:true on ${ name : hide } expression", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  ${ x : hide }", "  $<schema>$</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            parameters: ["x"],
            pieces: [
              { kind: "expression", expression: "x", hide: true },
              { kind: "text", text: "\n" },
              { kind: "schema", text: "" },
            ],
          },
        ],
      },
    });
  });

  it("sets hide:false on simple $name expression", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  $x and ${y}", "  $<schema>$</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            parameters: ["x", "y"],
            pieces: [
              { kind: "expression", expression: "x", hide: false },
              { kind: "text", text: " and " },
              { kind: "expression", expression: "y", hide: false },
              { kind: "text", text: "\n" },
              { kind: "schema", text: "" },
            ],
          },
        ],
      },
    });
  });

  // --- schema tag ---

  it("accepts $<schema> section tags", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>",
        "    interface Out { value: string; }",
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                text: "\n  interface Out { value: string; }\n",
                types: {
                  Out: { kind: "interface", name: { text: "Out" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("parses interface fields with optional marker and type", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>",
        "    interface User {",
        "      id: string;",
        "      nickname?: string[];",
        "      profile: { age: number; active: boolean };",
        "    }",
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                types: {
                  User: {
                    kind: "interface",
                    name: { text: "User" },
                    fields: {
                      id: {
                        name: { text: "id" },
                        optional: false,
                        type: { kind: "type-name", name: { text: "string" } },
                      },
                      nickname: {
                        name: { text: "nickname" },
                        optional: true,
                        type: {
                          kind: "array",
                          elementType: {
                            kind: "type-name",
                            name: { text: "string" },
                          },
                        },
                      },
                      profile: {
                        name: { text: "profile" },
                        optional: false,
                        type: {
                          kind: "inline-interface",
                          fields: {
                            age: {
                              name: { text: "age" },
                              optional: false,
                              type: {
                                kind: "type-name",
                                name: { text: "number" },
                              },
                            },
                            active: {
                              name: { text: "active" },
                              optional: false,
                              type: {
                                kind: "type-name",
                                name: { text: "boolean" },
                              },
                            },
                          },
                          firstField: {
                            name: { text: "age" },
                            optional: false,
                            type: {
                              kind: "type-name",
                              name: { text: "number" },
                            },
                          },
                        },
                      },
                    },
                    firstField: {
                      name: { text: "id" },
                      optional: false,
                      type: { kind: "type-name", name: { text: "string" } },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("parses type declaration value type text", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>",
        '    type Payload = "ok" | { ok: boolean };',
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                types: {
                  Payload: {
                    kind: "type",
                    name: { text: "Payload" },
                    valueType: {
                      kind: "union",
                      members: [
                        { kind: "string-literal", value: "ok" },
                        {
                          kind: "inline-interface",
                          fields: {
                            ok: {
                              name: { text: "ok" },
                              optional: false,
                              type: {
                                kind: "type-name",
                                name: { text: "boolean" },
                              },
                            },
                          },
                          firstField: {
                            name: { text: "ok" },
                            optional: false,
                            type: {
                              kind: "type-name",
                              name: { text: "boolean" },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("accepts inline empty schema section", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  before $<schema>$</schema> after"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "text", text: "before " },
              { kind: "schema", text: "" },
              { kind: "text", text: " after" },
            ],
          },
        ],
      },
    });
  });

  it("does not parse $<response> tags", () => {
    const parsed = parseTemplateFile(["Foo:", "  $<response/>"].join("\n"));

    expect(parsed).toMatch({
      errors: [{ message: "Invalid '$' sequence" }],
      value: {
        templates: [
          {
            pieces: [{ kind: "text", text: "$<response/>" }],
          },
        ],
      },
    });
  });

  // --- schema hide attribute ---

  it("$<schema hide> empties text but still parses schema tree", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema hide>",
        "    interface Out { value: string; }",
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                text: "",
                types: {
                  Out: { kind: "interface", name: { text: "Out" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("$<schema hide> also empties text but still parses schema tree", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema hide>",
        "    type Result = string;",
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                text: "",
                types: {
                  Result: { kind: "type", name: { text: "Result" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  // --- inline structs in schema ---

  it("schema with inline struct field type", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>",
        "    type Foo = {",
        "      point: {",
        "        x: number;",
        "        y: number;",
        "      };",
        "    };",
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                types: {
                  Foo: { kind: "type", name: { text: "Foo" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  // --- union types in schema ---

  it("schema with union type containing string literals", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>",
        '    type Status = "active" | "inactive";',
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                types: {
                  Status: { kind: "type", name: { text: "Status" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("schema with union type containing struct members", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>",
        '    type Shape = { kind: "circle"; radius: number } | { kind: "rect"; width: number; height: number };',
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                types: {
                  Shape: { kind: "type", name: { text: "Shape" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  // --- leading pipe union syntax ---

  it("schema with leading pipe union syntax", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>",
        "    type Shape =",
        '      | { kind: "circle"; radius: number }',
        '      | { kind: "rect"; width: number; height: number };',
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                types: {
                  Shape: { kind: "type", name: { text: "Shape" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  // --- multiline schema with correct dedenting ---

  it("multiline schema section is correctly dedented", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>",
        "    interface User {",
        "      name: string;",
        "      age: number;",
        "    }",
        '    type Role = "admin" | "member";',
        "  $</schema>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                text: '\n  interface User {\n    name: string;\n    age: number;\n  }\n  type Role = "admin" | "member";\n',
                types: {
                  User: { kind: "interface", name: { text: "User" } },
                  Role: { kind: "type", name: { text: "Role" } },
                },
              },
            ],
          },
        ],
      },
    });
  });

  // --- multiline example with correct dedenting ---

  it("multiline example section is correctly dedented", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        "    {",
        '      "name": "Alice",',
        '      "age": 30',
        "    }",
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "schema", text: "" },
              { kind: "text", text: "\n" },
              {
                kind: "example",
                text: '\n  {\n    "name": "Alice",\n    "age": 30\n  }\n',
                example: {
                  value: {
                    kind: "object",
                    entries: [
                      {
                        key: { value: "name" },
                        value: { kind: "string", value: "Alice" },
                      },
                      {
                        key: { value: "age" },
                        value: { kind: "number", value: 30 },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it('parses $<example type="..."> attribute', () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        '  $<example type="Foo">',
        '    {"value": "ok"}',
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "schema", text: "" },
              { kind: "text", text: "\n" },
              {
                kind: "example",
                example: {
                  type: "Foo",
                  value: {
                    kind: "object",
                    entries: [
                      {
                        key: { value: "value" },
                        value: { kind: "string", value: "ok" },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("parses $<example type='...'> attribute with spaces", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example type = 'Foo.Bar' >{\"value\": 1}$</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "schema", text: "" },
              { kind: "text", text: "\n" },
              {
                kind: "example",
                example: {
                  type: "Foo.Bar",
                  value: {
                    kind: "object",
                    entries: [
                      {
                        key: { value: "value" },
                        value: { kind: "number", value: 1 },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("treats malformed example type attribute as invalid tag syntax", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example type=Foo>",
        "    {}",
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [
        { message: "Invalid '$' sequence" },
        { message: "Invalid '$' sequence" },
      ],
      value: {
        templates: [
          {
            pieces: [
              { kind: "schema", text: "" },
              {
                kind: "text",
                text: "\n$<example type=Foo>\n  {}\n$</example>",
              },
            ],
          },
        ],
      },
    });
  });

  it("finds closing schema tag after unterminated template literal", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  $<schema>", "    type A = `x", "  $</schema>"].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              {
                kind: "schema",
                text: "\n  type A = `x\n",
                types: {
                  // unterminated template literal in schema content should yield no declarations
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("parses a template file that ends with a trailing newline", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  $<schema>$</schema>", ""].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            name: { text: "Foo" },
            pieces: [
              { kind: "schema", text: "" },
              { kind: "text", text: "\n\n" },
            ],
          },
        ],
      },
    });
  });

  // --- JSON error coverage ---

  it("reports empty JSON example section", () => {
    const parsed = parseTemplateFile(
      ["Foo:", "  $<schema>$</schema>", "  $<example>", "  $</example>"].join(
        "\n",
      ),
    );

    expect(parsed).toMatch({
      errors: [{ message: "Expected JSON value" }],
      value: {
        templates: [
          {
            pieces: [{ kind: "schema" }, { kind: "text" }],
          },
        ],
      },
    });
  });

  it("reports unexpected trailing content after JSON value", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        "    42 extra",
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [{ message: "Unexpected trailing content after JSON value" }],
      value: {
        templates: [
          {
            pieces: [{ kind: "schema" }, { kind: "text" }],
          },
        ],
      },
    });
  });

  it("reports missing colon in JSON object", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        '    {"key" 1}',
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [{ expected: ":" }],
      value: { templates: [{}] },
    });
  });

  it("reports missing comma or closing brace in JSON object", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        '    {"a": 1 "b": 2}',
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [{ expected: "',' or '}'" }],
      value: { templates: [{}] },
    });
  });

  it("reports EOF inside JSON object without closing brace", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        '    {"a": 1',
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [{ expected: "',' or '}'" }],
      value: { templates: [{}] },
    });
  });

  it("reports missing comma or closing bracket in JSON array", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        "    [1 2]",
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [{ expected: "',' or ']'" }],
      value: { templates: [{}] },
    });
  });

  it("reports EOF inside JSON array without closing bracket", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        "    [1, 2",
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [{ expected: "',' or ']'" }],
      value: { templates: [{}] },
    });
  });

  it("reports non-string key in JSON object", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        "    {1: 2}",
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [{ expected: "JSON string" }],
      value: { templates: [{}] },
    });
  });

  it("reports unterminated JSON string", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        '    "hello',
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [{ expected: "closing quote for JSON string" }],
      value: { templates: [{}] },
    });
  });

  it("reports invalid boolean keyword", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        "    falsy",
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [{ expected: "'true' or 'false'" }],
      value: { templates: [{}] },
    });
  });

  it("reports invalid null keyword", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        "    nul",
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [{ expected: "'null'" }],
      value: { templates: [{}] },
    });
  });

  it("parses ellipsis as a standalone JSON value", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        "    ...",
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "schema" },
              { kind: "text" },
              { kind: "example", example: { value: { kind: "ellipsis" } } },
            ],
          },
        ],
      },
    });
  });

  it("parses ellipsis wherever a JSON value is expected", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        '    [1, ..., {"a": ...}]',
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "schema" },
              { kind: "text" },
              {
                kind: "example",
                example: {
                  value: {
                    kind: "array",
                    values: [
                      { kind: "number", value: 1 },
                      { kind: "ellipsis" },
                      {
                        kind: "object",
                        entries: [
                          { key: { value: "a" }, value: { kind: "ellipsis" } },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("parses object with trailing ellipsis before closing brace", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        '    {"foo": true, ...}',
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "schema" },
              { kind: "text" },
              {
                kind: "example",
                example: {
                  value: {
                    kind: "object",
                    entries: [
                      {
                        key: { value: "foo" },
                        value: { kind: "boolean", value: true },
                      },
                    ],
                    ellipsis: { kind: "ellipsis" },
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("parses object that only contains ellipsis", () => {
    const parsed = parseTemplateFile(
      [
        "Foo:",
        "  $<schema>$</schema>",
        "  $<example>",
        "    { ... }",
        "  $</example>",
      ].join("\n"),
    );

    expect(parsed).toMatch({
      errors: [],
      value: {
        templates: [
          {
            pieces: [
              { kind: "schema" },
              { kind: "text" },
              {
                kind: "example",
                example: {
                  value: {
                    kind: "object",
                    entries: [],
                    ellipsis: { kind: "ellipsis" },
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("parses JSON string, number, boolean, and null as standalone values", () => {
    const cases: Array<[string, object]> = [
      ['"hello"', { kind: "string", value: "hello" }],
      ["42.5", { kind: "number", value: 42.5 }],
      ["true", { kind: "boolean", value: true }],
      ["null", { kind: "null" }],
    ];

    for (const [input, expectedValue] of cases) {
      const parsed = parseTemplateFile(
        [
          "Foo:",
          "  $<schema>$</schema>",
          `  $<example>${input}$</example>`,
        ].join("\n"),
      );

      expect(parsed.errors).toMatch([]);
      const examplePiece = parsed.value.templates[0]!.pieces.find(
        (p) => p.kind === "example",
      );
      expect(examplePiece).toMatch({
        kind: "example",
        example: { value: expectedValue },
      });
    }
  });
});
