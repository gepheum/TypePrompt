import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseSchema } from "../schema/schema-parser.js";
import type {
  PrimitiveType,
  ResolvedType,
  Schema,
} from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import type { MappedText, TextSpan } from "../util/shared-types.js";
import { parseExpression } from "./expression-parser.js";
import { resolveExpressionType } from "./expression-type-resolver.js";
import type {
  Expression,
  ExpressionContext,
  NullableType,
} from "./expression-types.js";
import { resolveIfExpression } from "./if-expression-resolver.js";
import { resolveSwitchExpression } from "./switch-expression-resolver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textNode(source: string): MappedText {
  return { text: source, offsetMap: [{ textPosition: 0, sourcePosition: 0 }] };
}

function span<T extends string>(text: T): TextSpan<T> {
  return { text, start: 0, end: text.length };
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

function parseSchemaOrThrow(source: string): Schema {
  const node = textNode(source);
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
  return { kind: "primitive", primitive: { text, start: 0, end: text.length } };
}

function nullable(type: ResolvedType): NullableType {
  return { kind: "nullable", type };
}

function makeContext(
  expression: Expression,
  type: ResolvedType | NullableType,
  typeOverrides: ExpressionContext["typeOverrides"] = {},
): ExpressionContext {
  return { it: { expression, type }, typeOverrides };
}

// ---------------------------------------------------------------------------
// resolveExpressionType – input expression
// ---------------------------------------------------------------------------

describe("resolveExpressionType – input", () => {
  it("resolves 'input' to the Input type declared in the schema", () => {
    const schema = parseSchemaOrThrow("type Input = string");
    expect(resolveExpressionType(makeExpr("input"), schema, null)).toMatch({
      kind: "primitive",
      primitive: { text: "string" },
    });
  });

  it("resolves 'input' to an interface type", () => {
    const schema = parseSchemaOrThrow("type Input = { name: string; }");
    expect(resolveExpressionType(makeExpr("input"), schema, null)).toMatch({
      kind: "interface",
    });
  });
});

// ---------------------------------------------------------------------------
// resolveExpressionType – it expression
// ---------------------------------------------------------------------------

describe("resolveExpressionType – it", () => {
  it("resolves 'it' to the context it.type", () => {
    const schema = parseSchemaOrThrow("type Input = string");
    const expr = makeExprCtx("it");
    const context = makeContext(makeExpr("input"), prim("number"));
    expect(resolveExpressionType(expr, schema, context)).toMatch({
      kind: "primitive",
      primitive: { text: "number" },
    });
  });

  it("resolves 'it' to a nullable type from context", () => {
    const schema = parseSchemaOrThrow("type Input = string");
    const expr = makeExprCtx("it");
    const context = makeContext(makeExpr("input"), nullable(prim("string")));
    expect(resolveExpressionType(expr, schema, context) as unknown).toMatch({
      kind: "nullable",
    });
  });
});

// ---------------------------------------------------------------------------
// resolveExpressionType – property on interface
// ---------------------------------------------------------------------------

describe("resolveExpressionType – property access on interface", () => {
  it("resolves 'input.name' to the field type of a required field", () => {
    const schema = parseSchemaOrThrow("type Input = { name: string; }");
    expect(resolveExpressionType(makeExpr("input.name"), schema, null)).toMatch(
      {
        kind: "primitive",
        primitive: { text: "string" },
      },
    );
  });

  it("returns a nullable type for an optional field", () => {
    const schema = parseSchemaOrThrow("type Input = { value?: number; }");
    expect(
      resolveExpressionType(makeExpr("input.value"), schema, null),
    ).toMatch({
      kind: "nullable",
      type: { kind: "primitive", primitive: { text: "number" } },
    });
  });

  it("reports an error for a field that does not exist", () => {
    const schema = parseSchemaOrThrow("type Input = { name: string; }");
    expect(resolveExpressionType(makeExpr("input.age"), schema, null)).toMatch({
      kind: "error",
      errors: [{ message: "Field 'age' not found in interface" }],
    });
  });

  it("reports an error when the left side is not an interface", () => {
    const schema = parseSchemaOrThrow("type Input = string");
    expect(resolveExpressionType(makeExpr("input.name"), schema, null)).toMatch(
      {
        kind: "error",
        errors: [{ message: "Not an interface type" }],
      },
    );
  });

  it("reports an error when the left side is nullable", () => {
    const schema = parseSchemaOrThrow(
      "type Input = { child?: { name: string; }; }",
    );
    expect(
      resolveExpressionType(makeExpr("input.child.name"), schema, null),
    ).toMatch({
      kind: "error",
      errors: [{ message: "May be null" }],
    });
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
  });
});

// ---------------------------------------------------------------------------
// resolveExpressionType – property on union (discriminator)
// ---------------------------------------------------------------------------

describe("resolveExpressionType – property on discriminated union", () => {
  it("resolves the discriminator property to a union of its string literal values", () => {
    const schema = parseSchemaOrThrow(
      'type Input = { kind: "cat" } | { kind: "dog" }',
    );
    const result = resolveExpressionType(makeExpr("input.kind"), schema, null);
    expect(result).toMatch({ kind: "union" });
  });
});

// ---------------------------------------------------------------------------
// resolveExpressionType – type overrides and it-prefix rewriting
// ---------------------------------------------------------------------------

describe("resolveExpressionType – type overrides", () => {
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
  });
});

