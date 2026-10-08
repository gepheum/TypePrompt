import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { compile } from "./compiler.js";

// ---------------------------------------------------------------------------
// compile - basic compilation & empty results
// ---------------------------------------------------------------------------

describe("compile - basic compilation and empty results", () => {
  it("compiles an empty project with no files", () => {
    const result = compile({}, { cache: null });

    expect(result).toMatch({
      anyErrors: false,
      metaSchema: { kind: "success" },
      namespaces: {},
      singleNamespace: null,
      templates: {},
      tools: {},
      sourceFiles: {},
      finalErrors: {},
      warnings: {},
      pathToDefinitionLinks: {},
    });
  });

  it("compiles a single valid template in the default namespace", () => {
    const result = compile(
      {
        "prompts/Translate.xml": `
          <template name="Translate">
            <schema>
              type Input = { text: string; };
              type Output = string;
            </schema>
            <system>Translate</system>
            <user><insert val="input.text"/></user>
          </template>
        `,
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: false,
      singleNamespace: {
        name: "Main",
      },
      templates: {
        "Main:Translate": {
          kind: "template",
        },
      },
      tools: {},
      signature: "22bd47ff",
      finalErrors: {
        "prompts/Translate.xml": [],
      },
      pathToDefinitionLinks: {
        "prompts/Translate.xml": [
          {
            reference: { path: "prompts/Translate.xml" },
            definition: { text: "text" },
          },
        ],
      },
    });
  });

  it("compiles a multi-file project with meta, namespace, tools, and templates", () => {
    const result = compile(
      {
        "prompts/meta.xml": `
          <meta>
            type Meta = {
              temperature: number;
            };
          </meta>
        `,
        "prompts/Legal/shared.xml": `
          <namespace name="Legal">
            type Document = {
              title: string;
            };
          </namespace>
        `,
        "prompts/Legal/lookupClause.xml": `
          <tool name="lookupClause" namespace="Legal">
            <description>Looks up clause by <c>clauseId</c></description>
            <schema>
              type Input = { clauseId: string; };
              type Output = { clauseText: string; };
            </schema>
          </tool>
        `,
        "prompts/Legal/ReviewContract.xml": `
          <template name="ReviewContract" namespace="Legal">
            <schema>
              type Input = { doc: shared.Document; };
              type Output = string;
            </schema>
            <tools>
              - tool: lookupClause
            </tools>
            <meta>
              temperature: 0.2
            </meta>
            <system>Legal reviewer with <c>lookupClause</c></system>
            <user>Review: <insert val="input.doc.title"/></user>
          </template>
        `,
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: false,
      singleNamespace: null,
      metaSchema: { kind: "success" },
      namespaces: {
        Legal: {
          name: "Legal",
          schema: { kind: "success" },
        },
      },
      tools: {
        "Legal:lookupClause": {
          kind: "tool",
        },
      },
      templates: {
        "Legal:ReviewContract": {
          kind: "template",
          tools: {
            lookupClause: {
              tool: {
                kind: "tool",
              },
            },
          },
        },
      },
      signature: "c931c0ec",
      finalErrors: {
        "prompts/meta.xml": [],
        "prompts/Legal/shared.xml": [],
        "prompts/Legal/lookupClause.xml": [],
        "prompts/Legal/ReviewContract.xml": [],
      },
    });
  });
});

// ---------------------------------------------------------------------------
// compile - parse and top-level XML errors
// ---------------------------------------------------------------------------

describe("compile - parse and top-level XML errors", () => {
  it("reports parse errors for malformed XML in a source file", () => {
    const result = compile(
      {
        "prompts/Broken.xml": "<template name='Broken'",
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Broken.xml": [
          {
            message: "Unclosed tag '<template>'",
          },
        ],
      },
    });
  });

  it("reports an error for unexpected top-level XML elements", () => {
    const result = compile(
      {
        "prompts/Invalid.xml": "<unknownTag>content</unknownTag>",
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Invalid.xml": [
          {
            message: "Unexpected element <unknownTag> at the top level",
          },
        ],
      },
    });
  });

  it("reports an error when top-level content contains plain text", () => {
    const result = compile(
      {
        "prompts/Invalid.xml": "not xml content",
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Invalid.xml": [
          {
            message: "Unexpected text node at top level",
          },
          {
            message: "No root element found",
          },
        ],
      },
    });
  });
});

// ---------------------------------------------------------------------------
// compile - meta schema resolution
// ---------------------------------------------------------------------------

