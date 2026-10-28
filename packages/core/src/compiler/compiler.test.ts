import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { ValidCompilationResult } from "./compiler-types.js";
import { compile, parseSourceFile } from "./compiler.js";

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
        "prompts/Translate.tp": `
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
      signature: "7d6199f8",
      finalErrors: {
        "prompts/Translate.tp": [],
      },
      pathToDefinitionLinks: {
        "prompts/Translate.tp": [
          {
            reference: { path: "prompts/Translate.tp" },
            definition: { text: "text" },
          },
        ],
      },
    });
  });

  it("compiles a multi-file project with meta, namespace, tools, and templates", () => {
    const result = compile(
      {
        "prompts/meta.tp": `
          <meta>
            type Meta = {
              temperature: number;
            };
          </meta>
        `,
        "prompts/Legal/shared.tp": `
          <namespace name="Legal">
            type Document = {
              title: string;
            };
          </namespace>
        `,
        "prompts/Legal/lookupClause.tp": `
          <tool name="lookupClause" namespace="Legal">
            <description>Looks up clause by <c>clauseId</c></description>
            <schema>
              type Input = { clauseId: string; };
              type Output = { clauseText: string; };
            </schema>
          </tool>
        `,
        "prompts/Legal/ReviewContract.tp": `
          <template name="ReviewContract" namespace="Legal">
            <schema>
              type Input = { doc: shared.Document; };
              type Output = string;
            </schema>
            <tools>
              <tool name="lookupClause" />
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
      signature: "a8985639",
      finalErrors: {
        "prompts/meta.tp": [],
        "prompts/Legal/shared.tp": [],
        "prompts/Legal/lookupClause.tp": [],
        "prompts/Legal/ReviewContract.tp": [],
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
        "prompts/Broken.tp": "<template name='Broken'",
      },
      { cache: null, patchBase: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Broken.tp": [
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
        "prompts/Invalid.tp": "<unknownTag>content</unknownTag>",
      },
      { cache: null, patchBase: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Invalid.tp": [
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
        "prompts/Invalid.tp": "not xml content",
      },
      { cache: null, patchBase: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Invalid.tp": [
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
        "prompts/meta1.tp": "<meta>type Meta = { timeout: number; };</meta>",
        "prompts/meta2.tp": "<meta>type Meta = { debug: boolean; };</meta>",
      },
      { cache: null, patchBase: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      metaSchema: { kind: "other-error" },
      finalErrors: {
        "prompts/meta1.tp": [
          {
            message: "Multiple <meta> elements found",
          },
        ],
        "prompts/meta2.tp": [
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
        "prompts/meta.tp": "<meta>type InvalidMeta = ;</meta>",
      },
      { cache: null, patchBase: null },
    );

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/meta.tp": [
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
        "prompts/Legal1/shared.tp": `
          <namespace name="Legal">
            type Doc = { title: string; };
          </namespace>
        `,
        "prompts/Legal2/shared.tp": `
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
        "prompts/Legal1/shared.tp": [
          {
            message: "Duplicate identifier 'Legal'",
          },
        ],
        "prompts/Legal2/shared.tp": [
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
        "prompts/Legal/shared.tp": `
          <namespace name="Legal">
            type Doc = { title: string; };
          </namespace>
        `,
        "prompts/LEGAL/shared.tp": `
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
        "prompts/Legal/shared.tp": [],
        "prompts/LEGAL/shared.tp": [
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
        "prompts/Finance/shared.tp": `
          <namespace name="Finance">
            type Tx = { id: string; };
          </namespace>
        `,
        "prompts/Unknown/Doc.tp": `
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
        "prompts/Finance/shared.tp": [],
        "prompts/Unknown/Doc.tp": [
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
        "prompts/Finance/shared.tp": `
          <namespace name="Finance">
            type Tx = { id: string; };
          </namespace>
        `,
        "prompts/Unknown/myTool.tp": `
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
        "prompts/Finance/shared.tp": [],
        "prompts/Unknown/myTool.tp": [
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
        "prompts/Translate1.tp": `
          <template name="Translate">
            <schema>type Input = string; type Output = string;</schema>
            <system>Sys 1</system>
            <user>Usr 1</user>
          </template>
        `,
        "prompts/Translate2.tp": `
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
        "prompts/Translate1.tp": [
          {
            message: "Duplicate identifier 'Translate'",
          },
        ],
        "prompts/Translate2.tp": [
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
        "prompts/Search.tp": `
          <template name="Search">
            <schema>type Input = string; type Output = string;</schema>
            <system>Sys</system>
            <user>Usr</user>
          </template>
        `,
        "prompts/searchTool.tp": `
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
        "prompts/Search.tp": [
          {
            message: "'Search' and 'search' differ only by casing",
          },
        ],
        "prompts/searchTool.tp": [],
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
      "prompts/Translate.tp": `
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
        "prompts/Translate.tp": firstResult.sourceFiles["prompts/Translate.tp"],
      },
      templates: {
        "Main:Translate": firstResult.templates["Main:Translate"],
      },
    });
  });

  it("re-evaluates modified files while preserving unchanged cached results", () => {
    const initialFiles = {
      "prompts/Translate.tp": `
        <template name="Translate">
          <schema>type Input = string; type Output = string;</schema>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `,
      "prompts/Summarize.tp": `
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
      "prompts/Translate.tp": `
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
        "prompts/Summarize.tp": firstResult.sourceFiles["prompts/Summarize.tp"],
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
      "prompts/calc.tp": `
        <tool name="calc">
          <description>Calculator</description>
          <schema>type Input = { expr: string; }; type Output = { result: number; };</schema>
        </tool>
      `,
      "prompts/Math.tp": `
        <template name="Math">
          <schema>type Input = { q: string; }; type Output = string;</schema>
          <tools><tool name="calc" /></tools>
          <system>Sys <c>calc</c></system>
          <user><insert val="input.q"/></user>
        </template>
      `,
    };

    const firstResult = compile(initialFiles, { cache: null, patchBase: null });

    // Modify the tool schema
    const updatedFiles = {
      ...initialFiles,
      "prompts/calc.tp": `
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
        "prompts/meta.tp": `
          <meta>
            type Meta = {
              env: Environment;
            };
            type Environment = "prod" | "dev";
          </meta>
        `,
        "prompts/Legal/shared.tp": `
          <namespace name="Legal">
            type Clause = { id: string; text: string; };
            type Document = {
              title: string;
              clauses: Clause[];
            };
          </namespace>
        `,
        "prompts/Legal/lookupClause.tp": `
          <tool name="lookupClause" namespace="Legal">
            <description>Looks up clause</description>
            <schema>
              type Input = { clauseId: string; };
              type Output = shared.Clause;
            </schema>
          </tool>
        `,
        "prompts/Legal/ReviewContract.tp": `
          <template name="ReviewContract" namespace="Legal">
            <schema>
              type Input = { doc: shared.Document; };
              type Output = string;
            </schema>
            <tools>
              <tool name="lookupClause" />
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
        "prompts/meta.tp": [
          {
            reference: { path: "prompts/meta.tp" },
            definition: { path: "prompts/meta.tp" },
          },
        ],
        "prompts/Legal/shared.tp": [
          {
            reference: { path: "prompts/Legal/shared.tp" },
            definition: { path: "prompts/Legal/shared.tp" },
          },
        ],
        "prompts/Legal/lookupClause.tp": [
          {
            reference: {
              path: "prompts/Legal/lookupClause.tp",
            },
            definition: { path: "prompts/Legal/shared.tp" },
          },
        ],
        "prompts/Legal/ReviewContract.tp": [
          {
            reference: {
              path: "prompts/Legal/ReviewContract.tp",
            },
            definition: { path: "prompts/meta.tp" },
          },
          {
            reference: {
              path: "prompts/Legal/ReviewContract.tp",
            },
            definition: { path: "prompts/meta.tp" },
          },
          {
            reference: {
              path: "prompts/Legal/ReviewContract.tp",
            },
            definition: { path: "prompts/Legal/shared.tp" },
          },
          {
            reference: { path: "prompts/Legal/ReviewContract.tp" },
            definition: { path: "prompts/Legal/lookupClause.tp" },
          },
          {
            reference: { path: "prompts/Legal/ReviewContract.tp" },
            definition: { path: "prompts/Legal/ReviewContract.tp" },
          },
          {
            reference: { path: "prompts/Legal/ReviewContract.tp" },
            definition: { path: "prompts/Legal/shared.tp" },
          },
        ],
      },
    });
  });

  it("preserves pathToDefinitionLinks when reusing compilation cache", () => {
    const files = {
      "prompts/shared.tp": `
        <namespace name="Main">
          type User = { name: string; };
        </namespace>
      `,
      "prompts/Greet.tp": `
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
        "prompts/Greet.tp": [
          {
            reference: { path: "prompts/Greet.tp" },
            definition: { path: "prompts/shared.tp" },
          },
          {
            reference: { path: "prompts/Greet.tp" },
            definition: { path: "prompts/Greet.tp" },
          },
          {
            reference: { path: "prompts/Greet.tp" },
            definition: { path: "prompts/shared.tp" },
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
        "prompts/shared.tp": [],
        "prompts/Greet.tp": [
          {
            reference: { path: "prompts/Greet.tp" },
            definition: { path: "prompts/shared.tp" },
          },
          {
            reference: { path: "prompts/Greet.tp" },
            definition: { path: "prompts/Greet.tp" },
          },
          {
            reference: { path: "prompts/Greet.tp" },
            definition: { path: "prompts/shared.tp" },
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
    "prompts/Billing/shared.tp": `
      <namespace name="Billing">
        type Invoice = { id: string; amount: number; };
      </namespace>
    `,
    "prompts/Billing/charge.tp": `
      <tool name="charge" namespace="Billing">
        <description>Charges card</description>
        <schema>
          type Input = { cardId: string; amount: number; };
          type Output = { success: boolean; };
        </schema>
      </tool>
    `,
    "prompts/Billing/SendInvoice.tp": `
      <template name="SendInvoice" namespace="Billing">
        <schema>
          type Input = { invoiceId: string; };
          type Output = string;
        </schema>
        <system>You send invoices</system>
        <user>Invoice <insert val="input.invoiceId"/></user>
      </template>
    `,
    "prompts/Translate.tp": `
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
      "prompts/Billing/shared.tp": `
        <namespace name="Billing">
          type Invoice = { id: string; amount: number; };
        </namespace>
      `,
      "prompts/Billing/charge.tp": `
        <tool name="charge" namespace="Billing">
          <description>Updated description for charging</description>
          <schema>
            type Input = { cardId: string; amount: number; };
            type Output = { success: boolean; };
          </schema>
        </tool>
      `,
      "prompts/Billing/SendInvoice.tp": `
        <template name="SendInvoice" namespace="Billing">
          <schema>
            type Input = { invoiceId: string; };
            type Output = string;
          </schema>
          <system>Updated system prompt</system>
          <user>Sending invoice: <insert val="input.invoiceId"/></user>
        </template>
      `,
      "prompts/Translate.tp": `
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
      "prompts/NewTemplate.tp": `
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
        "prompts/NewTemplate.tp": [
          {
            message: "File not found in patch base",
          },
        ],
      },
    });
  });

  it("reports error when element kind does not match base", () => {
    const overrideFiles = {
      "prompts/Translate.tp": `
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
        "prompts/Translate.tp": [
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
      "prompts/Translate.tp": `
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
        "prompts/Translate.tp": [
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
      "prompts/Billing/charge.tp": `
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
        "prompts/Billing/charge.tp": [
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
      "prompts/Billing/shared.tp": `
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
        "prompts/Billing/shared.tp": [
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
      "prompts/Billing/SendInvoice.tp": `
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
        "prompts/Billing/SendInvoice.tp": [
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
      "prompts/Billing/SendInvoice.tp": `
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
        "prompts/Billing/SendInvoice.tp": [
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
      "prompts/Translate.tp": `
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
        "prompts/Translate.tp": [
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
      "prompts/Translate.tp": `
        <template name="Translate">
          <schema>
            type Input = { differentField: number; };
            type Output = string;
          </schema>
          <system>Translate</system>
          <user>hi</user>
        </template>
      `,
      "prompts/Billing/charge.tp": `
        <tool name="charge" namespace="Billing">
          <description>Charges card</description>
          <schema>
            type Input = { cardId: string; };
            type Output = { success: boolean; };
          </schema>
        </tool>
      `,
      "prompts/Billing/shared.tp": `
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
        "prompts/Translate.tp": [
          {
            message: "Schema does not match base",
          },
        ],
        "prompts/Billing/charge.tp": [
          {
            message: "Schema does not match base",
          },
        ],
        "prompts/Billing/shared.tp": [
          {
            message: "Schema does not match base",
          },
        ],
      },
    });

    const translateErrors = result.finalErrors["prompts/Translate.tp"];
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
        "prompts/meta.tp": `
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
        "prompts/meta.tp": `
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
        "prompts/meta.tp": [
          {
            message: "Schema does not match base",
          },
        ],
      },
    });

    const metaErrors = result.finalErrors["prompts/meta.tp"];
    expect(metaErrors?.[0]?.baseSchema !== undefined).toBe(true);
    expect(metaErrors?.[0]?.baseSchema?.includes("temperature: number;")).toBe(
      true,
    );
  });

  it("skips patchBase validation when override file has parse errors", () => {
    const overrideFiles = {
      "prompts/Translate.tp": '<template name="Translate"',
    };

    const result = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    });

    expect(result).toMatch({
      anyErrors: true,
      finalErrors: {
        "prompts/Translate.tp": [
          {
            message: "Unclosed tag '<template>'",
          },
        ],
      },
    });
  });
});

describe("SourceFileParseResult hash", () => {
  it("computes exact hash values matching semantic patch-validation elements", () => {
    const templateDefaultNs = parseSourceFile(
      "prompts/Translate.tp",
      `
        <template name="Translate">
          <schema>
            type Input = { text: string; };
            type Output = string;
          </schema>
          <system>Translate</system>
          <user><insert val="input.text"/></user>
        </template>
      `,
      { patchBase: null },
    );

    const templateCustomNs = parseSourceFile(
      "prompts/Legal/ReviewContract.tp",
      `
        <template name="ReviewContract" namespace="Legal">
          <schema>
            type Input = { doc: shared.Document; };
            type Output = string;
          </schema>
          <system>Legal reviewer</system>
          <user>Review contract</user>
        </template>
      `,
      { patchBase: null },
    );

    const toolFile = parseSourceFile(
      "prompts/Legal/lookupClause.tp",
      `
        <tool name="lookupClause" namespace="Legal">
          <description>Looks up clause by <c>clauseId</c></description>
          <schema>
            type Input = { clauseId: string; };
            type Output = { clauseText: string; };
          </schema>
        </tool>
      `,
      { patchBase: null },
    );

    const namespaceFile = parseSourceFile(
      "prompts/Legal/shared.tp",
      `
        <namespace name="Legal">
          type Document = {
            title: string;
          };
        </namespace>
      `,
      { patchBase: null },
    );

    const metaFile = parseSourceFile(
      "prompts/meta.tp",
      `
        <meta>
          type Meta = {
            temperature: number;
          };
        </meta>
      `,
      { patchBase: null },
    );

    // Exact deterministic hash snapshots
    expect(templateDefaultNs.hash).toBe(2103548408);
    expect(templateCustomNs.hash).toBe(-828742231);
    expect(toolFile.hash).toBe(1830807043);
    expect(namespaceFile.hash).toBe(-2055341980);
    expect(metaFile.hash).toBe(-413134295);
  });

  it("produces identical hash when prompt body text or doc comments change", () => {
    const file1 = parseSourceFile(
      "prompts/Translate.tp",
      `
        <template name="Translate">
          <schema>
            type Input = { text: string; };
            type Output = string;
          </schema>
          <system>Translate text</system>
          <user><insert val="input.text"/></user>
        </template>
      `,
      { patchBase: null },
    );

    const file2 = parseSourceFile(
      "prompts/Translate.tp",
      `
        <template name="Translate">
          <schema>
            /** JSDoc comment for Input */
            type Input = {
              /** JSDoc comment for field */
              text: string;
            };
            type Output = string;
          </schema>
          <system>Completely different instructions for the LLM</system>
          <user>Different user prompt template text</user>
        </template>
      `,
      { patchBase: null },
    );

    expect(file1.hash).toBe(file2.hash);
  });

  it("produces different hash when template name, namespace, or schema changes", () => {
    const base = parseSourceFile(
      "prompts/Translate.tp",
      `
        <template name="Translate">
          <schema>
            type Input = { text: string; };
            type Output = string;
          </schema>
          <system>Translate</system>
          <user>Translate text</user>
        </template>
      `,
      { patchBase: null },
    );

    const diffName = parseSourceFile(
      "prompts/Translate.tp",
      `
        <template name="Translate2">
          <schema>
            type Input = { text: string; };
            type Output = string;
          </schema>
          <system>Translate</system>
          <user>Translate text</user>
        </template>
      `,
      { patchBase: null },
    );

    const diffNamespace = parseSourceFile(
      "prompts/Translate.tp",
      `
        <template name="Translate" namespace="Other">
          <schema>
            type Input = { text: string; };
            type Output = string;
          </schema>
          <system>Translate</system>
          <user>Translate text</user>
        </template>
      `,
      { patchBase: null },
    );

    const diffSchema = parseSourceFile(
      "prompts/Translate.tp",
      `
        <template name="Translate">
          <schema>
            type Input = { count: number; };
            type Output = string;
          </schema>
          <system>Translate</system>
          <user>Translate text</user>
        </template>
      `,
      { patchBase: null },
    );

    expect(base.hash === diffName.hash).toBe(false);
    expect(base.hash === diffNamespace.hash).toBe(false);
    expect(base.hash === diffSchema.hash).toBe(false);
  });
});

describe("compile - schema warnings", () => {
  it("collects schema warnings from a template", () => {
    const result = compile(
      {
        "prompts/Translate.tp": `
          <template name="Translate">
            <schema>
              /// This is an inline doc comment
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

    expect(result.warnings["prompts/Translate.tp"]).toMatch([
      {
        message: "Use '/** */' instead of '///' for documentation comments",
        span: {
          path: "prompts/Translate.tp",
        },
      },
    ]);
  });

  it("collects schema warnings from a tool", () => {
    const result = compile(
      {
        "tools/search.tp": `
          <tool name="search">
            <description>Search the web</description>
            <schema>
              /// Query parameter doc
              type Input = { query: string; };
              type Output = string[];
            </schema>
          </tool>
        `,
      },
      { cache: null, patchBase: null },
    );

    expect(result.warnings["tools/search.tp"]).toMatch([
      {
        message: "Use '/** */' instead of '///' for documentation comments",
        span: {
          path: "tools/search.tp",
        },
      },
    ]);
  });

  it("collects schema warnings from a namespace", () => {
    const result = compile(
      {
        "shared.tp": `
          <namespace name="Main">
            /// Shared type doc
            type Shared = string;
          </namespace>
        `,
      },
      { cache: null, patchBase: null },
    );

    expect(result.warnings["shared.tp"]).toMatch([
      {
        message: "Use '/** */' instead of '///' for documentation comments",
        span: {
          path: "shared.tp",
        },
      },
    ]);
  });

  it("collects schema warnings from meta", () => {
    const result = compile(
      {
        "meta.tp": `
          <meta>
            /// Meta doc
            type Meta = {
              timeoutMs: number;
            };
          </meta>
        `,
      },
      { cache: null, patchBase: null },
    );

    expect(result.warnings["meta.tp"]).toMatch([
      {
        message: "Use '/** */' instead of '///' for documentation comments",
        span: {
          path: "meta.tp",
        },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// compile - playground support
// ---------------------------------------------------------------------------

describe("compile - playground support", () => {
  it("compiles a template with a playground in the default namespace", () => {
    const result = compile(
      {
        "prompts/Translate.tp": `
          <template name="Translate">
            <schema>
              type Input = { text: string; };
              type Output = { translated: string; };
            </schema>
            <system>Translator</system>
            <user><insert val="input.text"/></user>
          </template>
        `,
        "prompts/Translate.play.tp": `
          <playground for="Translate">
            <samples>
            - name: "Spanish greeting"
              input:
                text: "Hello"
            - name: "Second test"
              input:
                text: "Goodbye"
            </samples>
          </playground>
        `,
      },
      { cache: null, patchBase: null },
    );

    expect(result.anyErrors).toBe(false);
    expect(result.playgrounds["Main:Translate"]).toMatch({
      kind: "playground",
      templateId: "Main:Translate",
      samples: [
        {
          name: { text: "Spanish greeting" },
          input: { text: "Hello" },
        },
        {
          name: { text: "Second test" },
          input: { text: "Goodbye" },
        },
      ],
    });

    const namespaceResult = result.namespaces["Main"];
    expect(namespaceResult?.playgrounds["Translate"]).toBe(
      result.playgrounds["Main:Translate"],
    );
  });

  it("compiles a template with a playground in a custom namespace", () => {
    const result = compile(
      {
        "prompts/Legal/shared.tp": `
          <namespace name="Legal">
            type Party = { name: string; };
          </namespace>
        `,
        "prompts/Legal/DraftNda.tp": `
          <template name="DraftNda" namespace="Legal">
            <schema>
              type Input = { party: shared.Party; };
              type Output = string;
            </schema>
            <system>Legal drafter</system>
            <user>Draft for <insert val="input.party.name"/></user>
          </template>
        `,
        "prompts/Legal/DraftNda.play.tp": `
          <playground for="DraftNda" namespace="Legal">
            <samples>
            - name: "Acme NDA"
              input:
                party:
                  name: "Acme Corp"
            </samples>
          </playground>
        `,
      },
      { cache: null, patchBase: null },
    );

    expect(result.anyErrors).toBe(false);
    expect(result.playgrounds["Legal:DraftNda"]).toMatch({
      kind: "playground",
      templateId: "Legal:DraftNda",
      samples: [
        {
          name: { text: "Acme NDA" },
          input: {
            party: { name: "Acme Corp" },
          },
        },
      ],
    });
  });

  it("reports an error when target template is not found", () => {
    const result = compile(
      {
        "prompts/Unknown.play.tp": `
          <playground for="Unknown">
            <samples>
            - input:
                text: "test"
            </samples>
          </playground>
        `,
      },
      { cache: null, patchBase: null },
    );

    expect(result.anyErrors).toBe(true);
    expect(result.finalErrors["prompts/Unknown.play.tp"]).toMatch([
      {
        message: "Template 'Unknown' not found",
      },
    ]);
  });

  it("reports an error when multiple playgrounds target the same template", () => {
    const result = compile(
      {
        "prompts/Translate.tp": `
          <template name="Translate">
            <schema>
              type Input = { text: string; };
              type Output = string;
            </schema>
            <system>Translator</system>
            <user><insert val="input.text"/></user>
          </template>
        `,
        "prompts/Translate.play.tp": `
          <playground for="Translate">
            <samples>
            - input:
                text: "a"
            </samples>
          </playground>
        `,
        "prompts/other/Translate.play.tp": `
          <playground for="Translate">
            <samples>
            - input:
                text: "b"
            </samples>
          </playground>
        `,
      },
      { cache: null, patchBase: null },
    );

    expect(result.anyErrors).toBe(true);
    expect(result.finalErrors["prompts/Translate.play.tp"]).toMatch([
      {
        message:
          "Multiple <playground> elements found for template 'Translate'",
      },
    ]);
    expect(result.finalErrors["prompts/other/Translate.play.tp"]).toMatch([
      {
        message:
          "Multiple <playground> elements found for template 'Translate'",
      },
    ]);
  });

  it("reuses cached playground validation when files are unchanged", () => {
    const files = {
      "prompts/Translate.tp": `
        <template name="Translate">
          <schema>
            type Input = { text: string; };
            type Output = string;
          </schema>
          <system>Translator</system>
          <user><insert val="input.text"/></user>
        </template>
      `,
      "prompts/Translate.play.tp": `
        <playground for="Translate">
          <samples>
          - input:
              text: "hello"
          </samples>
        </playground>
      `,
    };

    const firstResult = compile(files, { cache: null, patchBase: null });
    expect(firstResult.anyErrors).toBe(false);

    const secondResult = compile(files, {
      cache: firstResult,
      patchBase: null,
    });
    expect(secondResult).toMatch({
      anyErrors: false,
      playgrounds: {
        "Main:Translate": firstResult.playgrounds["Main:Translate"],
      },
    });
  });

  it("does not include playgrounds in compilation result signature hash", () => {
    const withoutPlayground = compile(
      {
        "prompts/Translate.tp": `
          <template name="Translate">
            <schema>
              type Input = { text: string; };
              type Output = string;
            </schema>
            <system>Translator</system>
            <user><insert val="input.text"/></user>
          </template>
        `,
      },
      { cache: null, patchBase: null },
    );

    const withPlayground = compile(
      {
        "prompts/Translate.tp": `
          <template name="Translate">
            <schema>
              type Input = { text: string; };
              type Output = string;
            </schema>
            <system>Translator</system>
            <user><insert val="input.text"/></user>
          </template>
        `,
        "prompts/Translate.play.tp": `
          <playground for="Translate">
            <samples>
            - input:
                text: "hello"
            </samples>
          </playground>
        `,
      },
      { cache: null, patchBase: null },
    );

    expect(withoutPlayground.anyErrors).toBe(false);
    expect(withPlayground.anyErrors).toBe(false);
    expect(withPlayground.signature).toBe(withoutPlayground.signature);
    expect(withPlayground.sourceFiles["prompts/Translate.play.tp"]!.hash).toBe(
      0,
    );
  });
});
