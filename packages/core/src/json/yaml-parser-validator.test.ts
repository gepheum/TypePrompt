import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { EMPTY_SCHEMA } from "../schema/empty-schema.js";
import { parseSchema } from "../schema/schema-parser.js";
import type { Schema, SchemaType } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import type { MappedText } from "../util/shared-types.js";
import { unwrapJsonValue } from "./unwrapper.js";
import { parseAndValidateYaml } from "./yaml-parser-validator.js";

function parseSchemaOrThrow(source: string, path = "schema.ts"): Schema {
  const textNode: MappedText = {
    path,
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const schemaParseResult = parseSchema(textNode, "namespace");
  if (schemaParseResult.kind !== "success") {
    throw new Error(
      `Schema parse failed: ${JSON.stringify(schemaParseResult)}`,
    );
  }
  const schema = validateSchema(schemaParseResult, null);
  if (schema.kind !== "success") {
    throw new Error(`Schema validation failed: ${JSON.stringify(schema)}`);
  }
  return schema;
}

describe("parseAndValidateYaml", () => {
  it("parses and validates YAML matching a schema declaration successfully", () => {
    const schema = parseSchemaOrThrow(
      "type User = { name: string; age: number; };",
    );
    const schemaType: SchemaType = {
      type: schema.typeDeclarations["User"]!.valueType,
      schema,
    };
    const yaml = "name: Alice\nage: 30\n";
    const result = parseAndValidateYaml(yaml, "user.yaml", schemaType);

    expect(result.kind).toBe("object");
    if (result.kind === "error") throw new Error("Expected success");
    expect(unwrapJsonValue(result)).toMatch({ name: "Alice", age: 30 });
  });

  it("returns an error for malformed YAML syntax", () => {
    const schema = parseSchemaOrThrow("type User = { name: string; };");
    const schemaType: SchemaType = {
      type: schema.typeDeclarations["User"]!.valueType,
      schema,
    };
    const result = parseAndValidateYaml(
      "name: [unclosed",
      "user.yaml",
      schemaType,
    );

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { path: "user.yaml" },
          message: /unclosed/,
        },
      ],
    });
  });

  it("returns an error when YAML content violates the schema types", () => {
    const schema = parseSchemaOrThrow(
      "type User = { name: string; age: number; };",
    );
    const schemaType: SchemaType = {
      type: schema.typeDeclarations["User"]!.valueType,
      schema,
    };
    const yaml = "name: Alice\nage: true\n";
    const result = parseAndValidateYaml(yaml, "user.yaml", schemaType);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { path: "user.yaml" },
          message: "Expected number but got boolean",
        },
      ],
    });
  });

  it("returns an error when required schema fields are missing", () => {
    const schema = parseSchemaOrThrow(
      "type User = { name: string; age: number; };",
    );
    const schemaType: SchemaType = {
      type: schema.typeDeclarations["User"]!.valueType,
      schema,
    };
    const yaml = "name: Alice\n";
    const result = parseAndValidateYaml(yaml, "user.yaml", schemaType);

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { path: "user.yaml" },
          message: "Missing required field 'age'",
        },
      ],
    });
  });

  it("parses and validates YAML with a SyntheticType and EMPTY_SCHEMA", () => {
    const schemaType: SchemaType = {
      type: {
        kind: "interface",
        fields: {
          enabled: {
            name: { text: "enabled" },
            type: { kind: "primitive", primitive: { text: "boolean" } },
          },
          tags: {
            name: { text: "tags" },
            type: {
              kind: "array",
              elementType: {
                kind: "primitive",
                primitive: { text: "string" },
              },
            },
          },
        },
      },
      schema: EMPTY_SCHEMA,
    };
    const yaml = "enabled: true\ntags:\n  - alpha\n  - beta\n";
    const result = parseAndValidateYaml(yaml, "config.yaml", schemaType);

    expect(result.kind).toBe("object");
    if (result.kind === "error") throw new Error("Expected success");
    expect(unwrapJsonValue(result)).toMatch({
      enabled: true,
      tags: ["alpha", "beta"],
    });
  });

  it("reports errors for SyntheticType mismatches", () => {
    const schemaType: SchemaType = {
      type: {
        kind: "interface",
        fields: {
          count: {
            name: { text: "count" },
            type: { kind: "primitive", primitive: { text: "number" } },
          },
        },
      },
      schema: EMPTY_SCHEMA,
    };
    const result = parseAndValidateYaml(
      "count: not_a_number",
      "test.yaml",
      schemaType,
    );

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { path: "test.yaml" },
          message: "Expected number but got string",
        },
      ],
    });
  });

  it("preserves the specified file path in error spans", () => {
    const schema = parseSchemaOrThrow("type Item = { id: number; };");
    const schemaType: SchemaType = {
      type: schema.typeDeclarations["Item"]!.valueType,
      schema,
    };
    const result = parseAndValidateYaml(
      "id: invalid",
      "custom/path.yaml",
      schemaType,
    );

    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          span: { path: "custom/path.yaml" },
          message: "Expected number but got string",
        },
      ],
    });
  });
});