describe("compile - meta schema resolution", () => {
  it("reports an error when multiple <meta> files are present in the project", () => {
    const result = compile(
      {
        "prompts/meta1.xml": "<meta>type Meta = { timeout: number; };</meta>",
        "prompts/meta2.xml": "<meta>type Meta = { debug: boolean; };</meta>",
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      metaSchema: { kind: "other-error" },
      finalErrors: {
        "prompts/meta1.xml": [
          {
            message: "Multiple <meta> elements found",
          },
        ],
        "prompts/meta2.xml": [
          {
            message: "Multiple <meta> elements found",
          },
        ],
      },
    });
  });

  it("reports schema errors when <meta> schema is invalid", () => {
    const result = compile(
      {
        "prompts/meta.xml": "<meta>type InvalidMeta = ;</meta>",
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/meta.xml": [
          {
            message:
              "Expected one of: '(', '{', '|', 'shared', string literal, identifier",
          },
        ],
      },
    });
  });
});

// ---------------------------------------------------------------------------
// compile - namespace resolution
// ---------------------------------------------------------------------------

describe("compile - namespace resolution", () => {
  it("reports an error when multiple namespace files share the exact same name", () => {
    const result = compile(
      {
        "prompts/Legal1/shared.xml": `
          <namespace name="Legal">
            type Doc = { title: string; };
          </namespace>
        `,
        "prompts/Legal2/shared.xml": `
          <namespace name="Legal">
            type Other = { id: string; };
          </namespace>
        `,
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      namespaces: {
        Legal: {
          name: "Legal",
          schema: { kind: "other-error" },
        },
      },
      finalErrors: {
        "prompts/Legal1/shared.xml": [
          {
            message: "Duplicate identifier 'Legal'",
          },
        ],
        "prompts/Legal2/shared.xml": [
          {
            message: "Duplicate identifier 'Legal'",
          },
        ],
      },
    });
  });

  it("reports a conflict error for case-insensitive namespace name collisions", () => {
    const result = compile(
      {
        "prompts/Legal/shared.xml": `
          <namespace name="Legal">
            type Doc = { title: string; };
          </namespace>
        `,
        "prompts/LEGAL/shared.xml": `
          <namespace name="LEGAL">
            type Other = { id: string; };
          </namespace>
        `,
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Legal/shared.xml": [],
        "prompts/LEGAL/shared.xml": [
          {
            message: "'LEGAL' and 'Legal' differ only by casing",
          },
        ],
      },
    });
  });

  it("reports an error when a template references a non-existent namespace", () => {
    const result = compile(
      {
        "prompts/Finance/shared.xml": `
          <namespace name="Finance">
            type Tx = { id: string; };
          </namespace>
        `,
        "prompts/Unknown/Doc.xml": `
          <template name="Doc" namespace="NonExistent">
            <schema>
              type Input = string;
              type Output = string;
            </schema>
            <system>Sys</system>
            <user>Usr</user>
          </template>
        `,
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Finance/shared.xml": [],
        "prompts/Unknown/Doc.xml": [
          {
            message: "Namespace 'NonExistent' not found",
            suggestions: ["Finance", "Main"],
          },
        ],
      },
    });
  });

  it("reports an error when a tool references a non-existent namespace", () => {
    const result = compile(
      {
        "prompts/Finance/shared.xml": `
          <namespace name="Finance">
            type Tx = { id: string; };
          </namespace>
        `,
        "prompts/Unknown/myTool.xml": `
          <tool name="myTool" namespace="NonExistent">
            <description>Tool description</description>
            <schema>
              type Input = string;
              type Output = string;
            </schema>
          </tool>
        `,
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Finance/shared.xml": [],
        "prompts/Unknown/myTool.xml": [
          {
            message: "Namespace 'NonExistent' not found",
            suggestions: ["Finance", "Main"],
          },
        ],
      },
    });
  });
});

// ---------------------------------------------------------------------------
// compile - name conflicts within namespaces
// ---------------------------------------------------------------------------

