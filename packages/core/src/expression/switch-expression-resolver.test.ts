import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseSchema } from "../schema/schema-parser.js";
import type { ResolvedFieldType, Schema } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import type { MappedSpan } from "../util/shared-types.js";
import { parseExpression } from "./expression-parser.js";
import { resolveExpressionType } from "./expression-type-resolver.js";
import type { Expression } from "./expression-types.js";
import { resolveSwitchExpression } from "./switch-expression-resolver.js";

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

function resolveExprTypeOrThrow(
  expression: Expression,
  schema: Schema,
): ResolvedFieldType {
  const result = resolveExpressionType(expression, schema, null);
  if (result.kind === "error") {
    throw new Error(
      `resolveExpressionType failed: ${JSON.stringify(result.errors)}`,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// resolveSwitchExpression - discriminated interface union via property
// ---------------------------------------------------------------------------

describe("resolveSwitchExpression - discriminated interface union via property", () => {
  it("narrows left expression type for 2-variant interface union", () => {
    const schema = parseSchemaOrThrow(
      'type Input = { kind: "cat"; name: string; } | { kind: "dog"; breed: string; }',
    );
    const expr = makeExpr("input.kind");
    const kindType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, kindType, schema)).toMatch({
      kind: "success",
      cases: {
        cat: {
          it: { expression: expr, type: kindType },
          typeOverrides: {
            input: {
              kind: "interface",
              fields: {
                kind: {
                  name: { text: "kind" },
                  type: { kind: "string-literal", value: "cat" },
                },
                name: {
                  name: { text: "name" },
                  type: { kind: "primitive", primitive: { text: "string" } },
                },
              },
            },
          },
        },
        dog: {
          it: { expression: expr, type: kindType },
          typeOverrides: {
            input: {
              kind: "interface",
              fields: {
                kind: {
                  name: { text: "kind" },
                  type: { kind: "string-literal", value: "dog" },
                },
                breed: {
                  name: { text: "breed" },
                  type: { kind: "primitive", primitive: { text: "string" } },
                },
              },
            },
          },
        },
      },
    });
  });

  it("narrows nested left expression path on 3-variant union", () => {
    const schema = parseSchemaOrThrow(`
      type Circle = { shape: "circle"; radius: number; };
      type Rect = { shape: "rect"; width: number; height: number; };
      type Triangle = { shape: "triangle"; base: number; height: number; };
      type Shape = Circle | Rect | Triangle;
      type Input = { item: { current: Shape; }; };
    `);
    const expr = makeExpr("input.item.current.shape");
    const shapePropType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, shapePropType, schema)).toMatch({
      kind: "success",
      cases: {
        circle: {
          it: { expression: expr, type: shapePropType },
          typeOverrides: {
            "input.item.current": {
              kind: "interface",
              fields: {
                shape: {
                  name: { text: "shape" },
                  type: { kind: "string-literal", value: "circle" },
                },
                radius: {
                  name: { text: "radius" },
                  type: { kind: "primitive", primitive: { text: "number" } },
                },
              },
            },
          },
        },
        rect: {
          it: { expression: expr, type: shapePropType },
          typeOverrides: {
            "input.item.current": {
              kind: "interface",
              fields: {
                shape: {
                  name: { text: "shape" },
                  type: { kind: "string-literal", value: "rect" },
                },
                width: {
                  name: { text: "width" },
                  type: { kind: "primitive", primitive: { text: "number" } },
                },
                height: {
                  name: { text: "height" },
                  type: { kind: "primitive", primitive: { text: "number" } },
                },
              },
            },
          },
        },
        triangle: {
          it: { expression: expr, type: shapePropType },
          typeOverrides: {
            "input.item.current": {
              kind: "interface",
              fields: {
                shape: {
                  name: { text: "shape" },
                  type: { kind: "string-literal", value: "triangle" },
                },
                base: {
                  name: { text: "base" },
                  type: { kind: "primitive", primitive: { text: "number" } },
                },
                height: {
                  name: { text: "height" },
                  type: { kind: "primitive", primitive: { text: "number" } },
                },
              },
            },
          },
        },
      },
    });
  });

  it("rejects property expression when property is not the discriminator", () => {
    const schema = parseSchemaOrThrow(
      'type Input = { kind: "cat"; name: string; } | { kind: "dog"; name: string; }',
    );
    const expr = makeExpr("input.name");
    const stringType: ResolvedFieldType = {
      kind: "primitive",
      primitive: { text: "string", start: 0, end: 6, path: "" },
    };

    expect(resolveSwitchExpression(expr, stringType, schema)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: union type",
        },
      ],
    });
  });

  it("rejects property expression when left is a regular interface", () => {
    const schema = parseSchemaOrThrow("type Input = { name: string; }");
    const expr = makeExpr("input.name");
    const nameType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, nameType, schema)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: union type",
        },
      ],
    });
  });

  it("supports boolean-discriminated interface union via property", () => {
    const schema = parseSchemaOrThrow(
      "type Input = { isSuccess: true; data: string; } | { isSuccess: false; error: string; };",
    );
    const expr = makeExpr("input.isSuccess");
    const isSuccessType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, isSuccessType, schema)).toMatch({
      kind: "success",
      cases: {
        true: {
          it: { expression: expr, type: isSuccessType },
          typeOverrides: {
            input: {
              kind: "interface",
              fields: {
                isSuccess: {
                  name: { text: "isSuccess" },
                  type: { kind: "boolean-literal", value: true },
                },
                data: {
                  name: { text: "data" },
                  type: { kind: "primitive", primitive: { text: "string" } },
                },
              },
            },
          },
        },
        false: {
          it: { expression: expr, type: isSuccessType },
          typeOverrides: {
            input: {
              kind: "interface",
              fields: {
                isSuccess: {
                  name: { text: "isSuccess" },
                  type: { kind: "boolean-literal", value: false },
                },
                error: {
                  name: { text: "error" },
                  type: { kind: "primitive", primitive: { text: "string" } },
                },
              },
            },
          },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveSwitchExpression - string literal type
// ---------------------------------------------------------------------------

describe("resolveSwitchExpression - string literal type", () => {
  it("wraps a single string-literal type into a one-case result", () => {
    const schema = parseSchemaOrThrow('type Input = { status: "readonly"; }');
    const expr = makeExpr("input.status");
    const statusType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, statusType, schema)).toMatch({
      kind: "success",
      cases: {
        readonly: {
          it: { expression: expr, type: statusType },
          typeOverrides: {},
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveSwitchExpression - string union
// ---------------------------------------------------------------------------

describe("resolveSwitchExpression - string union", () => {
  it("produces a case entry for each string literal in the union", () => {
    const schema = parseSchemaOrThrow(
      'type Input = "admin" | "member" | "guest"',
    );
    const expr = makeExpr("input");
    const inputType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, inputType, schema)).toMatch({
      kind: "success",
      cases: {
        admin: {
          it: { expression: expr, type: inputType },
          typeOverrides: {},
        },
        member: {
          it: { expression: expr, type: inputType },
          typeOverrides: {},
        },
        guest: {
          it: { expression: expr, type: inputType },
          typeOverrides: {},
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveSwitchExpression - non-union types
// ---------------------------------------------------------------------------

describe("resolveSwitchExpression - non-union types", () => {
  it("rejects primitive number with 'Expected: union type'", () => {
    const schema = parseSchemaOrThrow("type Input = number");
    const expr = makeExpr("input");
    const inputType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, inputType, schema)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: union type",
        },
      ],
    });
  });

  it("rejects primitive string with 'Expected: union type'", () => {
    const schema = parseSchemaOrThrow("type Input = string");
    const expr = makeExpr("input");
    const inputType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, inputType, schema)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: union type",
        },
      ],
    });
  });

  it("rejects primitive boolean with 'Expected: union type'", () => {
    const schema = parseSchemaOrThrow("type Input = boolean");
    const expr = makeExpr("input");
    const inputType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, inputType, schema)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: union type",
        },
      ],
    });
  });

  it("rejects interface type with 'Expected: union type'", () => {
    const schema = parseSchemaOrThrow("type Input = { a: string; b: number; }");
    const expr = makeExpr("input");
    const inputType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, inputType, schema)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: union type",
        },
      ],
    });
  });

  it("rejects array type with 'Expected: union type'", () => {
    const schema = parseSchemaOrThrow("type Input = string[]");
    const expr = makeExpr("input");
    const inputType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, inputType, schema)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: union type",
        },
      ],
    });
  });

  it("rejects record type with 'Expected: union type'", () => {
    const schema = parseSchemaOrThrow("type Input = {[k: string]: string}");
    const expr = makeExpr("input");
    const inputType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, inputType, schema)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: union type",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// resolveSwitchExpression - non-string-union types
// ---------------------------------------------------------------------------

describe("resolveSwitchExpression - non-string-union types", () => {
  it("rejects direct switch on interface union with 'Expected: union of string literals'", () => {
    const schema = parseSchemaOrThrow(
      'type Input = { kind: "cat"; name: string; } | { kind: "dog"; breed: string; }',
    );
    const expr = makeExpr("input");
    const inputType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, inputType, schema)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: union of string literals",
        },
      ],
    });
  });

  it("rejects direct switch on boolean-discriminated interface union with 'Expected: union of string literals'", () => {
    const schema = parseSchemaOrThrow(
      "type Input = { isSuccess: true; data: string; } | { isSuccess: false; error: string; };",
    );
    const expr = makeExpr("input");
    const inputType = resolveExprTypeOrThrow(expr, schema);

    expect(resolveSwitchExpression(expr, inputType, schema)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: union of string literals",
        },
      ],
    });
  });
});
