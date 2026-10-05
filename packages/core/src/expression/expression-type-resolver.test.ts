import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseSchema } from "../schema/schema-parser.js";
import type {
  Optional,
  PrimitiveType,
  ResolvedType,
  Schema,
} from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import type { MappedSpan } from "../util/shared-types.js";
import { parseExpression } from "./expression-parser.js";
import {
  collectExpressionDefinitionLinks,
  resolveExpressionType,
} from "./expression-type-resolver.js";
import type { Expression, ExpressionContext } from "./expression-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textNode(source: string, path = ""): MappedSpan {
  return {
    text: source,
    start: 0,
    end: source.length,
    path,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

function makeExpr(path: string): Expression<false> {
  const r = parseExpression(textNode(path), { hasValContext: false });
  if (r.kind !== "success") throw new Error(`parseExpression failed: ${path}`);
  return r.expression;
}

function makeExprCtx(path: string): Expression<true> {
  const r = parseExpression(textNode(path), { hasValContext: true });
  if (r.kind !== "success") throw new Error(`parseExpression failed: ${path}`);
  return r.expression;
}

function parseSchemaOrThrow(source: string, path = "schema.ts"): Schema {
  const node = textNode(source, path);
  const parsed = parseSchema(node);
  if (parsed.kind !== "success") throw new Error("parse failed");
  const validated = validateSchema(parsed, {
    kind: "namespace",
  });
  if (validated.kind !== "success") throw new Error("validation failed");
  return validated;
}

function prim(
  text: "string" | "number" | "boolean" | "integer",
): PrimitiveType {
  return {
    kind: "primitive",
    primitive: { text, start: 0, end: text.length, path: "" },
  };
}

function optional(type: ResolvedType): Optional {
  return { kind: "optional", innerType: type };
}

function makeContext(
  expression: Expression,
  type: ResolvedType | Optional,
  typeOverrides: ExpressionContext["typeOverrides"] = {},
): ExpressionContext {
  return { it: { expression, type }, typeOverrides };
}

// ---------------------------------------------------------------------------
// resolveExpressionType - input expression
// ---------------------------------------------------------------------------

describe("resolveExpressionType - input", () => {
  it("resolves 'input' to the Input type declared in the schema", () => {
    const schema = parseSchemaOrThrow("type Input = string");
    expect(resolveExpressionType(makeExpr("input"), schema, null)).toMatch({
      kind: "primitive",
      primitive: { text: "string" },
    });
    expect(
      collectExpressionDefinitionLinks(makeExpr("input"), schema, null),
    ).toMatch([]);
  });

  it("resolves 'input' to an interface type", () => {
    const schema = parseSchemaOrThrow("type Input = { name: string; }");
    expect(resolveExpressionType(makeExpr("input"), schema, null)).toMatch({
      kind: "interface",
    });
    expect(
      collectExpressionDefinitionLinks(makeExpr("input"), schema, null),
    ).toMatch([]);
  });
});

// ---------------------------------------------------------------------------
// resolveExpressionType - it expression
// ---------------------------------------------------------------------------

describe("resolveExpressionType - it", () => {
  it("resolves 'it' to the context it.type", () => {
    const schema = parseSchemaOrThrow("type Input = string");
    const expr = makeExprCtx("it");
    const context = makeContext(makeExpr("input"), prim("number"));
    expect(resolveExpressionType(expr, schema, context)).toMatch({
      kind: "primitive",
      primitive: { text: "number" },
    });
    expect(collectExpressionDefinitionLinks(expr, schema, context)).toMatch([]);
  });

  it("resolves 'it' to an optional type from context", () => {
    const schema = parseSchemaOrThrow("type Input = string");
    const expr = makeExprCtx("it");
    const context = makeContext(makeExpr("input"), optional(prim("string")));
    expect(resolveExpressionType(expr, schema, context) as unknown).toMatch({
      kind: "optional",
    });
    expect(collectExpressionDefinitionLinks(expr, schema, context)).toMatch([]);
  });
});

// ---------------------------------------------------------------------------
// resolveExpressionType - property on interface
// ---------------------------------------------------------------------------

describe("resolveExpressionType - property access on interface", () => {
  it("resolves 'input.name' to the field type of a required field", () => {
    const schema = parseSchemaOrThrow("type Input = { name: string; }");
    expect(resolveExpressionType(makeExpr("input.name"), schema, null)).toMatch(
      {
        kind: "primitive",
        primitive: { text: "string" },
      },
    );
    expect(
      collectExpressionDefinitionLinks(makeExpr("input.name"), schema, null),
    ).toMatch([{ definition: { text: "name" } }]);
  });

  it("returns an optional type for an optional field", () => {
    const schema = parseSchemaOrThrow("type Input = { value?: number; }");
    expect(
      resolveExpressionType(makeExpr("input.value"), schema, null),
    ).toMatch({
      kind: "optional",
      innerType: { kind: "primitive", primitive: { text: "number" } },
    });
    expect(
      collectExpressionDefinitionLinks(makeExpr("input.value"), schema, null),
    ).toMatch([{ definition: { text: "value" } }]);
  });

  it("reports an error for a field that does not exist", () => {
    const schema = parseSchemaOrThrow("type Input = { name: string; }");
    expect(resolveExpressionType(makeExpr("input.age"), schema, null)).toMatch({
      kind: "error",
      errors: [
        {
          message: "Field 'age' not found in interface",
          suggestions: ["name"],
        },
      ],
    });
    expect(
      collectExpressionDefinitionLinks(makeExpr("input.age"), schema, null),
    ).toMatch([]);
  });

  it("reports an error when the left side is not an interface", () => {
    const schema = parseSchemaOrThrow("type Input = string");
    expect(resolveExpressionType(makeExpr("input.name"), schema, null)).toMatch(
      {
        kind: "error",
        errors: [{ message: "Not an interface type" }],
      },
    );
    expect(
      collectExpressionDefinitionLinks(makeExpr("input.name"), schema, null),
    ).toMatch([]);
  });

  it("reports an error when the left side is optional", () => {
    const schema = parseSchemaOrThrow(
      "type Input = { child?: { name: string; }; }",
    );
    expect(
      resolveExpressionType(makeExpr("input.child.name"), schema, null),
    ).toMatch({
      kind: "error",
      errors: [{ message: "May be null" }],
    });
    expect(
      collectExpressionDefinitionLinks(
        makeExpr("input.child.name"),
        schema,
        null,
      ),
    ).toMatch([]);
  });

  it("resolves a chain of property accesses", () => {
    const schema = parseSchemaOrThrow(
      "type Input = { address: { city: string; }; }",
    );
    expect(
      resolveExpressionType(makeExpr("input.address.city"), schema, null),
    ).toMatch({
      kind: "primitive",
      primitive: { text: "string" },
    });
    expect(
      collectExpressionDefinitionLinks(
        makeExpr("input.address.city"),
        schema,
        null,
      ),
    ).toMatch([
      { definition: { text: "address" } },
      { definition: { text: "city" } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// resolveExpressionType - property on union (discriminator)
// ---------------------------------------------------------------------------

describe("resolveExpressionType - property on discriminated union", () => {
  it("resolves the discriminator property to a union of its string literal values", () => {
    const schema = parseSchemaOrThrow(
      'type Input = { kind: "cat" } | { kind: "dog" }',
    );
    const result = resolveExpressionType(makeExpr("input.kind"), schema, null);
    expect(result).toMatch({ kind: "union" });
    expect(
      collectExpressionDefinitionLinks(makeExpr("input.kind"), schema, null),
    ).toMatch([{ definition: { text: "kind" } }]);
  });
});

// ---------------------------------------------------------------------------
// resolveExpressionType - type overrides and it-prefix rewriting
// ---------------------------------------------------------------------------

describe("resolveExpressionType - type overrides", () => {
  it("returns the override when the full path is in typeOverrides", () => {
    const schema = parseSchemaOrThrow("type Input = string");
    // makeExprCtx so HasValContext=true, which allows passing a context
    const expr = makeExprCtx("input");
    const context = makeContext(makeExpr("input"), prim("string"), {
      input: prim("number"),
    });
    expect(resolveExpressionType(expr, schema, context)).toMatch({
      kind: "primitive",
      primitive: { text: "number" },
    });
    expect(collectExpressionDefinitionLinks(expr, schema, context)).toMatch([]);
  });

  it("rewrites 'it.x' to 'input.x' when looking up overrides", () => {
    const schema = parseSchemaOrThrow("type Input = { name: string; }");
    const itExpr = makeExprCtx("it.name");
    const context = makeContext(makeExpr("input"), prim("string"), {
      "input.name": prim("number"),
    });
    expect(resolveExpressionType(itExpr, schema, context)).toMatch({
      kind: "primitive",
      primitive: { text: "number" },
    });
    expect(collectExpressionDefinitionLinks(itExpr, schema, context)).toMatch(
      [],
    );
  });
});
