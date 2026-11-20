import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { MappedText } from "../util/shared-types.js";
import { makeExampleValue } from "./example-maker.js";
import { parseSchema } from "./schema-parser.js";
import type { Schema, SchemaType, SchemaView } from "./schema-types.js";

function parse(source: string, sharedSource?: string): SchemaView {
  const node: MappedText = {
    path: "test.ts",
    text: source,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  };
  const result = parseSchema(node, "template");
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }

  let sharedDeclarations = {};
  if (sharedSource) {
    const sharedNode: MappedText = {
      path: "shared.ts",
      text: sharedSource,
      offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
    };
    const sharedResult = parseSchema(sharedNode, "namespace");
    if (sharedResult.kind !== "success") {
      throw new Error(
        `Shared parse failed: ${sharedResult.errors.map((e) => e.message).join(", ")}`,
      );
    }
    sharedDeclarations = sharedResult.typeDeclarations;
  }

  return {
    typeDeclarations: result.typeDeclarations,
    sharedDeclarations,
  };
}

function toSchemaType(schema: SchemaView, typeName = "Input"): SchemaType {
  const decl =
    schema.typeDeclarations[typeName] ?? schema.sharedDeclarations?.[typeName];
  if (!decl) {
    throw new Error(`Type '${typeName}' not found in schema`);
  }
  return {
    type: decl.valueType,
    schema: schema as Schema,
  };
}

describe("example-maker", () => {
  it("initializes primitives with default values", () => {
    const schema = parse(`
      type Input = {
        s: string;
        n: number;
        i: integer;
        b: boolean;
      };
    `);
    const example = makeExampleValue(toSchemaType(schema));
    expect(example).toMatch({
      s: "",
      n: 0,
      i: 0,
      b: false,
    });
  });

  it("initializes literals with their exact values", () => {
    const schema = parse(`
      type Input = {
        kind: "create";
        enabled: true;
      };
    `);
    const example = makeExampleValue(toSchemaType(schema));
    expect(example).toMatch({
      kind: "create",
      enabled: true,
    });
  });

  it("initializes all interface fields including optional fields", () => {
    const schema = parse(`
      type Input = {
        requiredStr: string;
        optionalStr?: string;
        optionalNum?: number;
        optionalBool?: boolean;
        nested?: {
          innerReq: string;
          innerOpt?: number;
        };
      };
    `);
    const example = makeExampleValue(toSchemaType(schema));
    expect(example).toMatch({
      requiredStr: "",
      optionalStr: "",
      optionalNum: 0,
      optionalBool: false,
      nested: {
        innerReq: "",
        innerOpt: 0,
      },
    });
  });

  it("creates an array of size 1 for arrays", () => {
    const schema = parse(`
      type Input = {
        strings: string[];
        numbers: number[];
        nestedArrays: string[][];
        objects: {
          id: integer;
          name: string;
        }[];
      };
    `);
    const example = makeExampleValue(toSchemaType(schema));
    expect(example).toMatch({
      strings: [""],
      numbers: [0],
      nestedArrays: [[""]],
      objects: [
        {
          id: 0,
          name: "",
        },
      ],
    });
  });

  it("takes the first type in a union", () => {
    const schema = parse(`
      type LiteralUnion = "apple" | "banana" | "cherry";
      type ComplexUnion = { type: "user"; username: string } | { type: "admin" };

      type Input = {
        fruit: LiteralUnion;
        role: ComplexUnion;
      };
    `);
    const example = makeExampleValue(toSchemaType(schema));
    expect(example).toMatch({
      fruit: "apple",
      role: {
        type: "user",
        username: "",
      },
    });
  });

  it("resolves shared type declarations", () => {
    const schema = parse(
      `
      type Input = {
        address: shared.SharedAddress;
      };
      `,
      `
      type SharedAddress = {
        street: string;
        zip?: integer;
      };
      `,
    );
    const example = makeExampleValue(toSchemaType(schema));
    expect(example).toMatch({
      address: {
        street: "",
        zip: 0,
      },
    });
  });
});
