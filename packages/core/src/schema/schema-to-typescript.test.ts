import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { MappedText } from "../util/shared-types.js";
import { parseSchema } from "./schema-parser.js";
import { schemaToTypeScript } from "./schema-to-typescript.js";
import type { Schema } from "./schema-types.js";
import { validateSchema } from "./schema-validator.js";

function textNode(source: string): MappedText {
  return {
    path: "schema.ts",
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

function compile(
  source: string,
  context: "namespace" | "internal" = "internal",
): Schema {
  const parsed = parseSchema(textNode(source), context);
  if (parsed.kind !== "success") {
    throw new Error(
      `Parse failed: ${parsed.errors.map((e) => e.message).join(", ")}`,
    );
  }
  const validated = validateSchema(parsed, null);
  if (validated.kind !== "success") {
    throw new Error(
      `Validation failed: ${validated.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return validated;
}

function compileTemplate(
  templateSource: string,
  namespaceSource: string,
): Schema {
  const ns = compile(namespaceSource, "namespace");
  const parsed = parseSchema(textNode(templateSource), "template");
  if (parsed.kind !== "success") {
    throw new Error(
      `Parse failed: ${parsed.errors.map((e) => e.message).join(", ")}`,
    );
  }
  const validated = validateSchema(parsed, ns);
  if (validated.kind !== "success") {
    throw new Error(
      `Validation failed: ${validated.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return validated;
}

function gen(source: string, typeName = "Output"): string {
  return schemaToTypeScript(typeName, compile(source));
}

function lines(...l: string[]): string {
  return l.join("\n");
}

describe("schemaToTypeScript", () => {
  it("renders an interface with primitive fields", () => {
    expect(gen("interface Output { s: string; n: number; b: boolean; }")).toBe(
      lines(
        "interface Output {",
        "  s: string",
        "  n: number",
        "  b: boolean",
        "}",
      ),
    );
  });

  it("renders a type alias to an object as an interface", () => {
    expect(gen("type Output = { s: string; };")).toBe(
      lines("interface Output {", "  s: string", "}"),
    );
  });

  it("renders non-object root types as type aliases", () => {
    expect(gen("type Output = string;")).toBe("type Output = string");
    expect(gen("type Output = string[];")).toBe("type Output = string[]");
  });

  it("renders optional fields with '?'", () => {
    expect(gen("interface Output { note?: string; }")).toBe(
      lines("interface Output {", "  note?: string", "}"),
    );
  });

  it("renders literals, any, and records", () => {
    expect(
      gen(
        [
          "interface Output {",
          '  version: "v1";',
          "  ok: true;",
          "  payload: any;",
          "  scores: { [name: string]: number };",
          "}",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        '  version: "v1"',
        "  ok: true",
        "  payload: any",
        "  scores: { [name: string]: number }",
        "}",
      ),
    );
  });

  it("renders a record of inline interfaces", () => {
    expect(
      gen("interface Output { byId: { [id: string]: { n: number } }; }"),
    ).toBe(
      lines(
        "interface Output {",
        "  byId: { [id: string]: {",
        "    n: number",
        "  } }",
        "}",
      ),
    );
  });

  it("renders nested inline interfaces with 2-space indentation", () => {
    expect(gen("interface Output { a: { b: { c: string; }; }; }")).toBe(
      lines(
        "interface Output {",
        "  a: {",
        "    b: {",
        "      c: string",
        "    }",
        "  }",
        "}",
      ),
    );
  });

  it("renders arrays", () => {
    expect(
      gen("interface Output { tags: string[]; points: { x: number; }[]; }"),
    ).toBe(
      lines(
        "interface Output {",
        "  tags: string[]",
        "  points: {",
        "    x: number",
        "  }[]",
        "}",
      ),
    );
  });

  it("renders short string unions on one line", () => {
    expect(gen('interface Output { color: "red" | "green"; }')).toBe(
      lines("interface Output {", '  color: "red" | "green"', "}"),
    );
  });

  it("renders string unions on one line even when long", () => {
    expect(
      gen(
        [
          "interface Output {",
          '  status: "draftStatus" | "inReviewStatus" | "approvedStatus" | "rejectedStatus" | "archivedStatus";',
          "}",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        '  status: "draftStatus" | "inReviewStatus" | "approvedStatus" | "rejectedStatus" | "archivedStatus"',
        "}",
      ),
    );
  });

  it("renders discriminated unions over multiple lines", () => {
    expect(
      gen(
        [
          "interface Output { shape: Shape; }",
          "type Shape =",
          '  | { kind: "circle"; r: number; }',
          '  | { kind: "square"; side: number; };',
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  shape: Shape",
        "}",
        "type Shape =",
        "  | {",
        '      kind: "circle"',
        "      r: number",
        "    }",
        "  | {",
        '      kind: "square"',
        "      side: number",
        "    }",
      ),
    );
  });

  it("parenthesizes union array elements", () => {
    expect(gen('interface Output { colors: ("red" | "green")[]; }')).toBe(
      lines("interface Output {", '  colors: ("red" | "green")[]', "}"),
    );
    expect(
      gen('interface Output { items: ({ kind: "a"; } | { kind: "b"; })[]; }'),
    ).toBe(
      lines(
        "interface Output {",
        "  items: (",
        "    | {",
        '        kind: "a"',
        "      }",
        "    | {",
        '        kind: "b"',
        "      }",
        "  )[]",
        "}",
      ),
    );
  });

  it("renders doc comments on types and fields", () => {
    expect(
      gen(
        [
          "/** The answer. */",
          "interface Output {",
          "  /**",
          "   * First line.",
          "   * Second line.",
          "   */",
          "  title: string;",
          "}",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "/** The answer. */",
        "interface Output {",
        "  /**",
        "   * First line.",
        "   * Second line.",
        "   */",
        "  title: string",
        "}",
      ),
    );
  });

  it("renders referenced types after the root, in order of first reference", () => {
    expect(
      gen(
        [
          "type B = { c: C; };",
          "type C = { n: number; };",
          "type A = { s: string; };",
          "interface Output { a: A; b: B; again: A; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  a: A",
        "  b: B",
        "  again: A",
        "}",
        "interface A {",
        "  s: string",
        "}",
        "interface B {",
        "  c: C",
        "}",
        "interface C {",
        "  n: number",
        "}",
      ),
    );
  });

  it("renders referenced types depth-first", () => {
    expect(
      gen(
        [
          "interface B { b: number; }",
          "interface C { d: number; }",
          "interface A { c: C; }",
          "interface Foo { a: A; b: B; }",
        ].join("\n"),
        "Foo",
      ),
    ).toBe(
      lines(
        "interface Foo {",
        "  a: A",
        "  b: B",
        "}",
        "interface A {",
        "  c: C",
        "}",
        "interface C {",
        "  d: number",
        "}",
        "interface B {",
        "  b: number",
        "}",
      ),
    );
  });

  it("renders a type referenced from several places only where first referenced", () => {
    expect(
      gen(
        [
          "interface Output { a: A; b: B; }",
          "interface A { shared: S; }",
          "interface B { shared: S; }",
          "interface S { n: number; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  a: A",
        "  b: B",
        "}",
        "interface A {",
        "  shared: S",
        "}",
        "interface S {",
        "  n: number",
        "}",
        "interface B {",
        "  shared: S",
        "}",
      ),
    );
  });

  it("omits types that are not referenced", () => {
    expect(
      gen("type Unused = { x: number; };\ninterface Output { s: string; }"),
    ).toBe(lines("interface Output {", "  s: string", "}"));
  });

  it("renders recursive types once", () => {
    expect(
      gen(
        [
          "interface Output { root: TreeNode; }",
          "type TreeNode =",
          '  | { kind: "leaf"; }',
          '  | { kind: "branch"; children: TreeNode[]; };',
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  root: TreeNode",
        "}",
        "type TreeNode =",
        "  | {",
        '      kind: "leaf"',
        "    }",
        "  | {",
        '      kind: "branch"',
        "      children: TreeNode[]",
        "    }",
      ),
    );
  });

  it("appends an integer type alias when integer is used", () => {
    expect(gen("interface Output { count: integer; }")).toBe(
      lines(
        "interface Output {",
        "  count: integer",
        "}",
        "/** A 32-bit integer. */",
        "type integer = number",
      ),
    );
  });

  it('prefixes shared types with "_" only if colliding with local declarations', () => {
    const schema = compileTemplate(
      [
        "type Input = string;",
        "type Profile = { id: number; };",
        "interface Output { owner: shared.Profile; local: Profile; }",
      ].join("\n"),
      [
        "/** A user profile. */",
        "type Profile = { name: string; address: Address; };",
        "type Address = { city: string; };",
      ].join("\n"),
    );
    expect(schemaToTypeScript("Output", schema)).toBe(
      lines(
        "interface Output {",
        "  owner: _Profile",
        "  local: Profile",
        "}",
        "/** A user profile. */",
        "interface _Profile {",
        "  name: string",
        "  address: Address",
        "}",
        "interface Address {",
        "  city: string",
        "}",
        "interface Profile {",
        "  id: number",
        "}",
      ),
    );
  });

  it("renders an empty interface", () => {
    expect(gen("interface Output {}")).toBe(lines("interface Output {", "}"));
  });

  it("renders multi-dimensional arrays and arrays of named types", () => {
    expect(
      gen(
        [
          "interface Output { matrix: number[][]; items: Item[]; }",
          "interface Item { id: string; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  matrix: number[][]",
        "  items: Item[]",
        "}",
        "interface Item {",
        "  id: string",
        "}",
      ),
    );
  });

  it("renders array of array of unions with correct parentheses", () => {
    expect(gen('interface Output { grid: ("a" | "b")[][]; }')).toBe(
      lines("interface Output {", '  grid: ("a" | "b")[][]', "}"),
    );
  });

  it("renders mutually recursive types through discriminated union without infinite loop", () => {
    expect(
      gen(
        [
          "interface Output { root: Folder; }",
          "interface Folder { name: string; items: Item[]; }",
          "type Item =",
          '  | { kind: "file"; size: number; }',
          '  | { kind: "folder"; folder: Folder; };',
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  root: Folder",
        "}",
        "interface Folder {",
        "  name: string",
        "  items: Item[]",
        "}",
        "type Item =",
        "  | {",
        '      kind: "file"',
        "      size: number",
        "    }",
        "  | {",
        '      kind: "folder"',
        "      folder: Folder",
        "    }",
      ),
    );
  });

  it("renders type alias chains", () => {
    expect(
      gen(
        [
          "type Output = Middle;",
          "type Middle = Target;",
          "interface Target { value: string; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "type Output = Middle",
        "type Middle = Target",
        "interface Target {",
        "  value: string",
        "}",
      ),
    );
  });

  it("renders named union variants referencing sub-types depth-first", () => {
    expect(
      gen(
        [
          "type Output = EventA | EventB;",
          'interface EventA { kind: "a"; payload: PayloadA; }',
          "interface PayloadA { a: number; }",
          'interface EventB { kind: "b"; payload: PayloadB; }',
          "interface PayloadB { b: string; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "type Output = EventA | EventB",
        "interface EventA {",
        '  kind: "a"',
        "  payload: PayloadA",
        "}",
        "interface PayloadA {",
        "  a: number",
        "}",
        "interface EventB {",
        '  kind: "b"',
        "  payload: PayloadB",
        "}",
        "interface PayloadB {",
        "  b: string",
        "}",
      ),
    );
  });

  it("appends integer type alias when integer is used in a referenced type", () => {
    expect(
      gen(
        [
          "interface Output { item: Item; }",
          "interface Item { count: integer; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  item: Item",
        "}",
        "interface Item {",
        "  count: integer",
        "}",
        "/** A 32-bit integer. */",
        "type integer = number",
      ),
    );
  });

  it("does not append integer alias when only number is used", () => {
    expect(gen("interface Output { count: number; }")).toBe(
      lines("interface Output {", "  count: number", "}"),
    );
  });

  it("escapes closing comment delimiter inside doc comments", () => {
    const schema = compile("interface Output { value: string; }");
    (schema.typeDeclarations["Output"] as { doc?: string }).doc =
      "Matches */ pattern";
    expect(schemaToTypeScript("Output", schema)).toBe(
      lines(
        "/** Matches *\\/ pattern */",
        "interface Output {",
        "  value: string",
        "}",
      ),
    );
  });

  it("renders multi-line doc comments with blank lines properly formatted", () => {
    expect(
      gen(
        [
          "/**",
          " * Paragraph one.",
          " *",
          " * Paragraph two.",
          " */",
          "interface Output { title: string; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "/**",
        " * Paragraph one.",
        " *",
        " * Paragraph two.",
        " */",
        "interface Output {",
        "  title: string",
        "}",
      ),
    );
  });

  it("prefixes transitively referenced shared type with _ if it collides with a local type", () => {
    const schema = compileTemplate(
      [
        "type Input = string;",
        "interface Address { zip: string; }",
        "interface Output { user: shared.User; localAddr: Address; }",
      ].join("\n"),
      [
        "interface User { name: string; address: Address; }",
        "interface Address { city: string; }",
      ].join("\n"),
    );
    expect(schemaToTypeScript("Output", schema)).toBe(
      lines(
        "interface Output {",
        "  user: User",
        "  localAddr: Address",
        "}",
        "interface User {",
        "  name: string",
        "  address: _Address",
        "}",
        "interface _Address {",
        "  city: string",
        "}",
        "interface Address {",
        "  zip: string",
        "}",
      ),
    );
  });

  it("emits non-colliding shared type only once when referenced multiple times", () => {
    const schema = compileTemplate(
      [
        "type Input = string;",
        "interface Output { a: shared.Contact; b: shared.Contact; }",
      ].join("\n"),
      ["interface Contact { email: string; }"].join("\n"),
    );
    expect(schemaToTypeScript("Output", schema)).toBe(
      lines(
        "interface Output {",
        "  a: Contact",
        "  b: Contact",
        "}",
        "interface Contact {",
        "  email: string",
        "}",
      ),
    );
  });

  it("renders records with complex values", () => {
    expect(
      gen(
        [
          "interface Output {",
          "  nested: { [k: string]: { [inner: string]: boolean } };",
          "  items: { [id: string]: Item[] };",
          "}",
          "interface Item { name: string; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  nested: { [k: string]: { [inner: string]: boolean } }",
        "  items: { [id: string]: Item[] }",
        "}",
        "interface Item {",
        "  name: string",
        "}",
      ),
    );
  });

  it("renders optional fields with inline interfaces", () => {
    expect(
      gen(
        "interface Output { config?: { timeout: number; debug: boolean; }; }",
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  config?: {",
        "    timeout: number",
        "    debug: boolean",
        "  }",
        "}",
      ),
    );
  });

  it("renders boolean and string literal fields", () => {
    expect(
      gen(
        [
          "interface Output {",
          '  kind: "point";',
          "  active: true;",
          "  archived: false;",
          "}",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        '  kind: "point"',
        "  active: true",
        "  archived: false",
        "}",
      ),
    );
  });

  it("handles multiple shared types where only a subset collides with local types", () => {
    const schema = compileTemplate(
      [
        "type Input = string;",
        "interface A { id: number; }",
        "interface Output { a: shared.A; b: shared.B; c: shared.C; localA: A; }",
      ].join("\n"),
      [
        "interface A { name: string; }",
        "interface B { score: number; }",
        "interface C { flag: boolean; }",
      ].join("\n"),
    );
    expect(schemaToTypeScript("Output", schema)).toBe(
      lines(
        "interface Output {",
        "  a: _A",
        "  b: B",
        "  c: C",
        "  localA: A",
        "}",
        "interface _A {",
        "  name: string",
        "}",
        "interface B {",
        "  score: number",
        "}",
        "interface C {",
        "  flag: boolean",
        "}",
        "interface A {",
        "  id: number",
        "}",
      ),
    );
  });

  it("renders doc comments on type aliases", () => {
    expect(
      gen(["/** A list of tags. */", "type Output = string[];"].join("\n")),
    ).toBe(lines("/** A list of tags. */", "type Output = string[]"));
  });

  it("renders doc comments on fields of discriminated union variants", () => {
    expect(
      gen(
        [
          "type Output =",
          "  | {",
          '      kind: "success";',
          "      /** Result count. */",
          "      count: number;",
          "    }",
          '  | { kind: "error"; message: string; };',
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "type Output =",
        "  | {",
        '      kind: "success"',
        "      /** Result count. */",
        "      count: number",
        "    }",
        "  | {",
        '      kind: "error"',
        "      message: string",
        "    }",
      ),
    );
  });

  it("renders string unions inside record values and optional fields", () => {
    expect(
      gen(
        [
          "interface Output {",
          '  status?: "pending" | "done";',
          '  lookup: { [key: string]: "active" | "inactive" };',
          "}",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        '  status?: "pending" | "done"',
        '  lookup: { [key: string]: "active" | "inactive" }',
        "}",
      ),
    );
  });

  it("renders an empty interface", () => {
    expect(gen("interface Output {}")).toBe(lines("interface Output {", "}"));
  });

  it("renders multi-dimensional arrays and arrays of named types", () => {
    expect(
      gen(
        [
          "interface Output { matrix: number[][]; items: Item[]; }",
          "interface Item { id: string; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  matrix: number[][]",
        "  items: Item[]",
        "}",
        "interface Item {",
        "  id: string",
        "}",
      ),
    );
  });

  it("renders array of array of unions with correct parentheses", () => {
    expect(gen('interface Output { grid: ("a" | "b")[][]; }')).toBe(
      lines("interface Output {", '  grid: ("a" | "b")[][]', "}"),
    );
  });

  it("renders mutually recursive types through discriminated union without infinite loop", () => {
    expect(
      gen(
        [
          "interface Output { root: Folder; }",
          "interface Folder { name: string; items: Item[]; }",
          "type Item =",
          '  | { kind: "file"; size: number; }',
          '  | { kind: "folder"; folder: Folder; };',
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  root: Folder",
        "}",
        "interface Folder {",
        "  name: string",
        "  items: Item[]",
        "}",
        "type Item =",
        "  | {",
        '      kind: "file"',
        "      size: number",
        "    }",
        "  | {",
        '      kind: "folder"',
        "      folder: Folder",
        "    }",
      ),
    );
  });

  it("renders type alias chains", () => {
    expect(
      gen(
        [
          "type Output = Middle;",
          "type Middle = Target;",
          "interface Target { value: string; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "type Output = Middle",
        "type Middle = Target",
        "interface Target {",
        "  value: string",
        "}",
      ),
    );
  });

  it("renders named union variants referencing sub-types depth-first", () => {
    expect(
      gen(
        [
          "type Output = EventA | EventB;",
          'interface EventA { kind: "a"; payload: PayloadA; }',
          "interface PayloadA { a: number; }",
          'interface EventB { kind: "b"; payload: PayloadB; }',
          "interface PayloadB { b: string; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "type Output = EventA | EventB",
        "interface EventA {",
        '  kind: "a"',
        "  payload: PayloadA",
        "}",
        "interface PayloadA {",
        "  a: number",
        "}",
        "interface EventB {",
        '  kind: "b"',
        "  payload: PayloadB",
        "}",
        "interface PayloadB {",
        "  b: string",
        "}",
      ),
    );
  });

  it("appends integer type alias when integer is used in a referenced type", () => {
    expect(
      gen(
        [
          "interface Output { item: Item; }",
          "interface Item { count: integer; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  item: Item",
        "}",
        "interface Item {",
        "  count: integer",
        "}",
        "/** A 32-bit integer. */",
        "type integer = number",
      ),
    );
  });

  it("does not append integer alias when only number is used", () => {
    expect(gen("interface Output { count: number; }")).toBe(
      lines("interface Output {", "  count: number", "}"),
    );
  });

  it("escapes closing comment delimiter inside doc comments", () => {
    const schema = compile("interface Output { value: string; }");
    (schema.typeDeclarations["Output"] as { doc?: string }).doc =
      "Matches */ pattern";
    expect(schemaToTypeScript("Output", schema)).toBe(
      lines(
        "/** Matches *\\/ pattern */",
        "interface Output {",
        "  value: string",
        "}",
      ),
    );
  });

  it("renders multi-line doc comments with blank lines properly formatted", () => {
    expect(
      gen(
        [
          "/**",
          " * Paragraph one.",
          " *",
          " * Paragraph two.",
          " */",
          "interface Output { title: string; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "/**",
        " * Paragraph one.",
        " *",
        " * Paragraph two.",
        " */",
        "interface Output {",
        "  title: string",
        "}",
      ),
    );
  });

  it("prefixes transitively referenced shared type with _ if it collides with a local type", () => {
    const schema = compileTemplate(
      [
        "type Input = string;",
        "interface Address { zip: string; }",
        "interface Output { user: shared.User; localAddr: Address; }",
      ].join("\n"),
      [
        "interface User { name: string; address: Address; }",
        "interface Address { city: string; }",
      ].join("\n"),
    );
    expect(schemaToTypeScript("Output", schema)).toBe(
      lines(
        "interface Output {",
        "  user: User",
        "  localAddr: Address",
        "}",
        "interface User {",
        "  name: string",
        "  address: _Address",
        "}",
        "interface _Address {",
        "  city: string",
        "}",
        "interface Address {",
        "  zip: string",
        "}",
      ),
    );
  });

  it("emits non-colliding shared type only once when referenced multiple times", () => {
    const schema = compileTemplate(
      [
        "type Input = string;",
        "interface Output { a: shared.Contact; b: shared.Contact; }",
      ].join("\n"),
      ["interface Contact { email: string; }"].join("\n"),
    );
    expect(schemaToTypeScript("Output", schema)).toBe(
      lines(
        "interface Output {",
        "  a: Contact",
        "  b: Contact",
        "}",
        "interface Contact {",
        "  email: string",
        "}",
      ),
    );
  });

  it("renders records with complex values", () => {
    expect(
      gen(
        [
          "interface Output {",
          "  nested: { [k: string]: { [inner: string]: boolean } };",
          "  items: { [id: string]: Item[] };",
          "}",
          "interface Item { name: string; }",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  nested: { [k: string]: { [inner: string]: boolean } }",
        "  items: { [id: string]: Item[] }",
        "}",
        "interface Item {",
        "  name: string",
        "}",
      ),
    );
  });

  it("renders optional fields with inline interfaces", () => {
    expect(
      gen(
        "interface Output { config?: { timeout: number; debug: boolean; }; }",
      ),
    ).toBe(
      lines(
        "interface Output {",
        "  config?: {",
        "    timeout: number",
        "    debug: boolean",
        "  }",
        "}",
      ),
    );
  });

  it("renders boolean and string literal fields", () => {
    expect(
      gen(
        [
          "interface Output {",
          '  kind: "point";',
          "  active: true;",
          "  archived: false;",
          "}",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        '  kind: "point"',
        "  active: true",
        "  archived: false",
        "}",
      ),
    );
  });

  it("handles multiple shared types where only a subset collides with local types", () => {
    const schema = compileTemplate(
      [
        "type Input = string;",
        "interface A { id: number; }",
        "interface Output { a: shared.A; b: shared.B; c: shared.C; localA: A; }",
      ].join("\n"),
      [
        "interface A { name: string; }",
        "interface B { score: number; }",
        "interface C { flag: boolean; }",
      ].join("\n"),
    );
    expect(schemaToTypeScript("Output", schema)).toBe(
      lines(
        "interface Output {",
        "  a: _A",
        "  b: B",
        "  c: C",
        "  localA: A",
        "}",
        "interface _A {",
        "  name: string",
        "}",
        "interface B {",
        "  score: number",
        "}",
        "interface C {",
        "  flag: boolean",
        "}",
        "interface A {",
        "  id: number",
        "}",
      ),
    );
  });

  it("renders doc comments on type aliases", () => {
    expect(
      gen(["/** A list of tags. */", "type Output = string[];"].join("\n")),
    ).toBe(lines("/** A list of tags. */", "type Output = string[]"));
  });

  it("renders doc comments on fields of discriminated union variants", () => {
    expect(
      gen(
        [
          "type Output =",
          "  | {",
          '      kind: "success";',
          "      /** Result count. */",
          "      count: number;",
          "    }",
          '  | { kind: "error"; message: string; };',
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "type Output =",
        "  | {",
        '      kind: "success"',
        "      /** Result count. */",
        "      count: number",
        "    }",
        "  | {",
        '      kind: "error"',
        "      message: string",
        "    }",
      ),
    );
  });

  it("renders string unions inside record values and optional fields", () => {
    expect(
      gen(
        [
          "interface Output {",
          '  status?: "pending" | "done";',
          '  lookup: { [key: string]: "active" | "inactive" };',
          "}",
        ].join("\n"),
      ),
    ).toBe(
      lines(
        "interface Output {",
        '  status?: "pending" | "done"',
        '  lookup: { [key: string]: "active" | "inactive" }',
        "}",
      ),
    );
  });
});
