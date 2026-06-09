import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type {
  CodeSlice,
  Example,
  JsonValue,
  Schema,
  SchemaField,
  Template,
  TemplateFile,
  TypeDeclaration,
  TypeRef,
} from "./types.js";
import { validateTemplateFile } from "./validator.js";

const line = {
  lineNumber: 0,
  startPos: 0,
  text: "",
  indent: "",
};

function slice(text: string): CodeSlice {
  return {
    text,
    startPos: 0,
    endPos: text.length,
    line,
  };
}

function typeName(name: string): TypeRef {
  return {
    kind: "type-name",
    name: slice(name),
  };
}

function stringLiteral(value: string): TypeRef {
  return {
    kind: "string-literal",
    value,
    quoted_name: slice(JSON.stringify(value)),
  };
}

function union(...members: Array<TypeRef>): TypeRef {
  return {
    kind: "union",
    members: members as TypeRef["kind"] extends "union"
      ? never
      : Array<
          Extract<TypeRef, { kind: "string-literal" | "inline-interface" }>
        >,
  } as TypeRef;
}

function field(name: string, type: TypeRef, optional = false): SchemaField {
  return {
    name: slice(name),
    optional,
    type,
  };
}

function inlineInterface(fields: readonly SchemaField[]): TypeRef {
  const record: Record<string, SchemaField> = {};
  let firstField: SchemaField | undefined;
  for (const f of fields) {
    record[f.name.text] = f;
    if (!firstField) {
      firstField = f;
    }
  }
  return {
    kind: "inline-interface",
    fields: record,
    firstField,
  };
}

function typeDecl(name: string, valueType: TypeRef): TypeDeclaration {
  return {
    kind: "type",
    name: slice(name),
    valueType,
  };
}

function interfaceDecl(
  name: string,
  fields: readonly SchemaField[],
): TypeDeclaration {
  const record: Record<string, SchemaField> = {};
  let firstField: SchemaField | undefined;
  for (const f of fields) {
    record[f.name.text] = f;
    if (!firstField) {
      firstField = f;
    }
  }
  return {
    kind: "interface",
    name: slice(name),
    fields: record,
    firstField,
  };
}

function templateWithTypes(
  name: string,
  types: Record<string, TypeDeclaration>,
): Template {
  return {
    name: slice(name),
    variantName: null,
    pieces: [],
    parameters: new Set(),
    schema: { types } satisfies Schema,
    examples: [] as readonly Example[],
  };
}

function jsonString(value: string): JsonValue {
  return {
    kind: "string",
    codeSlice: slice(JSON.stringify(value)),
    value,
  };
}

function jsonBoolean(value: boolean): JsonValue {
  return {
    kind: "boolean",
    codeSlice: slice(String(value)),
    value,
  };
}

function jsonObject(entries: Array<[string, JsonValue]>): JsonValue {
  return {
    kind: "object",
    codeSlice: slice("{}"),
    entries: entries.map(([key, value]) => ({
      key: {
        kind: "string",
        codeSlice: slice(JSON.stringify(key)),
        value: key,
      },
      value,
    })),
  };
}

function jsonEllipsis(): JsonValue {
  return {
    kind: "ellipsis",
    codeSlice: slice("..."),
  };
}

