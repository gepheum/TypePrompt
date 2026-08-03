import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { EMPTY_SCHEMA } from "./empty-schema.js";
import type {
  Array,
  Interface,
  Schema,
  SchemaView,
  SharedTypeName,
  StringLiteral,
  SyntheticArray,
  SyntheticInterface,
  Type,
  TypeDeclaration,
  TypeName,
  Union,
} from "./schema-types.js";
import {
  isPrimitiveType,
  resolveMaybeInvalidType,
  resolveType,
} from "./type-resolver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeName(text: string): TypeName {
  return { kind: "type-name", name: { text, start: 0, end: 0 } };
}

function sharedTypeName(text: string): SharedTypeName {
  return {
    kind: "shared-type-name",
    shared: { start: 0, end: 0 },
    name: { text, start: 0, end: 0 },
  };
}

function typeDecl(name: string, valueType: Type): TypeDeclaration {
  return {
    kind: "type",
    name: { text: name, start: 0, end: 0 },
    valueType,
    doc: "",
  };
}

const INTERFACE: Interface = {
  kind: "interface",
  leftCurlyBracket: { start: 0, end: 1 },
  fields: {},
};

const STRING_LITERAL: StringLiteral = {
  kind: "string-literal",
  value: "active",
  quotedName: { text: '"active"', start: 0, end: 8 },
};

const INACTIVE_LITERAL: StringLiteral = {
  kind: "string-literal",
  value: "inactive",
  quotedName: { text: '"inactive"', start: 10, end: 20 },
};

const ARRAY: Array = {
  kind: "array",
  elementType: typeName("string"),
};

const UNION: Union = {
  kind: "union",
  members: [STRING_LITERAL, INACTIVE_LITERAL],
};

// ---------------------------------------------------------------------------
// isPrimitiveType
// ---------------------------------------------------------------------------

describe("isPrimitiveType", () => {
  it("returns 'string' for 'string'", () => {
    expect(isPrimitiveType("string")).toMatch("string");
  });

  it("returns 'number' for 'number'", () => {
    expect(isPrimitiveType("number")).toMatch("number");
  });

  it("returns 'boolean' for 'boolean'", () => {
    expect(isPrimitiveType("boolean")).toMatch("boolean");
  });

  it("returns 'integer' for 'integer'", () => {
    expect(isPrimitiveType("integer")).toMatch("integer");
  });

  it("returns null for an unknown name", () => {
    expect(isPrimitiveType("unknown")).toMatch(null);
  });

  it("returns null for an empty string", () => {
    expect(isPrimitiveType("")).toMatch(null);
  });

  it("returns null for a name that partially matches a primitive", () => {
    expect(isPrimitiveType("strings")).toMatch(null);
  });
});

// ---------------------------------------------------------------------------
// resolveType – pass-through types
// ---------------------------------------------------------------------------

describe("resolveType – pass-through types", () => {
  it("passes a string-literal through unchanged", () => {
    expect(resolveType(STRING_LITERAL, EMPTY_SCHEMA)).toMatch({
      kind: "string-literal",
      value: "active",
    });
  });

  it("passes an interface through unchanged", () => {
    expect(resolveType(INTERFACE, EMPTY_SCHEMA)).toMatch({ kind: "interface" });
  });

  it("passes an array through unchanged", () => {
    expect(resolveType(ARRAY, EMPTY_SCHEMA)).toMatch({ kind: "array" });
  });

  it("passes a union through unchanged", () => {
    expect(resolveType(UNION, EMPTY_SCHEMA)).toMatch({ kind: "union" });
  });

  it("passes a synthetic interface through unchanged", () => {
    const synthetic: SyntheticInterface = {
      kind: "synthetic-interface",
      name: { text: "Foo" },
      fields: {},
    };
    expect(resolveType(synthetic, EMPTY_SCHEMA)).toMatch({
      kind: "synthetic-interface",
      name: { text: "Foo" },
    });
  });

  it("passes a synthetic array through unchanged", () => {
    const synthetic: SyntheticArray = {
      kind: "synthetic-array",
      elementType: {
        kind: "synthetic-interface",
        name: { text: "Item" },
        fields: {},
      },
    };
    expect(resolveType(synthetic, EMPTY_SCHEMA)).toMatch({
      kind: "synthetic-array",
    });
  });
});

// ---------------------------------------------------------------------------
// resolveType – type-name resolution
// ---------------------------------------------------------------------------

describe("resolveType – type-name resolution", () => {
  it("resolves 'string' to a primitive", () => {
    expect(resolveType(typeName("string"), EMPTY_SCHEMA)).toMatch({
      kind: "primitive",
      primitive: "string",
    });
  });

  it("resolves 'number' to a primitive", () => {
    expect(resolveType(typeName("number"), EMPTY_SCHEMA)).toMatch({
      kind: "primitive",
      primitive: "number",
    });
  });

  it("resolves 'boolean' to a primitive", () => {
    expect(resolveType(typeName("boolean"), EMPTY_SCHEMA)).toMatch({
      kind: "primitive",
      primitive: "boolean",
    });
  });

  it("resolves 'integer' to a primitive", () => {
    expect(resolveType(typeName("integer"), EMPTY_SCHEMA)).toMatch({
      kind: "primitive",
      primitive: "integer",
    });
  });

  it("resolves a type-name to its local declaration", () => {
    const schema: Schema = {
      ...EMPTY_SCHEMA,
      typeDeclarations: { Profile: typeDecl("Profile", INTERFACE) },
    };
    expect(resolveType(typeName("Profile"), schema)).toMatch({
      kind: "interface",
    });
  });

  it("follows a chain of type-name aliases to the final resolved type", () => {
    const schema: Schema = {
      ...EMPTY_SCHEMA,
      typeDeclarations: {
        Alias: typeDecl("Alias", typeName("string")),
      },
    };
    expect(resolveType(typeName("Alias"), schema)).toMatch({
      kind: "primitive",
      primitive: "string",
    });
  });

  it("unwraps a TypeDeclaration and resolves its valueType", () => {
    expect(resolveType(typeDecl("Profile", INTERFACE), EMPTY_SCHEMA)).toMatch({
      kind: "interface",
    });
  });

  it("unwraps a TypeDeclaration whose valueType is a primitive type-name", () => {
    expect(
      resolveType(typeDecl("MyString", typeName("string")), EMPTY_SCHEMA),
    ).toMatch({ kind: "primitive", primitive: "string" });
  });
});

