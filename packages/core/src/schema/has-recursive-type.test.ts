import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { MappedText } from "../util/shared-types.js";
import { hasRecursiveType } from "./has-recursive-type.js";
import { parseSchema } from "./schema-parser.js";
import type { Schema } from "./schema-types.js";
import { validateSchema } from "./schema-validator.js";

function textNode(source: string, path = "schema.ts"): MappedText {
  return {
    path,
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
}

function compileNamespace(source: string, path = "schema.ts"): Schema {
  const parsed = parseSchema(textNode(source, path), "namespace");
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
  path = "template-schema.ts",
): Schema {
  const ns = compileNamespace(namespaceSource);
  const parsed = parseSchema(textNode(templateSource, path), "template");
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

describe("hasRecursiveType", () => {
  it("returns false for primitive types and string unions", () => {
    const schema = compileNamespace(`
      type MyString = string;
      type MyInt = integer;
      type Color = "red" | "green" | "blue";
    `);

    expect(hasRecursiveType(schema, "MyString")).toBe(false);
    expect(hasRecursiveType(schema, "MyInt")).toBe(false);
    expect(hasRecursiveType(schema, "Color")).toBe(false);
  });

  it("returns false for non-recursive interfaces and non-recursive unions", () => {
    const schema = compileNamespace(`
      type Address = {
        street: string;
        city: string;
      };
      type Person = {
        name: string;
        address: Address;
        tags: string[];
      };
      type Shape =
        | { kind: "circle"; radius: number }
        | { kind: "rect"; width: number; height: number };
    `);

    expect(hasRecursiveType(schema, "Address")).toBe(false);
    expect(hasRecursiveType(schema, "Person")).toBe(false);
    expect(hasRecursiveType(schema, "Shape")).toBe(false);
  });

  it("returns true when typeName is a recursive discriminated union", () => {
    const schema = compileNamespace(`
      type Tree =
        | { kind: "leaf"; value: number }
        | { kind: "node"; left: Tree; right: Tree };
    `);

    expect(hasRecursiveType(schema, "Tree")).toBe(true);
  });

  it("returns true when typeName is an interface containing a recursive type", () => {
    const schema = compileNamespace(`
      type Tree =
        | { kind: "leaf"; value: number }
        | { kind: "node"; left: Tree; right: Tree };
      type Container = {
        title: string;
        tree: Tree;
      };
    `);

    expect(hasRecursiveType(schema, "Container")).toBe(true);
  });

  it("returns true when recursive type is nested inside arrays or optionals", () => {
    const schema = compileNamespace(`
      type Tree =
        | { kind: "leaf"; value: number }
        | { kind: "node"; left: Tree; right: Tree };
      type Forest = {
        trees: Tree[];
      };
      type OptionalTree = {
        tree?: Tree;
      };
    `);

    expect(hasRecursiveType(schema, "Forest")).toBe(true);
    expect(hasRecursiveType(schema, "OptionalTree")).toBe(true);
  });

  it("returns true when a non-recursive union contains a recursive type in a variant", () => {
    const schema = compileNamespace(`
      type Tree =
        | { kind: "leaf"; value: number }
        | { kind: "node"; left: Tree; right: Tree };
      type Action =
        | { kind: "noop" }
        | { kind: "insert"; tree: Tree };
    `);

    expect(hasRecursiveType(schema, "Action")).toBe(true);
  });

  it("returns true through type alias chains", () => {
    const schema = compileNamespace(`
      type Tree =
        | { kind: "leaf"; value: number }
        | { kind: "node"; left: Tree; right: Tree };
      type AliasA = Tree;
      type AliasB = AliasA;
      type Wrapper = {
        root: AliasB;
      };
    `);

    expect(hasRecursiveType(schema, "AliasA")).toBe(true);
    expect(hasRecursiveType(schema, "AliasB")).toBe(true);
    expect(hasRecursiveType(schema, "Wrapper")).toBe(true);
  });

  it("returns true for boolean-discriminated recursive unions", () => {
    const schema = compileNamespace(`
      type LinkedList =
        | { isEnd: true }
        | { isEnd: false; value: number; next: LinkedList };
    `);

    expect(hasRecursiveType(schema, "LinkedList")).toBe(true);
  });

  it("returns true for mutually recursive helper types", () => {
    const schema = compileNamespace(`
      type Node =
        | { kind: "leaf"; val: string }
        | { kind: "branch"; children: NodeList };
      type NodeList = {
        items: Node[];
      };
    `);

    expect(hasRecursiveType(schema, "Node")).toBe(true);
    expect(hasRecursiveType(schema, "NodeList")).toBe(true);
  });

  it("returns true for shared recursive types in template schema", () => {
    const nsSource = `
      type Tree =
        | { kind: "leaf"; value: number }
        | { kind: "node"; left: Tree; right: Tree };
    `;
    const templateSource = `
      type Input = {
        root: shared.Tree;
      };
      type Output = string;
    `;
    const schema = compileTemplate(templateSource, nsSource);

    expect(hasRecursiveType(schema, "Input")).toBe(true);
    expect(hasRecursiveType(schema, "Output")).toBe(false);
  });

  it("distinguishes same type name in typeDeclarations and sharedDeclarations", () => {
    const nsSource = `
      type Tree =
        | { kind: "leaf"; value: number }
        | { kind: "node"; left: Tree; right: Tree };
    `;
    const templateSource = `
      type Tree = {
        root: shared.Tree;
      };
      type Input = Tree;
      type Output = {
        name: string;
      };
    `;
    const schema = compileTemplate(templateSource, nsSource);

    // Local Tree references shared.Tree (which is recursive)
    expect(hasRecursiveType(schema, "Tree")).toBe(true);
    expect(hasRecursiveType(schema, "Input")).toBe(true);
    expect(hasRecursiveType(schema, "Output")).toBe(false);
  });
});
