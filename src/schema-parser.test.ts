import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseSchema } from "./schema-parser.js";

describe("parseSchema", () => {
  it("parses valid schema declarations", () => {
    const input = [
      "interface Response {",
      "  ok: string;",
      "}",
      "type Status = 'ok' | 'error';",
    ].join("\n");

    const result = parseSchema(input);

    expect(result).toMatch({
      kind: "success",
      schemaSource: input,
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

    expect(result.kind).toBe("error");
    if (result.kind !== "error") {
      throw new Error("Expected parseSchema to return errors");
    }

    expect(result.errors.length >= 2).toBe(true);
    expect(result.errors).toMatch([
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
    ]);
  });
});