// ---------------------------------------------------------------------------
// resolveIfExpression – boolean type
// ---------------------------------------------------------------------------

describe("resolveIfExpression – boolean type", () => {
  const expr = makeExpr("input");

  it("succeeds with no 'is' clause for a boolean type", () => {
    expect(resolveIfExpression(expr, prim("boolean"), null)).toMatch({
      kind: "success",
      then: {},
      else: {},
    });
  });

  it("rejects an 'is' clause for a boolean type", () => {
    expect(resolveIfExpression(expr, prim("boolean"), span("notNull"))).toMatch(
      {
        kind: "error",
        errors: [{ message: "Cannot use 'is' attribute with boolean type" }],
      },
    );
  });
});

// ---------------------------------------------------------------------------
// resolveIfExpression – nullable type
// ---------------------------------------------------------------------------

describe("resolveIfExpression – nullable type", () => {
  const expr = makeExpr("input");
  const nType = nullable(prim("string"));

  it("succeeds with 'is=\"notNull\"' for a nullable type", () => {
    const result = resolveIfExpression(expr, nType, span("notNull"));
    expect(result).toMatch({
      kind: "success",
      then: { typeOverrides: { input: { kind: "primitive" } } },
      else: { typeOverrides: { input: { kind: "null" } } },
    });
  });

  it("rejects a missing 'is' clause for a nullable type", () => {
    expect(resolveIfExpression(expr, nType, null)).toMatch({
      kind: "error",
      errors: [{ message: "must use 'is=\"notNull\"' with nullable type" }],
    });
  });

  it("rejects 'is=\"notEmpty\"' for a nullable type", () => {
    expect(resolveIfExpression(expr, nType, span("notEmpty"))).toMatch({
      kind: "error",
      errors: [{ message: "must use 'is=\"notNull\"' with nullable type" }],
    });
  });
});

// ---------------------------------------------------------------------------
// resolveIfExpression – array and string types
// ---------------------------------------------------------------------------

