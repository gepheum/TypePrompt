import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { ValidCompilationResult } from "./compiler-types.js";
import { compile } from "./compiler.js";

// ---------------------------------------------------------------------------
// compile - basic compilation & empty results
// ---------------------------------------------------------------------------

describe("compile - basic compilation and empty results", () => {
  it("compiles an empty project with no files", () => {
    const result = compile({}, { cache: null, patchBase: null });

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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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
      { cache: null, patchBase: null },
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

    const firstResult = compile(initialFiles, { cache: null, patchBase: null });
    const cachedResult = compile(initialFiles, {
      cache: firstResult,
      patchBase: null,
    });

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

    const firstResult = compile(initialFiles, { cache: null, patchBase: null });

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

    const secondResult = compile(updatedFiles, {
      cache: firstResult,
      patchBase: null,
    });

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

    const firstResult = compile(initialFiles, { cache: null, patchBase: null });

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

    const secondResult = compile(updatedFiles, {
      cache: firstResult,
      patchBase: null,
    });

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
      { cache: null, patchBase: null },
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

    const firstResult = compile(files, { cache: null, patchBase: null });
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

    const secondResult = compile(files, {
      cache: firstResult,
      patchBase: null,
    });
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

// ---------------------------------------------------------------------------
// compile - patchBase validation
// ---------------------------------------------------------------------------

describe("compile - patchBase validation", () => {
  const baseFiles = {
    "prompts/Billing/shared.xml": `
      <namespace name="Billing">
        type Invoice = { id: string; amount: number; };
      </namespace>
    `,
    "prompts/Billing/charge.xml": `
      <tool name="charge" namespace="Billing">
        <description>Charges card</description>
        <schema>
          type Input = { cardId: string; amount: number; };
          type Output = { success: boolean; };
        </schema>
      </tool>
    `,
    "prompts/Billing/SendInvoice.xml": `
      <template name="SendInvoice" namespace="Billing">
        <schema>
          type Input = { invoiceId: string; };
          type Output = string;
        </schema>
        <system>You send invoices</system>
        <user>Invoice <insert val="input.invoiceId"/></user>
      </template>
    `,
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
  };

  const baseResult = compile(baseFiles, {
    cache: null,
    patchBase: null,
  }) as ValidCompilationResult;
  if (baseResult.anyErrors) throw new Error();

  it("succeeds when overrides match base templates, tools, and namespaces", () => {
    const overrideFiles = {
      "prompts/Billing/shared.xml": `
        <namespace name="Billing">
          type Invoice = { id: string; amount: number; };
        </namespace>
      `,
      "prompts/Billing/charge.xml": `
        <tool name="charge" namespace="Billing">
          <description>Updated description for charging</description>
          <schema>
            type Input = { cardId: string; amount: number; };
            type Output = { success: boolean; };
          </schema>
        </tool>
      `,
      "prompts/Billing/SendInvoice.xml": `
        <template name="SendInvoice" namespace="Billing">
          <schema>
            type Input = { invoiceId: string; };
            type Output = string;
          </schema>
          <system>Updated system prompt</system>
          <user>Sending invoice: <insert val="input.invoiceId"/></user>
        </template>
      `,
      "prompts/Translate.xml": `
        <template name="Translate">
          <schema>
            type Input = { text: string; };
            type Output = string;
          </schema>
          <system>Custom translation engine</system>
          <user><insert val="input.text"/></user>
        </template>
      `,
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result.anyErrors).toBe(false);
  });

  it("reports error when an override file is not found in patchBase", () => {
    const overrideFiles = {
      "prompts/NewTemplate.xml": `
        <template name="NewTemplate">
          <schema>
            type Input = string;
            type Output = string;
          </schema>
          <system>New</system>
          <user><insert val="input"/></user>
        </template>
      `,
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/NewTemplate.xml": [
          {
            message: "File not found in patch base",
          },
        ],
      },
    });
  });

  it("reports error when element kind does not match base", () => {
    const overrideFiles = {
      "prompts/Translate.xml": `
        <namespace name="Translate">
          type Doc = string;
        </namespace>
      `,
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Translate.xml": [
          {
            message: "Expected <template> to match base",
            suggestions: ["template"],
          },
        ],
      },
    });
  });

  it("reports error when template name does not match base", () => {
    const overrideFiles = {
      "prompts/Translate.xml": `
        <template name="TranslateV2">
          <schema>
            type Input = { text: string; };
            type Output = string;
          </schema>
          <system>Translate</system>
          <user><insert val="input.text"/></user>
        </template>
      `,
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Translate.xml": [
          {
            message: "Expected 'Translate' to match base",
            suggestions: ["Translate"],
          },
        ],
      },
    });
  });

  it("reports error when tool name does not match base", () => {
    const overrideFiles = {
      ...baseFiles,
      "prompts/Billing/charge.xml": `
        <tool name="chargeCard" namespace="Billing">
          <description>Charges card</description>
          <schema>
            type Input = { cardId: string; amount: number; };
            type Output = { success: boolean; };
          </schema>
        </tool>
      `,
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Billing/charge.xml": [
          {
            message: "Expected 'charge' to match base",
            suggestions: ["charge"],
          },
        ],
      },
    });
  });

  it("reports error when namespace name does not match base", () => {
    const overrideFiles = {
      "prompts/Billing/shared.xml": `
        <namespace name="Invoicing">
          type Invoice = { id: string; amount: number; };
        </namespace>
      `,
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Billing/shared.xml": [
          {
            message: "Expected 'Billing' to match base",
            suggestions: ["Billing"],
          },
        ],
      },
    });
  });

  it("reports error when namespace does not match base", () => {
    const overrideFiles = {
      ...baseFiles,
      "prompts/Billing/SendInvoice.xml": `
        <template name="SendInvoice" namespace="Main">
          <schema>
            type Input = { invoiceId: string; };
            type Output = string;
          </schema>
          <system>You send invoices</system>
          <user>Invoice</user>
        </template>
      `,
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Billing/SendInvoice.xml": [
          {
            message: "Expected 'Billing' to match base",
            suggestions: ["Billing"],
          },
        ],
      },
    });
  });

  it("reports error when namespace attribute is missing on override but present in base", () => {
    const overrideFiles = {
      "prompts/Billing/SendInvoice.xml": `
        <template name="SendInvoice">
          <schema>
            type Input = { invoiceId: string; };
            type Output = string;
          </schema>
          <system>You send invoices</system>
          <user>Invoice</user>
        </template>
      `,
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Billing/SendInvoice.xml": [
          {
            message: "Missing attribute 'namespace=\"Billing\"' to match base",
          },
        ],
      },
    });
  });

  it("reports error when namespace attribute is present on override but base used default namespace", () => {
    const overrideFiles = {
      ...baseFiles,
      "prompts/Translate.xml": `
        <template name="Translate" namespace="Billing">
          <schema>
            type Input = { text: string; };
            type Output = string;
          </schema>
          <system>Translate</system>
          <user><insert val="input.text"/></user>
        </template>
      `,
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Translate.xml": [
          {
            message: "Expected 'Main' to match base",
            suggestions: ["Main"],
          },
        ],
      },
    });
  });

  it("reports schema mismatch errors with baseSchema for template, tool, and namespace", () => {
    const overrideFiles = {
      "prompts/Translate.xml": `
        <template name="Translate">
          <schema>
            type Input = { differentField: number; };
            type Output = string;
          </schema>
          <system>Translate</system>
          <user>hi</user>
        </template>
      `,
      "prompts/Billing/charge.xml": `
        <tool name="charge" namespace="Billing">
          <description>Charges card</description>
          <schema>
            type Input = { cardId: string; };
            type Output = { success: boolean; };
          </schema>
        </tool>
      `,
      "prompts/Billing/shared.xml": `
        <namespace name="Billing">
          type Invoice = { id: string; };
        </namespace>
      `,
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Translate.xml": [
          {
            message: "Schema does not match base",
          },
        ],
        "prompts/Billing/charge.xml": [
          {
            message: "Schema does not match base",
          },
        ],
        "prompts/Billing/shared.xml": [
          {
            message: "Schema does not match base",
          },
        ],
      },
    });

    const translateErrors = result.finalErrors["prompts/Translate.xml"];
    expect(translateErrors?.[0]?.baseSchema !== undefined).toBe(true);
    expect(
      translateErrors?.[0]?.baseSchema?.includes(
        "type Input = { text: string; };",
      ),
    ).toBe(true);
  });

  it("reports schema mismatch errors for meta", () => {
    const metaBase = compile(
      {
        "prompts/meta.xml": `
          <meta>
            type Meta = {
              temperature: number;
            };
          </meta>
        `,
      },
      { cache: null, patchBase: null },
    ) as ValidCompilationResult;
    if (metaBase.anyErrors) throw new Error();

    const result = compile(
      {
        "prompts/meta.xml": `
          <meta>
            type Meta = {
              temperature: string;
            };
          </meta>
        `,
      },
      { cache: null, patchBase: metaBase },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/meta.xml": [
          {
            message: "Schema does not match base",
          },
        ],
      },
    });

    const metaErrors = result.finalErrors["prompts/meta.xml"];
    expect(metaErrors?.[0]?.baseSchema !== undefined).toBe(true);
    expect(metaErrors?.[0]?.baseSchema?.includes("temperature: number;")).toBe(
      true,
    );
  });

  it("skips patchBase validation when override file has parse errors", () => {
    const overrideFiles = {
      "prompts/Translate.xml": '<template name="Translate"',
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Translate.xml": [
          {
            message: "Unclosed tag '<template>'",
          },
        ],
      },
    });
  });
});