describe("compile - name conflicts within namespaces", () => {
  it("reports an error when two templates share the same name in the same namespace", () => {
    const result = compile(
      {
        "prompts/Translate1.xml": `
          <template name="Translate">
            <schema>type Input = string; type Output = string;</schema>
            <system>Sys 1</system>
            <user>Usr 1</user>
          </template>
        `,
        "prompts/Translate2.xml": `
          <template name="Translate">
            <schema>type Input = string; type Output = string;</schema>
            <system>Sys 2</system>
            <user>Usr 2</user>
          </template>
        `,
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Translate1.xml": [
          {
            message: "Duplicate identifier 'Translate'",
          },
        ],
        "prompts/Translate2.xml": [
          {
            message: "Duplicate identifier 'Translate'",
          },
        ],
      },
    });
  });

  it("reports an error when a template and a tool share the same name in the same namespace", () => {
    const result = compile(
      {
        "prompts/Search.xml": `
          <template name="Search">
            <schema>type Input = string; type Output = string;</schema>
            <system>Sys</system>
            <user>Usr</user>
          </template>
        `,
        "prompts/searchTool.xml": `
          <tool name="search">
            <description>Search tool</description>
            <schema>type Input = string; type Output = string;</schema>
          </tool>
        `,
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Search.xml": [
          {
            message: "'Search' and 'search' differ only by casing",
          },
        ],
        "prompts/searchTool.xml": [],
      },
    });
  });
});

// ---------------------------------------------------------------------------
// compile - caching and incremental compilation
// ---------------------------------------------------------------------------