// ---------------------------------------------------------------------------
// resolveType – shared-type-name resolution
// ---------------------------------------------------------------------------

describe("resolveType – shared-type-name resolution", () => {
  it("resolves a shared-type-name via sharedDeclarations", () => {
    const schema: Schema = {
      ...EMPTY_SCHEMA,
      sharedDeclarations: { Profile: typeDecl("Profile", INTERFACE) },
    };
    expect(resolveType(sharedTypeName("Profile"), schema)).toMatch({
      kind: "interface",
    });
  });

  it("resolves a shared type that is itself an alias to a primitive", () => {
    const schema: Schema = {
      ...EMPTY_SCHEMA,
      sharedDeclarations: {
        Id: typeDecl("Id", typeName("string")),
      },
    };
    expect(resolveType(sharedTypeName("Id"), schema)).toMatch({
      kind: "primitive",
      primitive: "string",
    });
  });
});

// ---------------------------------------------------------------------------
// resolveMaybeInvalidType – null cases
// ---------------------------------------------------------------------------

describe("resolveMaybeInvalidType – null cases", () => {
  it("returns null for an unknown type-name", () => {
    expect(resolveMaybeInvalidType(typeName("Unknown"), EMPTY_SCHEMA)).toMatch(
      null,
    );
  });

  it("returns null for a direct circular reference", () => {
    const view: SchemaView = {
      typeDeclarations: { Loop: typeDecl("Loop", typeName("Loop")) },
      sharedDeclarations: {},
    };
    expect(resolveMaybeInvalidType(typeName("Loop"), view)).toMatch(null);
  });

  it("returns null for an indirect circular reference", () => {
    const view: SchemaView = {
      typeDeclarations: {
        A: typeDecl("A", typeName("B")),
        B: typeDecl("B", typeName("A")),
      },
      sharedDeclarations: {},
    };
    expect(resolveMaybeInvalidType(typeName("A"), view)).toMatch(null);
  });

  it("returns null for a shared-type-name when sharedDeclarations is null", () => {
    expect(
      resolveMaybeInvalidType(sharedTypeName("Profile"), EMPTY_SCHEMA),
    ).toMatch(null);
  });

  it("returns null for a shared-type-name not present in sharedDeclarations", () => {
    const view: SchemaView = {
      typeDeclarations: {},
      sharedDeclarations: {},
    };
    expect(resolveMaybeInvalidType(sharedTypeName("Missing"), view)).toMatch(
      null,
    );
  });
});

// ---------------------------------------------------------------------------
// resolveMaybeInvalidType – valid resolution
// ---------------------------------------------------------------------------

describe("resolveMaybeInvalidType – valid resolution", () => {
  it("resolves a primitive type-name", () => {
    expect(resolveMaybeInvalidType(typeName("string"), EMPTY_SCHEMA)).toMatch({
      kind: "primitive",
      primitive: "string",
    });
  });

  it("resolves a type-name to its local declaration", () => {
    const view: SchemaView = {
      typeDeclarations: { Profile: typeDecl("Profile", INTERFACE) },
      sharedDeclarations: {},
    };
    expect(resolveMaybeInvalidType(typeName("Profile"), view)).toMatch({
      kind: "interface",
    });
  });

  it("resolves a valid shared-type-name via sharedDeclarations", () => {
    const view: SchemaView = {
      typeDeclarations: {},
      sharedDeclarations: { Profile: typeDecl("Profile", INTERFACE) },
    };
    expect(resolveMaybeInvalidType(sharedTypeName("Profile"), view)).toMatch({
      kind: "interface",
    });
  });

  it("passes a string-literal through unchanged", () => {
    expect(resolveMaybeInvalidType(STRING_LITERAL, EMPTY_SCHEMA)).toMatch({
      kind: "string-literal",
      value: "active",
    });
  });

  it("passes an interface through unchanged", () => {
    expect(resolveMaybeInvalidType(INTERFACE, EMPTY_SCHEMA)).toMatch({
      kind: "interface",
    });
  });

  it("passes an array through unchanged", () => {
    expect(resolveMaybeInvalidType(ARRAY, EMPTY_SCHEMA)).toMatch({
      kind: "array",
    });
  });

  it("does not detect a cycle across separate resolveMaybeInvalidType calls", () => {
    // Each call gets its own seenNames set, so two separate calls for A and B
    // individually return null (cycle detected), but resolving a non-cyclic
    // type still succeeds.
    const view: SchemaView = {
      typeDeclarations: {
        A: typeDecl("A", typeName("B")),
        B: typeDecl("B", INTERFACE),
      },
      sharedDeclarations: {},
    };
    expect(resolveMaybeInvalidType(typeName("A"), view)).toMatch({
      kind: "interface",
    });
    // The seenNames from the first call does not bleed into the second.
    expect(resolveMaybeInvalidType(typeName("B"), view)).toMatch({
      kind: "interface",
    });
  });
});