describe("validateTemplateFile", () => {
  it("ignores templates without schema", () => {
    const templateFile: TemplateFile = {
      templates: [
        {
          name: slice("NoSchema"),
          variantName: null,
          pieces: [],
          parameters: new Set(),
          schema: null,
          examples: [],
        },
      ],
    };

    expect(validateTemplateFile(templateFile)).toMatch([]);
  });

  it("requires Response type", () => {
    const templateFile: TemplateFile = {
      templates: [
        templateWithTypes("MissingResponse", {
          A: typeDecl("A", stringLiteral("x")),
        }),
      ],
    };

    expect(validateTemplateFile(templateFile).map((e) => e.message)).toMatch([
      "Template 'MissingResponse': missing required type 'Response'",
    ]);
  });

  it("reports unknown named type references", () => {
    const templateFile: TemplateFile = {
      templates: [
        templateWithTypes("UnknownRef", {
          Response: typeDecl("Response", typeName("Missing")),
        }),
      ],
    };

    expect(validateTemplateFile(templateFile).map((e) => e.message)).toMatch([
      "Template 'UnknownRef': unknown type reference 'Missing'",
    ]);
  });

  it("reports types not reachable from Response", () => {
    const templateFile: TemplateFile = {
      templates: [
        templateWithTypes("Reachability", {
          Response: typeDecl("Response", typeName("A")),
          A: typeDecl("A", stringLiteral("ok")),
          Unused: typeDecl("Unused", stringLiteral("nope")),
        }),
      ],
    };

    expect(validateTemplateFile(templateFile).map((e) => e.message)).toMatch([
      "Template 'Reachability': type 'Unused' is not reachable from 'Response'",
    ]);
  });

  it("rejects duplicate string literals in unions", () => {
    const templateFile: TemplateFile = {
      templates: [
        templateWithTypes("DupUnion", {
          Response: typeDecl(
            "Response",
            union(stringLiteral("foo"), stringLiteral("foo")),
          ),
        }),
      ],
    };

    expect(validateTemplateFile(templateFile).map((e) => e.message)).toMatch([
      "Template 'DupUnion': union has duplicate string literal 'foo'",
    ]);
  });

  it("rejects interface-union members with invalid first discriminator field", () => {
    const templateFile: TemplateFile = {
      templates: [
        templateWithTypes("BadDiscriminator", {
          Response: typeDecl(
            "Response",
            union(
              inlineInterface([field("kind", typeName("Tag"))]),
              inlineInterface([field("kind", stringLiteral("ok"))]),
            ),
          ),
          Tag: typeDecl("Tag", stringLiteral("tag")),
        }),
      ],
    };

    expect(validateTemplateFile(templateFile).map((e) => e.message)).toMatch([
      "Template 'BadDiscriminator': union interface member must have firstField of type string literal or union of string literals",
    ]);
  });

  it("rejects overlapping discriminator strings across interface members", () => {
    const templateFile: TemplateFile = {
      templates: [
        templateWithTypes("Overlap", {
          Response: typeDecl(
            "Response",
            union(
              inlineInterface([field("kind", stringLiteral("foo"))]),
              inlineInterface([
                field(
                  "kind",
                  union(stringLiteral("bar"), stringLiteral("foo")),
                ),
              ]),
            ),
          ),
        }),
      ],
    };

    expect(validateTemplateFile(templateFile).map((e) => e.message)).toMatch([
      "Template 'Overlap': union interface discriminator values overlap on 'foo'",
    ]);
  });

  it("accepts a valid response-linked graph with valid unions", () => {
    const payload = typeDecl(
      "Payload",
      union(
        stringLiteral("foo"),
        stringLiteral("bar"),
        inlineInterface([field("kind", stringLiteral("foo"))]),
        inlineInterface([
          field("kind", union(stringLiteral("bar"), stringLiteral("zoo"))),
          field("flag", stringLiteral("ok")),
        ]),
      ),
    );

    const templateFile: TemplateFile = {
      templates: [
        templateWithTypes("Valid", {
          Response: typeDecl("Response", typeName("Payload")),
          Payload: payload,
        }),
      ],
    };

    expect(validateTemplateFile(templateFile)).toMatch([]);
  });

  it("validates examples against Response type", () => {
    const template: Template = {
      ...templateWithTypes("ExampleMatch", {
        Response: typeDecl(
          "Response",
          inlineInterface([
            field("kind", stringLiteral("ok")),
            field("status", stringLiteral("green")),
          ]),
        ),
      }),
      examples: [
        {
          codeSlice: slice("e1"),
          value: jsonObject([
            ["kind", jsonString("ok")],
            ["status", jsonString("green")],
          ]),
        },
      ],
    };

    expect(validateTemplateFile({ templates: [template] })).toMatch([]);
  });

  it("reports examples that do not match Response", () => {
    const template: Template = {
      ...templateWithTypes("ExampleMismatch", {
        Response: typeDecl(
          "Response",
          inlineInterface([field("kind", stringLiteral("ok"))]),
        ),
      }),
      examples: [
        {
          codeSlice: slice("bad"),
          value: jsonObject([["kind", jsonString("not-ok")]]),
        },
      ],
    };

    expect(
      validateTemplateFile({ templates: [template] }).map((e) => e.message),
    ).toMatch([
      "Template 'ExampleMismatch': example #1 does not match type 'Response'",
    ]);
  });

  it("treats ellipsis as matching any type", () => {
    const template: Template = {
      ...templateWithTypes("ExampleEllipsis", {
        Response: typeDecl(
          "Response",
          inlineInterface([
            field("kind", stringLiteral("ok")),
            field(
              "payload",
              inlineInterface([field("flag", stringLiteral("x"))]),
            ),
            field("ready", stringLiteral("yes")),
          ]),
        ),
      }),
      examples: [
        {
          codeSlice: slice("ellipsis"),
          value: jsonObject([
            ["kind", jsonString("ok")],
            ["payload", jsonEllipsis()],
            ["ready", jsonEllipsis()],
          ]),
        },
      ],
    };

    expect(validateTemplateFile({ templates: [template] })).toMatch([]);
  });

  it("rejects unexpected object keys in examples", () => {
    const template: Template = {
      ...templateWithTypes("ExampleExtraKey", {
        Response: typeDecl(
          "Response",
          inlineInterface([field("kind", stringLiteral("ok"))]),
        ),
      }),
      examples: [
        {
          codeSlice: slice("extra"),
          value: jsonObject([
            ["kind", jsonString("ok")],
            ["other", jsonBoolean(true)],
          ]),
        },
      ],
    };

    expect(
      validateTemplateFile({ templates: [template] }).map((e) => e.message),
    ).toMatch([
      "Template 'ExampleExtraKey': example #1 does not match type 'Response'",
    ]);
  });

  it("accepts recursive Response examples", () => {
    const template: Template = {
      ...templateWithTypes("RecursiveOk", {
        Response: interfaceDecl("Response", [
          field("kind", stringLiteral("node")),
          field("next", typeName("Response"), true),
        ]),
      }),
      examples: [
        {
          codeSlice: slice("rec-ok"),
          value: jsonObject([
            ["kind", jsonString("node")],
            [
              "next",
              jsonObject([
                ["kind", jsonString("node")],
                ["next", jsonObject([["kind", jsonString("node")]])],
              ]),
            ],
          ]),
        },
      ],
    };

    expect(validateTemplateFile({ templates: [template] })).toMatch([]);
  });

  it("rejects invalid nested values in recursive Response examples", () => {
    const template: Template = {
      ...templateWithTypes("RecursiveBad", {
        Response: interfaceDecl("Response", [
          field("kind", stringLiteral("node")),
          field("next", typeName("Response"), true),
        ]),
      }),
      examples: [
        {
          codeSlice: slice("rec-bad"),
          value: jsonObject([
            ["kind", jsonString("node")],
            ["next", jsonObject([["kind", jsonString("wrong")]])],
          ]),
        },
      ],
    };

    expect(
      validateTemplateFile({ templates: [template] }).map((e) => e.message),
    ).toMatch([
      "Template 'RecursiveBad': example #1 does not match type 'Response'",
    ]);
  });

  it("does not loop forever on direct self-referential aliases", () => {
    const template: Template = {
      ...templateWithTypes("SelfAlias", {
        Response: typeDecl("Response", typeName("Response")),
      }),
      examples: [
        {
          codeSlice: slice("self"),
          value: jsonString("anything"),
        },
      ],
    };

    expect(
      validateTemplateFile({ templates: [template] }).map((e) => e.message),
    ).toMatch([
      "Template 'SelfAlias': example #1 does not match type 'Response'",
    ]);
  });
});
