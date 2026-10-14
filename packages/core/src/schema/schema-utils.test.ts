import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseSchema } from "./schema-parser.js";
import type { Schema } from "./schema-types.js";
import { getNameDependencies } from "./schema-utils.js";
import { validateSchema } from "./schema-validator.js";

function parseNamespaceSchema(source: string): Schema {
  const sourceSpan = {
    path: "shared.ts",
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const parseResult = parseSchema(sourceSpan, "namespace");
  if (parseResult.kind !== "success") {
    throw new Error(
      `Parse failed: ${parseResult.errors.map((e) => e.message).join(", ")}`,
    );
  }
  const schema = validateSchema(parseResult, null);
  if (schema.kind === "error") {
    throw new Error(
      `Validation failed: ${schema.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return schema;
}

function parseTemplateSchema(
  templateSource: string,
  namespaceSchema: Schema,
): Schema {
  const sourceSpan = {
    path: "template.ts",
    text: templateSource,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const parseResult = parseSchema(sourceSpan, "template");
  if (parseResult.kind !== "success") {
    throw new Error(
      `Parse failed: ${parseResult.errors.map((e) => e.message).join(", ")}`,
    );
  }
  const schema = validateSchema(parseResult, namespaceSchema);
  if (schema.kind === "error") {
    throw new Error(
      `Validation failed: ${schema.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return schema;
}

describe("getNameDependencies", () => {
  it("switches to shared scope and collects dependencies from sharedDeclarations for namespace TypeName", () => {
    const ns = parseNamespaceSchema(
      [
        "type Country = { name: string; };",
        "type Address = { city: string; country: Country; };",
        "type User = { name: string; address: Address; };",
      ].join("\n"),
    );
    const template = parseTemplateSchema(
      "type Input = string;\ntype Output = shared.User;",
      ns,
    );

    // In template schema, User's address field has type-name "Address" with context: "namespace"
    const userDecl = template.sharedDeclarations["User"]!;
    const deps = getNameDependencies(
      userDecl.valueType,
      "defaultScope",
      template,
      "recursive",
    );

    expect([...deps.shared].sort()).toMatch(["Address", "Country"]);
    expect([...deps.defaultScope]).toMatch([]);
  });

  it("adds direct dependency to shared scope for namespace TypeName", () => {
    const ns = parseNamespaceSchema(
      [
        "type Address = { city: string; };",
        "type User = { name: string; address: Address; };",
      ].join("\n"),
    );
    const template = parseTemplateSchema(
      "type Input = string;\ntype Output = shared.User;",
      ns,
    );

    const userDecl = template.sharedDeclarations["User"]!;
    const deps = getNameDependencies(
      userDecl.valueType,
      "defaultScope",
      template,
      "direct",
    );

    expect([...deps.shared].sort()).toMatch(["Address"]);
    expect([...deps.defaultScope]).toMatch([]);
  });
});
