import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { mergeParseResults } from "./parse-result-merger.js";
import { parseTemplateFile } from "./template-parser.js";
import type {
  TemplateFileParseResult,
  TemplateParseError,
  Templates,
} from "./template-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCHEMA_ELEM = `<schema>interface Response { value: string; }</schema>`;
const BODY_ELEM = `<body>Hello</body>`;

function templateSource(
  name: string,
  opts: { namespace?: string; meta?: string } = {},
): string {
  const nsAttr =
    opts.namespace !== undefined ? ` namespace="${opts.namespace}"` : "";
  const lines = [`<template name="${name}"${nsAttr}>`];
  if (opts.meta !== undefined) {
    lines.push(`  <meta ${opts.meta}/>`);
  }
  lines.push(`  ${SCHEMA_ELEM}`, `  ${BODY_ELEM}`, `</template>`);
  return lines.join("\n");
}

function parseFile(
  path: string,
  ...sources: string[]
): TemplateFileParseResult {
  const result = parseTemplateFile({ path, content: sources.join("\n") });
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed at '${path}':\n${result.errors.map((e) => `  ${e.message}`).join("\n")}`,
    );
  }
  return result;
}

function mergeOk(...files: TemplateFileParseResult[]): Templates {
  const result = mergeParseResults(files);
  if (result.kind !== "success") {
    throw new Error(
      `Expected success but got errors:\n${result.errors.map((e) => `  ${e.message}`).join("\n")}`,
    );
  }
  return result;
}

function mergeErr(
  ...files: TemplateFileParseResult[]
): readonly TemplateParseError[] {
  const result = mergeParseResults(files);
  if (result.kind !== "error") {
    throw new Error("Expected errors but got success");
  }
  return result.errors;
}

// ---------------------------------------------------------------------------
// (1) Namespace ambiguity
// ---------------------------------------------------------------------------

describe("mergeParseResults – namespace ambiguity", () => {
  it("succeeds with distinct namespaces across files", () => {
    const a = parseFile("a.prompts", templateSource("Alpha", { namespace: "Foo" }));
    const b = parseFile("b.prompts", templateSource("Beta", { namespace: "Bar" }));
    const result = mergeOk(a, b);
    expect(
      result.namespaces.map((n) => n.namespace).sort(),
    ).toMatch(["Bar", "Foo"]);
  });

  it("succeeds when the same namespace appears in multiple files", () => {
    const a = parseFile("a.prompts", templateSource("Alpha", { namespace: "Foo" }));
    const b = parseFile("b.prompts", templateSource("Beta", { namespace: "Foo" }));
    const result = mergeOk(a, b);
    expect(result.namespaces).toMatch([{ namespace: "Foo" }]);
  });

  it("succeeds when no template specifies a namespace", () => {
    const a = parseFile("a.prompts", templateSource("Alpha"));
    const b = parseFile("b.prompts", templateSource("Beta"));
    const result = mergeOk(a, b);
    expect(result.namespaces).toMatch([{ namespace: "Default" }]);
  });

  it("reports an error for a case-insensitive namespace conflict", () => {
    const a = parseFile("a.prompts", templateSource("Alpha", { namespace: "Foo" }));
    const b = parseFile("b.prompts", templateSource("Beta", { namespace: "FoO" }));
    const errors = mergeErr(a, b);
    expect(errors).toMatch([{ message: "Name 'FoO' conflicts with 'Foo'" }]);
  });
});

// ---------------------------------------------------------------------------
// (2) Template name ambiguity within a namespace
// ---------------------------------------------------------------------------

describe("mergeParseResults – template name ambiguity", () => {
  it("succeeds with distinct names within the same namespace", () => {
    const a = parseFile(
      "a.prompts",
      templateSource("Alpha"),
      templateSource("Beta"),
    );
    mergeOk(a);
  });

  it("succeeds when the same name is used in different namespaces", () => {
    const a = parseFile("a.prompts", templateSource("Alpha", { namespace: "Foo" }));
    const b = parseFile("b.prompts", templateSource("Alpha", { namespace: "Bar" }));
    mergeOk(a, b);
  });

  it("reports two errors for an exact duplicate name within a namespace", () => {
    const a = parseFile("a.prompts", templateSource("Alpha"));
    const b = parseFile("b.prompts", templateSource("Alpha"));
    const errors = mergeErr(a, b);
    expect(errors).toMatch([
      { message: "Name 'Alpha' is duplicated" },
      { message: "Name 'Alpha' is duplicated" },
    ]);
  });

  it("reports one error for a case-insensitive name conflict within a namespace", () => {
    const a = parseFile("a.prompts", templateSource("Alpha"));
    const b = parseFile("b.prompts", templateSource("ALPHA"));
    const errors = mergeErr(a, b);
    expect(errors).toMatch([{ message: "Name 'ALPHA' conflicts with 'Alpha'" }]);
  });
});

// ---------------------------------------------------------------------------
// (3) At most one top-level meta
// ---------------------------------------------------------------------------

describe("mergeParseResults – top-level meta count", () => {
  const META_SOURCE = `<meta>\ninterface Meta { label: string; }\n</meta>`;

  it("succeeds with no top-level meta", () => {
    const a = parseFile("a.prompts", templateSource("Alpha"));
    const result = mergeOk(a);
    expect(result.meta).toMatch(null);
  });

  it("succeeds with exactly one top-level meta", () => {
    const a = parseFile("a.prompts", META_SOURCE, templateSource("Alpha"));
    const result = mergeOk(a);
    expect(result.meta).toMatch({ kind: "success" });
  });

  it("reports an error when multiple files each have a top-level meta", () => {
    const a = parseFile("a.prompts", META_SOURCE, templateSource("Alpha"));
    const b = parseFile("b.prompts", META_SOURCE, templateSource("Beta"));
    const errors = mergeErr(a, b);
    expect(errors).toMatch([
      {
        message:
          "Multiple top-level meta schemas found; at most one is allowed across all files",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// (4) Template <meta/> node without a top-level meta schema
// ---------------------------------------------------------------------------

describe("mergeParseResults – metaNode without top-level meta", () => {
  it("reports an error when a template has <meta/> but there is no top-level meta schema", () => {
    const a = parseFile(
      "a.prompts",
      templateSource("Alpha", { meta: 'label="x"' }),
    );
    const errors = mergeErr(a);
    expect(errors).toMatch([
      {
        message:
          "Template 'Alpha' has a <meta/> element but there is no top-level meta schema",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// (5) Meta attribute validation
// ---------------------------------------------------------------------------

describe("mergeParseResults – meta attribute validation", () => {
  // Schema covering all primitive variants and a union.
  // `Int` is the conventional alias for the integer primitive.
  const META_SOURCE = [
    "<meta>",
    "type Int = number;",
    "interface Meta {",
    "  label: string;",
    "  note?: string;",
    "  active: boolean;",
    "  score: number;",
    "  rank: Int;",
    '  kind: "a" | "b";',
    "}",
    "</meta>",
  ].join("\n");

  const VALID_META = `label="hello" active="true" score="3.14" rank="7" kind="a"`;

  it("succeeds when all required fields are present and valid", () => {
    const a = parseFile(
      "a.prompts",
      META_SOURCE,
      templateSource("Alpha", { meta: VALID_META }),
    );
    mergeOk(a);
  });

  it("succeeds when an optional field is absent", () => {
    // note is optional; omitting it should not cause an error.
    const a = parseFile(
      "a.prompts",
      META_SOURCE,
      templateSource("Alpha", { meta: VALID_META }),
    );
    mergeOk(a);
  });

  it("reports an error for an unexpected meta attribute", () => {
    const a = parseFile(
      "a.prompts",
      META_SOURCE,
      templateSource("Alpha", { meta: `${VALID_META} extra="x"` }),
    );
    const errors = mergeErr(a);
    expect(errors).toMatch([
      { message: "Template 'Alpha': unexpected meta attribute 'extra'" },
    ]);
  });

  it("reports an error for a missing required meta attribute", () => {
    // Omit 'label' which is required.
    const a = parseFile(
      "a.prompts",
      META_SOURCE,
      templateSource("Alpha", {
        meta: `active="true" score="1" rank="2" kind="a"`,
      }),
    );
    const errors = mergeErr(a);
    expect(errors).toMatch([
      { message: "Template 'Alpha': missing required meta attribute 'label'" },
    ]);
  });

  it("reports an error for an invalid boolean value", () => {
    const a = parseFile(
      "a.prompts",
      META_SOURCE,
      templateSource("Alpha", {
        meta: `label="x" active="yes" score="1" rank="2" kind="a"`,
      }),
    );
    const errors = mergeErr(a);
    expect(errors).toMatch([
      {
        message:
          "Template 'Alpha': meta attribute 'active' must be 'true' or 'false'",
      },
    ]);
  });

  it("reports an error for an invalid number value", () => {
    const a = parseFile(
      "a.prompts",
      META_SOURCE,
      templateSource("Alpha", {
        meta: `label="x" active="true" score="abc" rank="2" kind="a"`,
      }),
    );
    const errors = mergeErr(a);
    expect(errors).toMatch([
      {
        message: "Template 'Alpha': meta attribute 'score' must be a number",
      },
    ]);
  });

  it("reports an error for a non-integer int value", () => {
    const a = parseFile(
      "a.prompts",
      META_SOURCE,
      templateSource("Alpha", {
        meta: `label="x" active="true" score="1" rank="2.5" kind="a"`,
      }),
    );
    const errors = mergeErr(a);
    expect(errors).toMatch([
      {
        message:
          "Template 'Alpha': meta attribute 'rank' must be an integer",
      },
    ]);
  });

  it("reports an error for a value outside a string-literal union", () => {
    const a = parseFile(
      "a.prompts",
      META_SOURCE,
      templateSource("Alpha", {
        meta: `label="x" active="true" score="1" rank="2" kind="c"`,
      }),
    );
    const errors = mergeErr(a);
    expect(errors).toMatch([
      {
        message:
          "Template 'Alpha': meta attribute 'kind' must be one of 'a', 'b'",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Success result structure
// ---------------------------------------------------------------------------

describe("mergeParseResults – success result structure", () => {
  it("groups templates by namespace", () => {
    const a = parseFile(
      "a.prompts",
      templateSource("Alpha", { namespace: "Foo" }),
      templateSource("Beta"),
    );
    const b = parseFile(
      "b.prompts",
      templateSource("Gamma", { namespace: "Foo" }),
    );
    const result = mergeOk(a, b);

    const fooNs = result.namespaces.find((n) => n.namespace === "Foo");
    expect(
      fooNs!.templates.map((t) => t.template.name).sort(),
    ).toMatch(["Alpha", "Gamma"]);

    const defaultNs = result.namespaces.find((n) => n.namespace === "Default");
    expect(defaultNs!.templates.map((t) => t.template.name)).toMatch(["Beta"]);
  });

  it("coerces meta attribute values to their declared types", () => {
    const META_SOURCE = [
      "<meta>",
      "type Int = number;",
      "interface Meta { flag: boolean; score: number; rank: Int; }",
      "</meta>",
    ].join("\n");
    const a = parseFile(
      "a.prompts",
      META_SOURCE,
      templateSource("Alpha", { meta: `flag="true" score="3.14" rank="7"` }),
    );
    const result = mergeOk(a);
    const resolved = result.namespaces[0]!.templates[0]!;
    expect(resolved.meta).toMatch({ flag: true, score: 3.14, rank: 7 });
  });

  it("produces an empty meta object for a template with no <meta/> element", () => {
    const META_SOURCE = `<meta>\ninterface Meta { label?: string; }\n</meta>`;
    const a = parseFile("a.prompts", META_SOURCE, templateSource("Alpha"));
    const result = mergeOk(a);
    expect(result.namespaces[0]!.templates[0]!.meta).toMatch({});
  });
});