describe("resolveIfExpression – array and string types", () => {
  const expr = makeExpr("input");
  const arrayType: ResolvedType = {
    kind: "array",
    elementType: prim("string"),
  };

  it("succeeds with 'is=\"notEmpty\"' for an array type", () => {
    expect(resolveIfExpression(expr, arrayType, span("notEmpty"))).toMatch({
      kind: "success",
    });
  });

  it("rejects a missing 'is' clause for an array type", () => {
    expect(resolveIfExpression(expr, arrayType, null)).toMatch({
      kind: "error",
      errors: [
        { message: "must use 'is=\"notEmpty\"' with array or string type" },
      ],
    });
  });

  it("succeeds with 'is=\"notEmpty\"' for a string type", () => {
    expect(resolveIfExpression(expr, prim("string"), span("notEmpty"))).toMatch(
      {
        kind: "success",
      },
    );
  });

  it("rejects a missing 'is' clause for a string type", () => {
    expect(resolveIfExpression(expr, prim("string"), null)).toMatch({
      kind: "error",
      errors: [
        { message: "must use 'is=\"notEmpty\"' with array or string type" },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// resolveIfExpression – other types (no matching 'is' value)
// ---------------------------------------------------------------------------

describe("resolveIfExpression – other types", () => {
  const expr = makeExpr("input");

  it("reports 'Expected: nullable value' for 'is=\"notNull\"' on a number", () => {
    expect(resolveIfExpression(expr, prim("number"), span("notNull"))).toMatch({
      kind: "error",
      errors: [{ message: "Expected: nullable value" }],
    });
  });

  it("reports 'Expected: array or string' for 'is=\"notEmpty\"' on a number", () => {
    expect(resolveIfExpression(expr, prim("number"), span("notEmpty"))).toMatch(
      {
        kind: "error",
        errors: [{ message: "Expected: array or string" }],
      },
    );
  });

  it("reports 'Expected: boolean' when no 'is' is provided for a number", () => {
    expect(resolveIfExpression(expr, prim("number"), null)).toMatch({
      kind: "error",
      errors: [{ message: "Expected: boolean" }],
    });
  });
});

// ---------------------------------------------------------------------------
// resolveSwitchExpression – errors
// ---------------------------------------------------------------------------

describe("resolveSwitchExpression – errors", () => {
  it("rejects a primitive (non-union) type with 'Expected: union type'", () => {
    const schema = parseSchemaOrThrow("type Input = string");
    expect(
      resolveSwitchExpression(makeExpr("input"), prim("number"), schema),
    ).toMatch({
      kind: "error",
      errors: [{ message: "Expected: union type" }],
    });
  });

  it("rejects a discriminated interface union with 'Expected: union of string literals'", () => {
    const schema = parseSchemaOrThrow(
      'type Input = { kind: "cat"; name: string } | { kind: "dog"; breed: string }',
    );
    const inputType = resolveExpressionType(makeExpr("input"), schema, null);
    expect(
      resolveSwitchExpression(
        makeExpr("input"),
        inputType as ResolvedType,
        schema,
      ),
    ).toMatch({
      kind: "error",
      errors: [{ message: "Expected: union of string literals" }],
    });
  });
});

// ---------------------------------------------------------------------------
// resolveSwitchExpression – string union
// ---------------------------------------------------------------------------

describe("resolveSwitchExpression – string union", () => {
  it("produces a case entry for each string literal in the union", () => {
    const schema = parseSchemaOrThrow('type Input = "a" | "b" | "c"');
    const inputType = resolveExpressionType(makeExpr("input"), schema, null);
    const result = resolveSwitchExpression(
      makeExpr("input"),
      inputType as ResolvedType,
      schema,
    );
    expect(result).toMatch({
      kind: "success",
      cases: { a: {}, b: {}, c: {} },
    });
  });

  it("wraps a single string-literal type into a one-case result", () => {
    const schema = parseSchemaOrThrow('type Input = "only"');
    const inputType = resolveExpressionType(makeExpr("input"), schema, null);
    const result = resolveSwitchExpression(
      makeExpr("input"),
      inputType as ResolvedType,
      schema,
    );
    expect(result).toMatch({ kind: "success", cases: { only: {} } });
  });
});

// ---------------------------------------------------------------------------
// resolveSwitchExpression – discriminator property
// ---------------------------------------------------------------------------

describe("resolveSwitchExpression – discriminated interface union via property", () => {
  it("produces a case per member with a type override for the left expression", () => {
    const schema = parseSchemaOrThrow(
      'type Input = { kind: "cat"; name: string } | { kind: "dog"; breed: string }',
    );
    // expression = input.kind, which is the discriminator property
    const kindType = resolveExpressionType(
      makeExpr("input.kind"),
      schema,
      null,
    );
    const result = resolveSwitchExpression(
      makeExpr("input.kind"),
      kindType as ResolvedType,
      schema,
    );
    expect(result).toMatch({ kind: "success" });
    if (result.kind !== "success") return;
    // Each case should narrow the 'input' expression to the corresponding interface.
    const catCase = result.cases["cat"];
    const dogCase = result.cases["dog"];
    expect(catCase).toMatch({
      typeOverrides: { input: { kind: "interface" } },
    });
    expect(dogCase).toMatch({
      typeOverrides: { input: { kind: "interface" } },
    });
  });
});
