import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { Span } from "../util/shared-types.js";
import type { JsonObject, JsonString, StrictJsonValue } from "./json-types.js";
import { unwrapJsonValue } from "./unwrapper.js";

const SPAN: Span = { start: 0, end: 1, path: "" };

function str(value: string): JsonString {
  return { kind: "string", firstToken: SPAN, value };
}

function obj(entries: [string, StrictJsonValue][]): JsonObject<"strict"> {
  return {
    kind: "object",
    firstToken: SPAN,
    entries: Object.fromEntries(
      entries.map(([key, value]) => [key, { key: str(key), value }]),
    ),
  };
}

describe("unwrapJsonValue", () => {
  it("unwraps a string", () => {
    expect(unwrapJsonValue(str("hello"))).toBe("hello");
  });

  it("unwraps a number", () => {
    expect(
      unwrapJsonValue({ kind: "number", firstToken: SPAN, value: 3.14 }),
    ).toBe(3.14);
  });

  it("unwraps boolean true", () => {
    expect(
      unwrapJsonValue({ kind: "boolean", firstToken: SPAN, value: true }),
    ).toBe(true);
  });

  it("unwraps boolean false", () => {
    expect(
      unwrapJsonValue({ kind: "boolean", firstToken: SPAN, value: false }),
    ).toBe(false);
  });

  it("unwraps null", () => {
    expect(unwrapJsonValue({ kind: "null", firstToken: SPAN })).toBe(null);
  });

  it("unwraps an empty object", () => {
    expect(unwrapJsonValue(obj([]))).toMatch({});
  });

  it("unwraps an object with entries", () => {
    expect(
      unwrapJsonValue(
        obj([
          ["name", str("Alice")],
          ["age", { kind: "number", firstToken: SPAN, value: 30 }],
        ]),
      ),
    ).toMatch({ name: "Alice", age: 30 });
  });

  it("unwraps an empty array", () => {
    expect(
      unwrapJsonValue({ kind: "array", firstToken: SPAN, elements: [] }),
    ).toMatch([]);
  });

  it("unwraps an array of primitives", () => {
    expect(
      unwrapJsonValue({
        kind: "array",
        firstToken: SPAN,
        elements: [
          str("a"),
          { kind: "number", firstToken: SPAN, value: 1 },
          { kind: "boolean", firstToken: SPAN, value: true },
        ],
      }),
    ).toMatch(["a", 1, true]);
  });

  it("unwraps nested objects", () => {
    expect(unwrapJsonValue(obj([["inner", obj([["x", str("y")]])]]))).toMatch({
      inner: { x: "y" },
    });
  });

  it("unwraps an array of objects", () => {
    expect(
      unwrapJsonValue({
        kind: "array",
        firstToken: SPAN,
        elements: [obj([["a", str("1")]]), obj([["b", str("2")]])],
      }),
    ).toMatch([{ a: "1" }, { b: "2" }]);
  });
});
