import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { EMPTY_SCHEMA } from "../schema/empty-schema.js";
import { parseSchema } from "../schema/schema-parser.js";
import type {
  Array as ArrayType,
  Interface,
  Optional,
  PrimitiveType,
  RecordType,
  ResolvedType,
  Schema,
} from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import type { MappedSpan, TextSpan } from "../util/shared-types.js";
import { parseExpression } from "./expression-parser.js";
import type { Expression } from "./expression-types.js";
import { resolveIfExpression } from "./if-expression-resolver.js";

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

function span<T extends string>(text: T): TextSpan<T> {
  return { text, start: 0, end: text.length, path: "" };
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

function prim(
  text: "string" | "number" | "boolean" | "integer",
): PrimitiveType {
  return {
    kind: "primitive",
    primitive: span(text),
  };
}

function optional(type: ResolvedType): Optional {
  return { kind: "optional", innerType: type };
}

// ---------------------------------------------------------------------------
// resolveIfExpression - boolean type
// ---------------------------------------------------------------------------

describe("resolveIfExpression - boolean type", () => {
  it("succeeds when is attribute is omitted", () => {
    const expr = makeExpr("input.isActive");
    const type = prim("boolean");
    expect(resolveIfExpression(expr, type, null, EMPTY_SCHEMA)).toMatch({
      kind: "success",
      then: {
        it: { expression: expr, type },
        typeOverrides: {},
      },
      else: {
        it: { expression: expr, type },
        typeOverrides: {},
      },
    });
  });

  it("succeeds when is attribute is explicitly 'true'", () => {
    const expr = makeExpr("input.isActive");
    const type = prim("boolean");
    expect(resolveIfExpression(expr, type, span("true"), EMPTY_SCHEMA)).toMatch(
      {
        kind: "success",
        then: {
          it: { expression: expr, type },
          typeOverrides: {},
        },
        else: {
          it: { expression: expr, type },
          typeOverrides: {},
        },
      },
    );
  });

  it("rejects 'is=\"notNull\"' with boolean type", () => {
    const expr = makeExpr("input.isActive");
    const isSpan = span("notNull");
    expect(
      resolveIfExpression(expr, prim("boolean"), isSpan, EMPTY_SCHEMA),
    ).toMatch({
      kind: "error",
      errors: [
        {
          span: isSpan,
          message: "Cannot use 'is' attribute with boolean type",
          hint: "Remove the 'is' attribute",
        },
      ],
    });
  });

  it("rejects 'is=\"notEmpty\"' with boolean type", () => {
    const expr = makeExpr("input.isActive");
    const isSpan = span("notEmpty");
    expect(
      resolveIfExpression(expr, prim("boolean"), isSpan, EMPTY_SCHEMA),
    ).toMatch({
      kind: "error",
      errors: [
        {
          span: isSpan,
          message: "Cannot use 'is' attribute with boolean type",
          hint: "Remove the 'is' attribute",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// resolveIfExpression - optional type
// ---------------------------------------------------------------------------

describe("resolveIfExpression - optional type", () => {
  it("succeeds with 'is=\"notNull\"' on primitive optional and creates typeOverrides", () => {
    const expr = makeExpr("input.middleName");
    const innerType = prim("string");
    const optType = optional(innerType);
    expect(
      resolveIfExpression(expr, optType, span("notNull"), EMPTY_SCHEMA),
    ).toMatch({
      kind: "success",
      then: {
        it: { expression: expr, type: optType },
        typeOverrides: {
          "input.middleName": innerType,
        },
      },
      else: {
        it: { expression: expr, type: optType },
        typeOverrides: {
          "input.middleName": { kind: "null" },
        },
      },
    });
  });

  it("resolves inner type aliases against schema in then branch", () => {
    const schema = parseSchemaOrThrow("type User = { name: string; }");
    const expr = makeExpr("input.user");
    const optType: Optional = {
      kind: "optional",
      innerType: {
        kind: "type-name",
        name: { text: "User", start: 0, end: 4, path: "" },
      },
    };
    expect(resolveIfExpression(expr, optType, span("notNull"), schema)).toMatch(
      {
        kind: "success",
        then: {
          it: { expression: expr, type: optType },
          typeOverrides: {
            "input.user": {
              kind: "interface",
              fields: {
                name: {
                  name: { text: "name" },
                  type: { kind: "primitive", primitive: { text: "string" } },
                },
              },
            },
          },
        },
        else: {
          it: { expression: expr, type: optType },
          typeOverrides: {
            "input.user": { kind: "null" },
          },
        },
      },
    );
  });

  it("works with nested expression paths", () => {
    const expr = makeExpr("input.user.tag");
    const innerType = prim("string");
    const optType = optional(innerType);
    expect(
      resolveIfExpression(expr, optType, span("notNull"), EMPTY_SCHEMA),
    ).toMatch({
      kind: "success",
      then: {
        it: { expression: expr, type: optType },
        typeOverrides: {
          "input.user.tag": innerType,
        },
      },
      else: {
        it: { expression: expr, type: optType },
        typeOverrides: {
          "input.user.tag": { kind: "null" },
        },
      },
    });
  });

  it("rejects omitted 'is' attribute on optional type with expression span", () => {
    const expr = makeExpr("input.middleName");
    expect(
      resolveIfExpression(expr, optional(prim("string")), null, EMPTY_SCHEMA),
    ).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "must use 'is=\"notNull\"' with optional type",
        },
      ],
    });
  });

  it("rejects 'is=\"notEmpty\"' on optional type with is span", () => {
    const expr = makeExpr("input.middleName");
    const isSpan = span("notEmpty");
    expect(
      resolveIfExpression(expr, optional(prim("string")), isSpan, EMPTY_SCHEMA),
    ).toMatch({
      kind: "error",
      errors: [
        {
          span: isSpan,
          message: "must use 'is=\"notNull\"' with optional type",
        },
      ],
    });
  });

  it("rejects 'is=\"true\"' on optional type with is span", () => {
    const expr = makeExpr("input.middleName");
    const isSpan = span("true");
    expect(
      resolveIfExpression(expr, optional(prim("string")), isSpan, EMPTY_SCHEMA),
    ).toMatch({
      kind: "error",
      errors: [
        {
          span: isSpan,
          message: "must use 'is=\"notNull\"' with optional type",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// resolveIfExpression - array type
// ---------------------------------------------------------------------------

describe("resolveIfExpression - array type", () => {
  const expr = makeExpr("input.items");
  const arrType: ArrayType = {
    kind: "array",
    elementType: prim("string"),
  };

  it("succeeds with 'is=\"notEmpty\"' for array type", () => {
    expect(
      resolveIfExpression(expr, arrType, span("notEmpty"), EMPTY_SCHEMA),
    ).toMatch({
      kind: "success",
      then: {
        it: { expression: expr, type: arrType },
        typeOverrides: {},
      },
      else: {
        it: { expression: expr, type: arrType },
        typeOverrides: {},
      },
    });
  });

  it("rejects missing 'is' attribute on array type with expression span", () => {
    expect(resolveIfExpression(expr, arrType, null, EMPTY_SCHEMA)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "must use 'is=\"notEmpty\"' with array or string type",
        },
      ],
    });
  });

  it("rejects 'is=\"notNull\"' on array type with is span", () => {
    const isSpan = span("notNull");
    expect(resolveIfExpression(expr, arrType, isSpan, EMPTY_SCHEMA)).toMatch({
      kind: "error",
      errors: [
        {
          span: isSpan,
          message: "must use 'is=\"notEmpty\"' with array or string type",
        },
      ],
    });
  });

  it("rejects 'is=\"true\"' on array type with is span", () => {
    const isSpan = span("true");
    expect(resolveIfExpression(expr, arrType, isSpan, EMPTY_SCHEMA)).toMatch({
      kind: "error",
      errors: [
        {
          span: isSpan,
          message: "must use 'is=\"notEmpty\"' with array or string type",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// resolveIfExpression - string primitive type
// ---------------------------------------------------------------------------

describe("resolveIfExpression - string primitive type", () => {
  const expr = makeExpr("input.description");
  const strType = prim("string");

  it("succeeds with 'is=\"notEmpty\"' for string type", () => {
    expect(
      resolveIfExpression(expr, strType, span("notEmpty"), EMPTY_SCHEMA),
    ).toMatch({
      kind: "success",
      then: {
        it: { expression: expr, type: strType },
        typeOverrides: {},
      },
      else: {
        it: { expression: expr, type: strType },
        typeOverrides: {},
      },
    });
  });

  it("rejects missing 'is' attribute on string type with expression span", () => {
    expect(resolveIfExpression(expr, strType, null, EMPTY_SCHEMA)).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "must use 'is=\"notEmpty\"' with array or string type",
        },
      ],
    });
  });

  it("rejects 'is=\"notNull\"' on string type with is span", () => {
    const isSpan = span("notNull");
    expect(resolveIfExpression(expr, strType, isSpan, EMPTY_SCHEMA)).toMatch({
      kind: "error",
      errors: [
        {
          span: isSpan,
          message: "must use 'is=\"notEmpty\"' with array or string type",
        },
      ],
    });
  });

  it("rejects 'is=\"true\"' on string type with is span", () => {
    const isSpan = span("true");
    expect(resolveIfExpression(expr, strType, isSpan, EMPTY_SCHEMA)).toMatch({
      kind: "error",
      errors: [
        {
          span: isSpan,
          message: "must use 'is=\"notEmpty\"' with array or string type",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// resolveIfExpression - other non-matching types
// ---------------------------------------------------------------------------

describe("resolveIfExpression - other types", () => {
  const expr = makeExpr("input.count");

  it("reports 'Expected: optional value' for 'is=\"notNull\"' on a number", () => {
    expect(
      resolveIfExpression(expr, prim("number"), span("notNull"), EMPTY_SCHEMA),
    ).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: optional value",
        },
      ],
    });
  });

  it("reports 'Expected: optional value' for 'is=\"notNull\"' on an integer", () => {
    expect(
      resolveIfExpression(expr, prim("integer"), span("notNull"), EMPTY_SCHEMA),
    ).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: optional value",
        },
      ],
    });
  });

  it("reports 'Expected: array or string' for 'is=\"notEmpty\"' on a number", () => {
    expect(
      resolveIfExpression(expr, prim("number"), span("notEmpty"), EMPTY_SCHEMA),
    ).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: array or string",
        },
      ],
    });
  });

  it("reports 'Expected: array or string' for 'is=\"notEmpty\"' on an interface", () => {
    const ifaceExpr = makeExpr("input.user");
    const ifaceType: Interface = {
      kind: "interface",
      leftCurlyBracket: { start: 0, end: 1, path: "" },
      fields: {},
    };
    expect(
      resolveIfExpression(ifaceExpr, ifaceType, span("notEmpty"), EMPTY_SCHEMA),
    ).toMatch({
      kind: "error",
      errors: [
        {
          span: ifaceExpr.fullPath,
          message: "Expected: array or string",
        },
      ],
    });
  });

  it("reports 'Expected: boolean' when 'is=\"true\"' is provided for a number", () => {
    expect(
      resolveIfExpression(expr, prim("number"), span("true"), EMPTY_SCHEMA),
    ).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: boolean",
        },
      ],
    });
  });

  it("reports 'Expected: boolean' when 'is' attribute is omitted for a number", () => {
    expect(
      resolveIfExpression(expr, prim("number"), null, EMPTY_SCHEMA),
    ).toMatch({
      kind: "error",
      errors: [
        {
          span: expr.fullPath,
          message: "Expected: boolean",
        },
      ],
    });
  });

  it("reports 'Expected: boolean' when 'is' attribute is omitted for a record", () => {
    const recExpr = makeExpr("input.dict");
    const recType: RecordType = {
      kind: "record",
      leftCurlyBracket: { start: 0, end: 1, path: "" },
      keyName: "key",
      valueType: prim("string"),
    };
    expect(resolveIfExpression(recExpr, recType, null, EMPTY_SCHEMA)).toMatch({
      kind: "error",
      errors: [
        {
          span: recExpr.fullPath,
          message: "Expected: boolean",
        },
      ],
    });
  });
});
