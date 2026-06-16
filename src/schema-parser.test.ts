import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseSchema } from "./schema-parser.js";

describe("parseSchema", () => {
  it("parses valid schema declarations", () => {
    const input = [
      "interface Response {",
      "  status: Status;",
      "}",
      "type Status = 'ok' | 'error';",
    ].join("\n");

    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          kind: "interface",
          name: {
            text: "Response",
          },
        },
        Status: {
          kind: "type",
          name: {
            text: "Status",
          },
        },
      },
    });
  });

  it("returns multiple parse errors", () => {
    const input = [
      "interface { a: string; }",
      "type Foo string;",
      "interface Bar { badField }",
      "type Nope = ;",
    ].join("\n");

    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected interface name",
        },
        {
          message: "Expected '=' after type name",
        },
        {
          message: "Invalid interface field declaration",
        },
        {
          message: "Expected type value",
        },
      ],
    });

    if (result.kind !== "error") {
      throw new Error("Expected parseSchema to return errors");
    }
    expect(result.errors.length >= 2).toBe(true);
  });

  it("parses interface fields with optional marker and firstField", () => {
    const input = [
      "interface Response {",
      "  id: string;",
      '  note?: "hello";',
      "}",
    ].join("\n");

    const result = parseSchema(input);
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          kind: "interface",
          name: { text: "Response" },
          firstField: {
            name: { text: "id" },
          },
          fields: {
            id: {
              optional: false,
              type: {
                kind: "type-name",
                name: { text: "string" },
              },
            },
            note: {
              optional: true,
              type: {
                kind: "string-literal",
                value: "hello",
              },
            },
          },
        },
      },
    });
  });

  it("parses nested array type suffixes", () => {
    const input = "type Response = string[][];";
    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          kind: "type",
          valueType: {
            kind: "array",
            elementType: {
              kind: "array",
              elementType: {
                kind: "type-name",
                name: { text: "string" },
              },
            },
          },
        },
      },
    });
  });

  it("parses union with leading pipe, literals, and inline interfaces", () => {
    const input =
      "type Response = | 'ok' | { kind: 'error'; message: string };";
    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          kind: "type",
          valueType: {
            kind: "union",
            members: [
              {
                kind: "string-literal",
                value: "ok",
              },
              {
                kind: "inline-interface",
                firstField: {
                  name: { text: "kind" },
                },
                fields: {
                  kind: {
                    type: {
                      kind: "string-literal",
                      value: "error",
                    },
                  },
                  message: {
                    type: {
                      kind: "type-name",
                      name: { text: "string" },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    });
  });

  it("does not split union on pipe inside string literals", () => {
    const result = parseSchema("type Response = 'a|b';");

    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          kind: "type",
          valueType: {
            kind: "string-literal",
            value: "a|b",
          },
        },
      },
    });
  });

  it("decodes escaped string literal values", () => {
    const input = [
      "interface Response {",
      "  a: A;",
      "  b: B;",
      "}",
      String.raw`type A = "line\nnext";`,
      String.raw`type B = 'it\'s';`,
    ].join("\n");
    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "success",
      types: {
        A: {
          kind: "type",
          valueType: {
            kind: "string-literal",
            value: "line\nnext",
          },
        },
        B: {
          kind: "type",
          valueType: {
            kind: "string-literal",
            value: "it's",
          },
        },
      },
    });
  });

  it("falls back for invalid JSON-style escapes in double-quoted literals", () => {
    const input = [
      "interface Response { a: A; }",
      String.raw`type A = "\q";`,
    ].join("\n");
    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "success",
      types: {
        A: {
          kind: "type",
          valueType: {
            kind: "string-literal",
            value: "\\q",
          },
        },
      },
    });
  });

  it("parses top-level declarations while ignoring keywords inside strings and comments", () => {
    const input = [
      String.raw`"interface HiddenA { value: string; }";`,
      "// type HiddenB = 'x';",
      "/* interface HiddenC { value: string; } */",
      "type RealType = 'ok';",
      "interface Response { value: RealType; }",
    ].join("\n");

    const result = parseSchema(input);
    expect(result).toMatch({
      kind: "success",
      types: {
        RealType: {
          kind: "type",
          name: { text: "RealType" },
        },
        Response: {
          kind: "interface",
          name: { text: "Response" },
        },
      },
    });
  });

  it("does not terminate type declarations on semicolons inside nested structures", () => {
    const input = [
      "type Response = A;",
      "type A = {",
      '  text: "a;b";',
      "  nested: { note: string; };",
      "};",
    ].join("\n");

    const result = parseSchema(input);
    expect(result).toMatch({
      kind: "success",
      types: {
        Response: { kind: "type" },
        A: { kind: "type" },
      },
    });
  });

  it("parses array of inline interfaces", () => {
    const input =
      "type Response = { item: string; details: { x: string; }; }[];";
    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "success",
      types: {
        Response: {
          kind: "type",
          valueType: {
            kind: "array",
            elementType: {
              kind: "inline-interface",
              fields: {
                item: {
                  type: {
                    kind: "type-name",
                    name: { text: "string" },
                  },
                },
                details: {
                  type: {
                    kind: "inline-interface",
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it("reports missing Response type when schema is empty", () => {
    const result = parseSchema(" \n\t\n");
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          start: 0,
          end: 0,
          message: "Missing required type 'Response'",
        },
      ],
    });
  });

  it("reports one error per type unreachable from Response", () => {
    const input = [
      "interface Response { id: string; }",
      "interface Used { value: string; }",
      "interface UnusedOne { value: string; }",
      "type UnusedTwo = 'x';",
    ].join("\n");

    const result = parseSchema(input);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Type 'Used' is not reachable from 'Response'",
        },
        {
          message: "Type 'UnusedOne' is not reachable from 'Response'",
        },
        {
          message: "Type 'UnusedTwo' is not reachable from 'Response'",
        },
      ],
    });
  });

  it("reports missing '{' after interface name", () => {
    const result = parseSchema("interface Response\ntype A = 'ok';");
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected '{' after interface name",
        },
      ],
    });
  });

  it("reports unclosed interface body", () => {
    const result = parseSchema("interface Response { value: string;");
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unclosed interface body",
        },
      ],
    });
  });

  it("reports invalid type value for unsupported union members", () => {
    const result = parseSchema("type Response = 'ok' | SomeType;");
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Invalid type value",
        },
      ],
    });
  });

  it("reports invalid interface field declaration and invalid type value in one pass", () => {
    const input = [
      "interface Response {",
      "  ok: string;",
      "  badField",
      "}",
      "type Status = 'ok' | SomeType;",
    ].join("\n");

    const result = parseSchema(input);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Invalid interface field declaration",
        },
        {
          message: "Invalid type value",
        },
      ],
    });
  });

  it("reports missing type name and missing type value", () => {
    const input = ["type = 'x';", "type Nope = ;"].join("\n");
    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected type name",
        },
        {
          message: "Expected type value",
        },
      ],
    });
  });

  it("tracks offsets for missing interface name", () => {
    const input = "interface { a: string; }";
    const expectedStart = input.indexOf("{");
    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected interface name",
          start: expectedStart,
          end: expectedStart + 1,
        },
      ],
    });
  });

  it("tracks offsets for missing '=' after type name", () => {
    const input = "type Foo string;";
    const expectedStart = input.indexOf("string");
    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected '=' after type name",
          start: expectedStart,
          end: expectedStart + 1,
        },
      ],
    });
  });

  it("tracks offsets for invalid interface field declaration", () => {
    const input = [
      "interface Response {",
      "  ok: string;",
      "  badField",
      "}",
    ].join("\n");
    const expectedStart = input.indexOf("badField");
    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Invalid interface field declaration",
          start: expectedStart,
          end: expectedStart + "badField".length,
        },
      ],
    });
  });

  it("tracks offsets for invalid type value", () => {
    const input = "type Response = 'ok' | SomeType;";
    const valueText = "'ok' | SomeType";
    const expectedStart = input.indexOf(valueText);
    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Invalid type value",
          start: expectedStart,
          end: expectedStart + valueText.length,
        },
      ],
    });
  });

  it("tracks offsets for unclosed interface body", () => {
    const input = "interface Response { value: string;";
    const openBrace = input.indexOf("{");
    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unclosed interface body",
          start: openBrace,
          end: input.length,
        },
      ],
    });
  });
});
