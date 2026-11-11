import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { MappedText } from "../util/shared-types.js";
import { hashSchema, schemasAreEquivalent } from "./schema-equivalence.js";
import { parseSchema } from "./schema-parser.js";
import type { SchemaView } from "./schema-types.js";

function parse(source: string): SchemaView {
  const node: MappedText = {
    path: "test.ts",
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const result = parseSchema(node, "namespace");
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

  it("returns false when omitDefault differs on a field", () => {
    const a = parse("type Foo = {\n  /// @omitDefault\n  name: string;\n};");
    const b = parse("type Foo = { name: string; };");
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      false,
    );
  });

  it("returns true when both schemas have omitDefault on the same field", () => {
    const a = parse("type Foo = {\n  /// @omitDefault\n  name: string;\n};");
    const b = parse("type Foo = {\n  /// @omitDefault\n  name: string;\n};");
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      true,
    );
  });

  it("returns true for different type docs", () => {
    const a = parse("/** Doc A */ type Foo = { name: string; };");
    const b = parse("/** Doc B */ type Foo = { name: string; };");
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      true,
    );
  });

  it("returns true for different field docs", () => {
    const a = parse("type Foo = { /** Field doc A */ name: string; };");
    const b = parse("type Foo = { /** Field doc B */ name: string; };");
    expect(schemasAreEquivalent(a.typeDeclarations, b.typeDeclarations)).toBe(
      true,
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

describe("hashSchema", () => {
  it("returns 0 for empty schema", () => {
    expect(hashSchema({})).toBe(0);
  });

  it("computes exact hash for simple primitive schema", () => {
    const schema = parse("type Foo = { name: string; age?: integer; };");
    expect(hashSchema(schema.typeDeclarations)).toBe(
      hashSchema(
        parse("type Foo = { name: string; age?: integer; };").typeDeclarations,
      ),
    );
  });

  it("computes identical hashes despite differing doc comments", () => {
    const a = parse(
      "/** Doc A */ type Foo = { /** Field A */ name: string; };",
    );
    const b = parse(
      "/** Doc B */ type Foo = { /** Field B */ name: string; };",
    );
    expect(hashSchema(a.typeDeclarations)).toBe(hashSchema(b.typeDeclarations));
  });

  it("computes exact hash codes matching snapshot expectations", () => {
    const schema1 = parse("type Foo = { name: string; age?: integer; };");
    const schema2 = parse('type Status = "active" | "inactive";');
    const schema3 = parse(`
      type Status = "active" | "inactive";
      type Container = {
        tags: string[];
        counts: { [k: string]: number };
        flag: true | false;
        payload: any;
      };
    `);
    const schema4 = parse(`
      type A = { b: B; };
      type B = { id: string; };
    `);

    // Exact hash values computed by the deterministic hash algorithm
    expect(hashSchema(schema1.typeDeclarations)).toBe(1952263366);
    expect(hashSchema(schema2.typeDeclarations)).toBe(403624084);
    expect(hashSchema(schema3.typeDeclarations)).toBe(-993373756);
    expect(hashSchema(schema4.typeDeclarations)).toBe(-1724151258);
  });

  it("produces different hashes when type structure or field order changes", () => {
    const a = parse("type Foo = { a: string; b: number; };");
    const b = parse("type Foo = { b: number; a: string; };");
    const c = parse("type Bar = { a: string; b: number; };");

    expect(
      hashSchema(a.typeDeclarations) === hashSchema(b.typeDeclarations),
    ).toBe(false);
    expect(
      hashSchema(a.typeDeclarations) === hashSchema(c.typeDeclarations),
    ).toBe(false);
  });

  it("produces different hashes when omitDefault is set on a field", () => {
    const a = parse("type Foo = {\n  /// @omitDefault\n  name: string;\n};");
    const b = parse("type Foo = { name: string; };");
    expect(
      hashSchema(a.typeDeclarations) === hashSchema(b.typeDeclarations),
    ).toBe(false);
  });
});
