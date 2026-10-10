import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { MappedText } from "../util/shared-types.js";
import { schemasAreEquivalent } from "./schema-equivalence.js";
import { parseSchema } from "./schema-parser.js";
import type { SchemaView } from "./schema-types.js";

function parse(source: string): SchemaView {
  const node: MappedText = {
    path: "test.ts",
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const result = parseSchema(node);
  if (result.kind !== "success") {
    throw new Error("Expected schema parsing to succeed");
  }
  return {
    typeDeclarations: result.typeDeclarations,
    sharedDeclarations: {},
  };
}

describe("schemasAreEquivalent", () => {
  it("returns true for identical simple schemas", () => {
    const a = parse("type Foo = { name: string; age?: integer; };");
    const b = parse("type Foo = { name: string; age?: integer; };");
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      true,
    );
  });

  it("returns true for same schema parsed from different offsets/files", () => {
    const a = parse("type Foo = { name: string; };");
    const b = parse("\n\n   type Foo = { name: string; };");
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      true,
    );
  });

  it("returns false for different type names", () => {
    const a = parse("type Foo = { name: string; };");
    const b = parse("type Bar = { name: string; };");
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      false,
    );
  });

  it("returns false for different field types", () => {
    const a = parse("type Foo = { name: string; };");
    const b = parse("type Foo = { name: number; };");
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      false,
    );
  });

  it("returns false for different field order", () => {
    const a = parse("type Foo = { a: string; b: number; };");
    const b = parse("type Foo = { b: number; a: string; };");
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      false,
    );
  });

  it("returns false for different docs", () => {
    const a = parse("/** Doc A */ type Foo = { name: string; };");
    const b = parse("/** Doc B */ type Foo = { name: string; };");
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      false,
    );
  });

  it("returns false for different field docs", () => {
    const a = parse("type Foo = { /** Field doc A */ name: string; };");
    const b = parse("type Foo = { /** Field doc B */ name: string; };");
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      false,
    );
  });

  it("compares unions, arrays, records, and literals correctly", () => {
    const a = parse(`
      type Status = "active" | "inactive";
      type Container = {
        tags: string[];
        counts: { [k: string]: number };
        flag: true | false;
        payload: any;
      };
    `);
    const b = parse(`
      type Status = "active" | "inactive";
      type Container = {
        tags: string[];
        counts: { [k: string]: number };
        flag: true | false;
        payload: any;
      };
    `);
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      true,
    );
  });

  it("returns false when union members differ or have different order", () => {
    const a = parse('type Status = "active" | "inactive";');
    const b = parse('type Status = "inactive" | "active";');
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      false,
    );
  });
});