describe("compile - caching and incremental compilation", () => {
  it("reuses cached source files and validation results for unchanged content", () => {
    const initialFiles = {
      "prompts/Translate.xml": `
        <template name="Translate">
          <schema>type Input = string; type Output = string;</schema>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
    };

    const firstResult = compile(initialFiles, { cache: null });
    const cachedResult = compile(initialFiles, { cache: firstResult });

    expect(cachedResult).toMatch({
      anyErrors: false,
      sourceFiles: {
        "prompts/Translate.xml":
          firstResult.sourceFiles["prompts/Translate.xml"],
      },
      templates: {
        "Main:Translate": firstResult.templates["Main:Translate"],
      },
    });
  });

  it("re-evaluates modified files while preserving unchanged cached results", () => {
    const initialFiles = {
      "prompts/Translate.xml": `
        <template name="Translate">
          <schema>type Input = string; type Output = string;</schema>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
      "prompts/Summarize.xml": `
        <template name="Summarize">
          <schema>type Input = string; type Output = string;</schema>
          <system>Summarize</system>
          <user>Usr</user>
        </template>
      `,
    };

    const firstResult = compile(initialFiles, { cache: null });

    const updatedFiles = {
      ...initialFiles,
      "prompts/Translate.xml": `
        <template name="Translate">
          <schema>type Input = { text: string; }; type Output = string;</schema>
          <system>Updated sys</system>
          <user><insert val="input.text"/></user>
        </template>
      `,
    };

    const secondResult = compile(updatedFiles, { cache: firstResult });

    expect(secondResult).toMatch({
      anyErrors: false,
      sourceFiles: {
        "prompts/Summarize.xml":
          firstResult.sourceFiles["prompts/Summarize.xml"],
      },
      templates: {
        "Main:Summarize": firstResult.templates["Main:Summarize"],
        "Main:Translate": {
          kind: "template",
        },
      },
    });
  });

  it("re-validates templates when a referenced tool is updated", () => {
    const initialFiles = {
      "prompts/calc.xml": `
        <tool name="calc">
          <description>Calculator</description>
          <schema>type Input = { expr: string; }; type Output = { result: number; };</schema>
        </tool>
      `,
      "prompts/Math.xml": `
        <template name="Math">
          <schema>type Input = { q: string; }; type Output = string;</schema>
          <tools>- tool: calc</tools>
          <system>Sys <c>calc</c></system>
          <user><insert val="input.q"/></user>
        </template>
      `,
    };

    const firstResult = compile(initialFiles, { cache: null });

    // Modify the tool schema
    const updatedFiles = {
      ...initialFiles,
      "prompts/calc.xml": `
        <tool name="calc">
          <description>Updated calculator</description>
          <schema>type Input = { expression: string; }; type Output = { answer: number; };</schema>
        </tool>
      `,
    };

    const secondResult = compile(updatedFiles, { cache: firstResult });

    expect(secondResult).toMatch({
      anyErrors: false,
      tools: {
        "Main:calc": {
          kind: "tool",
        },
      },
      templates: {
        "Main:Math": {
          kind: "template",
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// compile - pathToDefinitionLinks
// ---------------------------------------------------------------------------

describe("compile - pathToDefinitionLinks", () => {
  it("populates pathToDefinitionLinks across meta, namespace, tool, and template files", () => {
    const result = compile(
      {
        "prompts/meta.xml": `
          <meta>
            type Meta = {
              env: Environment;
            };
            type Environment = "prod" | "dev";
          </meta>
        `,
        "prompts/Legal/shared.xml": `
          <namespace name="Legal">
            type Clause = { id: string; text: string; };
            type Document = {
              title: string;
              clauses: Clause[];
            };
          </namespace>
        `,
        "prompts/Legal/lookupClause.xml": `
          <tool name="lookupClause" namespace="Legal">
            <description>Looks up clause</description>
            <schema>
              type Input = { clauseId: string; };
              type Output = shared.Clause;
            </schema>
          </tool>
        `,
        "prompts/Legal/ReviewContract.xml": `
          <template name="ReviewContract" namespace="Legal">
            <schema>
              type Input = { doc: shared.Document; };
              type Output = string;
            </schema>
            <tools>
              - tool: lookupClause
            </tools>
            <meta>
              env: "prod"
            </meta>
            <system>Review</system>
            <user>Reviewing: <insert val="input.doc.title"/></user>
          </template>
        `,
      },
      { cache: null },
    );

    expect(result).toMatch({
      anyErrors: false,
      pathToDefinitionLinks: {
        "prompts/meta.xml": [
          {
            reference: { path: "prompts/meta.xml" },
            definition: { path: "prompts/meta.xml" },
          },
        ],
        "prompts/Legal/shared.xml": [
          {
            reference: { path: "prompts/Legal/shared.xml" },
            definition: { path: "prompts/Legal/shared.xml" },
          },
        ],
        "prompts/Legal/lookupClause.xml": [
          {
            reference: {
              path: "prompts/Legal/lookupClause.xml",
            },
            definition: { path: "prompts/Legal/shared.xml" },
          },
        ],
        "prompts/Legal/ReviewContract.xml": [
          {
            reference: {
              path: "prompts/Legal/ReviewContract.xml",
            },
            definition: { path: "prompts/meta.xml" },
          },
          {
            reference: {
              path: "prompts/Legal/ReviewContract.xml",
            },
            definition: { path: "prompts/meta.xml" },
          },
          {
            reference: {
              path: "prompts/Legal/ReviewContract.xml",
            },
            definition: { path: "prompts/Legal/shared.xml" },
          },
          {
            reference: { path: "prompts/Legal/ReviewContract.xml" },
            definition: { path: "prompts/Legal/lookupClause.xml" },
          },
          {
            reference: { path: "prompts/Legal/ReviewContract.xml" },
            definition: { path: "prompts/Legal/ReviewContract.xml" },
          },
          {
            reference: { path: "prompts/Legal/ReviewContract.xml" },
            definition: { path: "prompts/Legal/shared.xml" },
          },
        ],
      },
    });
  });

  it("preserves pathToDefinitionLinks when reusing compilation cache", () => {
    const files = {
      "prompts/shared.xml": `
        <namespace name="Main">
          type User = { name: string; };
        </namespace>
      `,
      "prompts/Greet.xml": `
        <template name="Greet">
          <schema>
            type Input = { user: shared.User; };
            type Output = string;
          </schema>
          <system>Greeter</system>
          <user>Hello <insert val="input.user.name"/></user>
        </template>
      `,
    };

    const firstResult = compile(files, { cache: null });
    expect(firstResult).toMatch({
      anyErrors: false,
      pathToDefinitionLinks: {
        "prompts/Greet.xml": [
          {
            reference: { path: "prompts/Greet.xml" },
            definition: { path: "prompts/shared.xml" },
          },
          {
            reference: { path: "prompts/Greet.xml" },
            definition: { path: "prompts/Greet.xml" },
          },
          {
            reference: { path: "prompts/Greet.xml" },
            definition: { path: "prompts/shared.xml" },
          },
        ],
      },
    });

    const secondResult = compile(files, { cache: firstResult });
    expect(secondResult).toMatch({
      anyErrors: false,
      pathToDefinitionLinks: {
        "prompts/shared.xml": [],
        "prompts/Greet.xml": [
          {
            reference: { path: "prompts/Greet.xml" },
            definition: { path: "prompts/shared.xml" },
          },
          {
            reference: { path: "prompts/Greet.xml" },
            definition: { path: "prompts/Greet.xml" },
          },
          {
            reference: { path: "prompts/Greet.xml" },
            definition: { path: "prompts/shared.xml" },
          },
        ],
      },
    });
  });
});
