import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { InternalErrors } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { Template } from "./compiler-types.js";
import { parseTemplate as parseTemplateCore } from "./template-parser.js";

function parseTemplate(
  templateNode: ElementNode,
  sourcePath?: string,
): Template | InternalErrors {
  if (sourcePath !== undefined) {
    return parseTemplateCore({ ...templateNode, path: sourcePath });
  }
  return parseTemplateCore(templateNode);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseElement(
  xml: string,
  path = "prompts/HelloWorld.xml",
): ElementNode {
  const result = parseXmlDocument(xml, path);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

// ---------------------------------------------------------------------------
// parseTemplate - basic template parsing
// ---------------------------------------------------------------------------

describe("parseTemplate - basic template parsing", () => {
  it("parses a minimal valid template in the default namespace", () => {
    const root = parseElement(`
      <template name="Translate">
        <schema>
          type Input = { text: string; };
          type Output = { translated: string; };
        </schema>
        <system>You are a translator.</system>
        <user>Translate: <insert val="input.text"/></user>
      </template>
    `);

    expect(parseTemplate(root, "prompts/Translate.xml")).toMatch({
      kind: "template",
      name: { text: "Translate" },
      namespace: null,
      outputFormat: null,
      tools: null,
      contents: {
        kind: "no-variants",
        content: {
          system: [{ kind: "text", text: "You are a translator." }],
          user: [
            { kind: "text", text: "Translate: " },
            {
              kind: "insert-val",
              val: {
                kind: "property",
                property: { text: "text" },
                left: { kind: "input" },
              },
              indent: "",
            },
          ],
        },
      },
      snippets: [],
      warnings: [],
    });
  });

  it("parses a valid template in a custom namespace with matching file path", () => {
    const root = parseElement(`
      <template name="DraftContract" namespace="Legal">
        <schema>
          type Input = { title: string; };
          type Output = { draft: string; };
        </schema>
        <system>Legal drafter.</system>
        <user>Title: <insert val="input.title"/></user>
      </template>
    `);

    expect(parseTemplate(root, "prompts/Legal/DraftContract.xml")).toMatch({
      kind: "template",
      name: { text: "DraftContract" },
      namespace: { text: "Legal" },
      warnings: [],
    });
  });
});

// ---------------------------------------------------------------------------
// parseTemplate - attributes and naming validation
// ---------------------------------------------------------------------------

describe("parseTemplate - attributes and naming validation", () => {
  it("reports an error when the name attribute is missing", () => {
    const root = parseElement(`
      <template>
        <schema>type Input = {}; type Output = {};</schema>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Translate.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing required attribute 'name'",
        },
      ],
    });
  });

  it("rejects non-PascalCase template names", () => {
    const root = parseElement(`
      <template name="translateText">
        <schema>type Input = {}; type Output = {};</schema>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "translateText.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Invalid value for attribute 'name': expected a PascalCase identifier",
        },
      ],
    });
  });

  it("rejects non-PascalCase namespace attributes", () => {
    const root = parseElement(`
      <template name="Translate" namespace="legal">
        <schema>type Input = {}; type Output = {};</schema>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "legal/Translate.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Invalid value for attribute 'namespace': expected a PascalCase identifier",
        },
      ],
    });
  });

  it("rejects reserved template names", () => {
    for (const name of ["Schema", "Shared", "Meta"]) {
      const root = parseElement(`
        <template name="${name}">
          <schema>type Input = {}; type Output = {};</schema>
          <system>Sys</system>
          <user>Usr</user>
        </template>
      `);

      expect(parseTemplate(root, `${name}.xml`)).toMatch({
        kind: "error",
        errors: [
          {
            message: `Template name cannot be '${name}'`,
          },
        ],
      });
    }
  });

  it("rejects case-insensitive variations of reserved template names", () => {
    const root = parseElement(`
      <template name="SCHEMA">
        <schema>type Input = {}; type Output = {};</schema>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "SCHEMA.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Template name cannot be 'Schema' (case-insensitive)",
        },
      ],
    });
  });

  it("reports an error for unexpected attributes on <template>", () => {
    const root = parseElement(`
      <template name="Translate" extra="invalid">
        <schema>type Input = {}; type Output = {};</schema>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Translate.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected attribute 'extra'",
        },
      ],
    });
  });

  it("emits a warning when file path does not match naming conventions", () => {
    const root = parseElement(`
      <template name="Translate">
        <schema>type Input = {}; type Output = {};</schema>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "prompts/Wrong.xml")).toMatch({
      kind: "template",
      warnings: [
        {
          message: "File path should match '**/Translate.xml'",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseTemplate - <schema> element
// ---------------------------------------------------------------------------

describe("parseTemplate - <schema> element", () => {
  it("parses schema with output-format='text'", () => {
    const root = parseElement(`
      <template name="Translate">
        <schema output-format="text">
          type Input = { text: string; };
          type Output = string;
        </schema>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Translate.xml")).toMatch({
      kind: "template",
      outputFormat: { text: "text" },
      warnings: [],
    });
  });

  it("reports an error for invalid output-format attribute", () => {
    const root = parseElement(`
      <template name="Translate">
        <schema output-format="yaml">
          type Input = {}; type Output = {};
        </schema>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Translate.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Invalid value for attribute 'output-format': expected one of: 'json', 'text'",
        },
      ],
    });
  });

  it("reports an error when <schema> is missing", () => {
    const root = parseElement(`
      <template name="Translate">
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Translate.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <schema> element",
        },
      ],
    });
  });

  it("reports an error for duplicate <schema> elements", () => {
    const root = parseElement(`
      <template name="Translate">
        <schema>type Input = {}; type Output = {};</schema>
        <schema>type Input = {}; type Output = {};</schema>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Translate.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Multiple <schema> elements in <template>",
        },
      ],
    });
  });

  it("reports schema parse errors for invalid TypeScript syntax in <schema>", () => {
    const root = parseElement(`
      <template name="Translate">
        <schema>type Invalid = ;</schema>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Translate.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Expected one of: '(', '{', '|', 'shared', string literal, identifier",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseTemplate - <tools> element
// ---------------------------------------------------------------------------

describe("parseTemplate - <tools> element", () => {
  it("parses valid YAML tools declaration", () => {
    const root = parseElement(`
      <template name="Research">
        <schema>type Input = {}; type Output = {};</schema>
        <tools>
          - webSearch
          - calculator
        </tools>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Research.xml")).toMatch({
      kind: "template",
      tools: {
        kind: "array",
        elements: [
          { kind: "string", value: "webSearch" },
          { kind: "string", value: "calculator" },
        ],
      },
      warnings: [],
    });
  });

  it("reports an error for duplicate <tools> elements", () => {
    const root = parseElement(`
      <template name="Research">
        <schema>type Input = {}; type Output = {};</schema>
        <tools>- toolA</tools>
        <tools>- toolB</tools>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Research.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Multiple <tools> elements in <template>",
        },
      ],
    });
  });

  it("reports an error when <tools> has XML attributes", () => {
    const root = parseElement(`
      <template name="Research">
        <schema>type Input = {}; type Output = {};</schema>
        <tools format="yaml">- toolA</tools>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Research.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected attribute 'format'",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseTemplate - <meta> and <examples> top-level content
// ---------------------------------------------------------------------------

describe("parseTemplate - <meta> and <examples>", () => {
  it("parses YAML meta and few-shot examples", () => {
    const root = parseElement(`
      <template name="Translate">
        <schema>type Input = {}; type Output = {};</schema>
        <meta>
          temperature: 0.7
        </meta>
        <system>Sys</system>
        <user>Usr</user>
        <examples>
          - input:
              text: "hello"
            output: "bonjour"
        </examples>
      </template>
    `);

    expect(parseTemplate(root, "Translate.xml")).toMatch({
      kind: "template",
      contents: {
        kind: "no-variants",
        content: {
          meta: {
            value: {
              kind: "object",
              entries: {
                temperature: {
                  key: { kind: "string", value: "temperature" },
                  value: { kind: "number", value: 0.7 },
                },
              },
            },
          },
          examples: {
            kind: "array",
            elements: [
              {
                kind: "object",
                entries: {
                  input: {
                    key: { kind: "string", value: "input" },
                    value: {
                      kind: "object",
                      entries: {
                        text: {
                          key: { kind: "string", value: "text" },
                          value: { kind: "string", value: "hello" },
                        },
                      },
                    },
                  },
                  output: {
                    key: { kind: "string", value: "output" },
                    value: { kind: "string", value: "bonjour" },
                  },
                },
              },
            ],
          },
        },
      },
      warnings: [],
    });
  });

  it("reports errors when required <system> or <user> elements are missing", () => {
    const root = parseElement(`
      <template name="Translate">
        <schema>type Input = {}; type Output = {};</schema>
      </template>
    `);

    expect(parseTemplate(root, "Translate.xml")).toMatch({
      kind: "error",
      errors: [
        { message: "Missing <system> element" },
        { message: "Missing <user> element" },
      ],
    });
  });

  it("reports an error for duplicate <system> elements", () => {
    const root = parseElement(`
      <template name="Translate">
        <schema>type Input = {}; type Output = {};</schema>
        <system>Sys 1</system>
        <system>Sys 2</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Translate.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Multiple <system> elements",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseTemplate - variants (<variant case="...">)
// ---------------------------------------------------------------------------

describe("parseTemplate - variants", () => {
  it("parses template variants overriding system prompts with shared user prompt", () => {
    const root = parseElement(`
      <template name="ProductDesc">
        <schema>type Input = { name: string; }; type Output = string;</schema>
        <user>Product: <insert val="input.name"/></user>
        <variant case="marketing">
          <system>Marketing tone.</system>
        </variant>
        <variant case="technical">
          <system>Technical tone.</system>
        </variant>
      </template>
    `);

    expect(parseTemplate(root, "ProductDesc.xml")).toMatch({
      kind: "template",
      contents: {
        kind: "variants",
        defaultContent: {
          user: [
            { kind: "text", text: "Product: " },
            {
              kind: "insert-val",
              val: {
                kind: "property",
                property: { text: "name" },
                left: { kind: "input" },
              },
            },
          ],
        },
        variants: [
          {
            case: { text: "marketing" },
            content: {
              system: [{ kind: "text", text: "Marketing tone." }],
            },
          },
          {
            case: { text: "technical" },
            content: {
              system: [{ kind: "text", text: "Technical tone." }],
            },
          },
        ],
      },
      warnings: [],
    });
  });

  it("reports an error when variant has missing case attribute", () => {
    const root = parseElement(`
      <template name="ProductDesc">
        <schema>type Input = {}; type Output = {};</schema>
        <system>Sys</system>
        <user>Usr</user>
        <variant>
          <user>Variant Usr</user>
        </variant>
      </template>
    `);

    expect(parseTemplate(root, "ProductDesc.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing required attribute 'case'",
        },
      ],
    });
  });

  it("reports an error when a tag is defined at both template level and variant level", () => {
    const root = parseElement(`
      <template name="ProductDesc">
        <schema>type Input = {}; type Output = {};</schema>
        <system>Template level system</system>
        <user>Usr</user>
        <variant case="marketing">
          <system>Variant level system</system>
        </variant>
      </template>
    `);

    expect(parseTemplate(root, "ProductDesc.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "<system> is already specified at the <template> level",
          hint: "Remove the <system> element from the <template> level or from the <variant> level",
        },
      ],
    });
  });

  it("reports an error when variant is missing required user/system that is not in defaultContent", () => {
    const root = parseElement(`
      <template name="ProductDesc">
        <schema>type Input = {}; type Output = {};</schema>
        <variant case="v1">
          <system>Sys</system>
        </variant>
      </template>
    `);

    expect(parseTemplate(root, "ProductDesc.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <user> element",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseTemplate - snippets (<snippet>, <snippet if="...">, <snippet switch="...">)
// ---------------------------------------------------------------------------

describe("parseTemplate - snippets", () => {
  it("parses a plain snippet, snippet-if, and snippet-switch", () => {
    const root = parseElement(`
      <template name="Document">
        <schema>
          type Input = {
            extra: string;
            condition: boolean;
            format: "json" | "csv";
          };
          type Output = string;
        </schema>
        <snippet name="plainSnippet">
          Extra: <insert val="input.extra"/>
        </snippet>
        <snippet name="ifSnippet" if="input.condition" is="true">
          <then>Condition was true: <insert val="it"/></then>
          <else>Condition was false</else>
        </snippet>
        <snippet name="switchSnippet" switch="input.format">
          <on case="json">Format JSON</on>
          <on case="csv">Format CSV</on>
        </snippet>
        <system>
          <insert snippet="plainSnippet"/>
          <insert snippet="ifSnippet"/>
          <insert snippet="switchSnippet"/>
        </system>
        <user>Document user prompt</user>
      </template>
    `);

    expect(parseTemplate(root, "Document.xml")).toMatch({
      kind: "template",
      snippets: [
        {
          kind: "snippet",
          name: { text: "plainSnippet" },
          body: [
            { kind: "text", text: "Extra: " },
            {
              kind: "insert-val",
              val: {
                kind: "property",
                property: { text: "extra" },
                left: { kind: "input" },
              },
            },
          ],
        },
        {
          kind: "snippet-if",
          name: { text: "ifSnippet" },
          is: { text: "true" },
          then: [
            { kind: "text", text: "Condition was true: " },
            { kind: "insert-val", val: { kind: "it" } },
          ],
          else: [{ kind: "text", text: "Condition was false" }],
        },
        {
          kind: "snippet-switch",
          name: { text: "switchSnippet" },
          branches: [
            {
              case: { text: "json" },
              body: [{ kind: "text", text: "Format JSON" }],
            },
            {
              case: { text: "csv" },
              body: [{ kind: "text", text: "Format CSV" }],
            },
          ],
        },
      ],
      warnings: [],
    });
  });

  it("reports an error when snippet has 'is' attribute without 'if'", () => {
    const root = parseElement(`
      <template name="Doc">
        <schema>type Input = {}; type Output = {};</schema>
        <snippet name="invalidSnippet" is="true">
          Body
        </snippet>
        <system><insert snippet="invalidSnippet"/></system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Doc.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "'is' can only be used with an accompanying 'if' attribute",
        },
      ],
    });
  });

  it("reports an error when snippet has both 'if' and 'switch' attributes", () => {
    const root = parseElement(`
      <template name="Doc">
        <schema>type Input = { x: boolean; y: string; }; type Output = {};</schema>
        <snippet name="bothSnippet" if="input.x" switch="input.y">
          Body
        </snippet>
        <system><insert snippet="bothSnippet"/></system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Doc.xml")).toMatch({
      kind: "error",
      errors: [
        { message: "Cannot have both 'if' and 'switch' attributes" },
        { message: "Cannot have both 'if' and 'switch' attributes" },
      ],
    });
  });

  it("reports an error when snippet-if is missing <else> branch", () => {
    const root = parseElement(`
      <template name="Doc">
        <schema>type Input = { x: boolean; }; type Output = {};</schema>
        <snippet name="ifOnlyThen" if="input.x">
          <then>Only then</then>
        </snippet>
        <system><insert snippet="ifOnlyThen"/></system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Doc.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <else> element in <snippet if='...'>",
        },
      ],
    });
  });

  it("reports an error when snippet-switch has duplicate case values", () => {
    const root = parseElement(`
      <template name="Doc">
        <schema>type Input = { mode: string; }; type Output = {};</schema>
        <snippet name="switchDup" switch="input.mode">
          <on case="a">Branch A</on>
          <on case="a">Branch A again</on>
        </snippet>
        <system><insert snippet="switchDup"/></system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Doc.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Duplicate case 'a'",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseTemplate - snippet verification
// ---------------------------------------------------------------------------

describe("parseTemplate - snippet verification", () => {
  it("reports an error when a referenced snippet does not exist", () => {
    const root = parseElement(`
      <template name="Doc">
        <schema>type Input = {}; type Output = {};</schema>
        <system><insert snippet="nonExistentSnippet"/></system>
        <user>Usr</user>
        <snippet name="mySnippet">my snippet</snippet>
      </template>
    `);

    expect(parseTemplate(root, "Doc.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unknown snippet 'nonExistentSnippet'",
          suggestions: ["mySnippet"],
        },
      ],
    });
  });

  it("reports an error when a snippet circularly references itself", () => {
    const root = parseElement(`
      <template name="Doc">
        <schema>type Input = {}; type Output = {};</schema>
        <snippet name="snippetA">
          <insert snippet="snippetB"/>
        </snippet>
        <snippet name="snippetB">
          <insert snippet="snippetA"/>
        </snippet>
        <system><insert snippet="snippetA"/></system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Doc.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Snippet 'snippetA' circularly references itself",
        },
      ],
    });
  });

  it("reports an error when a snippet is defined but never used", () => {
    const root = parseElement(`
      <template name="Doc">
        <schema>type Input = {}; type Output = {};</schema>
        <snippet name="unusedSnippet">
          Never used content
        </snippet>
        <system>Sys</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "Doc.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Snippet 'unusedSnippet' is never used",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// parseTemplate - line break verification after formatted inserts
// ---------------------------------------------------------------------------

describe("parseTemplate - line break verification after formatted inserts", () => {
  it("succeeds when yaml/toon/csv/tsv formatted inserts are followed by newline", () => {
    const root = parseElement(`
      <template name="DataDoc">
        <schema>type Input = { data: string; }; type Output = {};</schema>
        <system>
          YAML data:
          <insert val="input.data" format="yaml"/>
          End of prompt
        </system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "DataDoc.xml")).toMatch({
      kind: "template",
      warnings: [],
    });
  });

  it("reports an error when a yaml insert is followed by text on the same line", () => {
    const root = parseElement(`
      <template name="DataDoc">
        <schema>type Input = { data: string; }; type Output = {};</schema>
        <system>YAML: <insert val="input.data" format="yaml"/> next words on same line</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "DataDoc.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Must be followed by line break",
        },
      ],
    });
  });

  it("reports an error when a csv insert is followed by text on the same line", () => {
    const root = parseElement(`
      <template name="DataDoc">
        <schema>type Input = { data: string; }; type Output = {};</schema>
        <system>CSV: <insert val="input.data" format="csv"/> trailing text</system>
        <user>Usr</user>
      </template>
    `);

    expect(parseTemplate(root, "DataDoc.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Must be followed by line break",
        },
      ],
    });
  });
});
