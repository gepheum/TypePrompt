import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type {
  Body,
  Snippet,
  ValidCompilationResult,
} from "@typeprompt/core/compiler/compiler-types.js";
import type { Expression } from "@typeprompt/core/expression/expression-types.js";
import { EMPTY_SCHEMA } from "@typeprompt/core/schema/empty-schema.js";
import { parseSchema } from "@typeprompt/core/schema/schema-parser.js";
import type { Schema } from "@typeprompt/core/schema/schema-types.js";
import { validateSchema } from "@typeprompt/core/schema/schema-validator.js";
import type { TextSpan } from "@typeprompt/core/util/shared-types.js";
import { compile } from "./compiler.js";
import { makeTemplateOverrides, makeTemplates } from "./spec-maker.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function span<T extends string>(text: T): TextSpan<T> {
  return { text, start: 0, end: text.length, path: "" };
}

function str(value: string): {
  kind: "string";
  firstToken: { start: number; end: number };
  value: string;
  quoted: boolean;
} {
  return {
    kind: "string" as const,
    firstToken: { start: 0, end: value.length + 2 },
    value,
    quoted: true,
  };
}

function jsonObj(entries: Record<string, unknown>): unknown {
  return {
    kind: "object" as const,
    firstToken: { start: 0, end: 1 },
    entries: Object.fromEntries(
      Object.entries(entries).map(([key, value]) => [
        key,
        { key: str(key), value },
      ]),
    ),
  };
}

function jsonArr(elements: unknown[]): unknown {
  return {
    kind: "array" as const,
    firstToken: { start: 0, end: 1 },
    elements,
  };
}

const TEST_SCHEMA: Schema = ((): Schema => {
  const parsed = parseSchema(
    {
      path: "schema.ts",
      text: "type Input = string\ntype Output = string",
      offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
    },
    "template",
  );
  if (parsed.kind !== "success") throw new Error("parse failed");
  const schema = validateSchema(parsed, EMPTY_SCHEMA);
  if (schema.kind !== "success") throw new Error("validation failed");
  return schema;
})();

/** Minimal valid compilation result with no templates, tools, or source files. */
function emptyResult(): ValidCompilationResult {
  return {
    metaSchema: EMPTY_SCHEMA,
    sourceFiles: {},
    namespaces: {},
    templates: {},
    tools: {},
    finalErrors: {},
  } as unknown as ValidCompilationResult;
}

function emptyBody(): Body {
  return [];
}

// ---------------------------------------------------------------------------
// makeTemplates - empty result
// ---------------------------------------------------------------------------

describe("makeTemplates - empty result", () => {
  it("produces empty templates, tools, and sourceFiles maps", () => {
    expect(makeTemplates(emptyResult())).toMatch({
      templates: {},
      tools: {},
      sourceFiles: {},
    });
  });
});

// ---------------------------------------------------------------------------
// makeTemplates - source files
// ---------------------------------------------------------------------------

describe("makeTemplates - source files", () => {
  it("passes source file content through keyed by path", () => {
    const result = {
      ...emptyResult(),
      sourceFiles: {
        "a.tp": { content: "<template/>" },
        "b.tp": { content: "<tool/>" },
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      sourceFiles: { "a.tp": "<template/>", "b.tp": "<tool/>" },
    });
  });
});

// ---------------------------------------------------------------------------
// makeTemplates - tool
// ---------------------------------------------------------------------------

describe("makeTemplates - tool", () => {
  function makeToolResult(name: string, descriptionText: string): unknown {
    return {
      kind: "success" as const,
      schema: TEST_SCHEMA,
      tool: {
        kind: "success" as const,
        name: span(name),
        namespace: null,
        description: [{ kind: "text" as const, text: descriptionText }],
        schema: null,
      },
    };
  }

  it("sets id, name, and description from the tool", () => {
    const result = {
      ...emptyResult(),
      tools: { "Main:search": makeToolResult("search", "Search the web") },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      tools: {
        "Main:search": {
          id: "Main:search",
          name: "search",
          description: "Search the web",
        },
      },
    });
  });

  it("concatenates multi-piece descriptions", () => {
    const toolResult = {
      kind: "success" as const,
      schema: TEST_SCHEMA,
      tool: {
        kind: "success" as const,
        name: span("tool"),
        namespace: null,
        description: [
          { kind: "text" as const, text: "Hello" },
          { kind: "text" as const, text: " world" },
        ],
        schema: null,
      },
    };
    const result = {
      ...emptyResult(),
      tools: { "Main:tool": toolResult },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      tools: { "Main:tool": { description: "Hello world" } },
    });
  });

  it("includes inputJsonSchema for tools", () => {
    const result = {
      ...emptyResult(),
      tools: { "Main:search": makeToolResult("search", "") },
    } as unknown as ValidCompilationResult;
    const spec = makeTemplates(result);
    expect(spec.tools["Main:search"]!.inputJsonSchema).toMatch({
      type: "string",
    });
  });
});

// ---------------------------------------------------------------------------
// makeTemplates - template: basic fields
// ---------------------------------------------------------------------------

describe("makeTemplates - template basic fields", () => {
  function minimalTemplate(
    name: string,
    namespace: string | null,
    outputFormat: string | null,
  ): unknown {
    return {
      kind: "success" as const,
      schema: TEST_SCHEMA,
      tools: {},
      template: {
        kind: "success" as const,
        name: span(name),
        namespace: namespace ? span(namespace) : null,
        outputFormat: outputFormat
          ? span(outputFormat as "json" | "text")
          : null,
        contents: {
          kind: "no-variants" as const,
          content: {
            meta: undefined,
            system: emptyBody(),
            user: emptyBody(),
            examples: undefined,
          },
        },
        snippets: [],
        tools: null,
        schema: null,
        tag: { start: 0, end: 0 },
      },
    };
  }

  it("copies name and namespace from the template", () => {
    const result = {
      ...emptyResult(),
      templates: { "Geo:Greet": minimalTemplate("Greet", "Geo", null) },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: { "Geo:Greet": { name: "Greet", namespace: "Geo" } },
    });
  });

  it("defaults namespace to 'Main' when null", () => {
    const result = {
      ...emptyResult(),
      templates: { "Main:Hello": minimalTemplate("Hello", null, null) },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: { "Main:Hello": { namespace: "Main" } },
    });
  });

  it("copies outputFormat when specified", () => {
    const result = {
      ...emptyResult(),
      templates: { "Main:T": minimalTemplate("T", null, "text") },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: { "Main:T": { outputFormat: "text" } },
    });
  });

  it("defaults outputFormat to 'json' when null", () => {
    const result = {
      ...emptyResult(),
      templates: { "Main:T": minimalTemplate("T", null, null) },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: { "Main:T": { outputFormat: "json" } },
    });
  });

  it("produces the tool id as namespace:toolName", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Geo:T": {
          kind: "success" as const,
          schema: TEST_SCHEMA,
          tools: {
            myTool: {
              tool: {
                kind: "success" as const,
                schema: TEST_SCHEMA,
                tool: {
                  kind: "success" as const,
                  name: span("search"),
                  namespace: null,
                  description: [],
                  schema: null,
                },
              },
            },
          },
          template: {
            kind: "success" as const,
            name: span("T"),
            namespace: span("Geo"),
            outputFormat: null,
            contents: {
              kind: "no-variants" as const,
              content: {
                meta: undefined,
                system: emptyBody(),
                user: emptyBody(),
                examples: undefined,
              },
            },
            snippets: [],
            tools: null,
            schema: null,
            tag: { start: 0, end: 0 },
          },
        },
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Geo:T": { tools: [{ id: "Geo:search", name: "myTool" }] },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// makeTemplates - contents: no-variants vs variants
// ---------------------------------------------------------------------------

describe("makeTemplates - contents", () => {
  function templateWithContents(contents: unknown): unknown {
    return {
      kind: "success" as const,
      schema: TEST_SCHEMA,
      tools: {},
      template: {
        kind: "success" as const,
        name: span("T"),
        namespace: span("Main"),
        outputFormat: null,
        contents,
        snippets: [],
        tools: null,
        schema: null,
        tag: { start: 0, end: 0 },
      },
    };
  }

  it("wraps no-variants content in kind 'noVariants'", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithContents({
          kind: "no-variants",
          content: {
            meta: undefined,
            system: emptyBody(),
            user: emptyBody(),
            examples: undefined,
          },
        }),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: { "Main:T": { contents: { kind: "no-variants" } } },
    });
  });

  it("wraps variants content in kind 'variants' with a defaultContent", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithContents({
          kind: "variants",
          variants: [
            {
              case: span("dark"),
              content: {
                meta: undefined,
                system: emptyBody(),
                user: emptyBody(),
                examples: undefined,
              },
            },
          ],
          defaultContent: {
            meta: undefined,
            system: emptyBody(),
            user: emptyBody(),
            examples: undefined,
          },
        }),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": {
          contents: {
            kind: "variants",
            variants: { dark: {} },
            defaultContent: {},
          },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// makeTemplates - body pieces
// ---------------------------------------------------------------------------

describe("makeTemplates - body pieces", () => {
  function templateWithUserBody(pieces: Body): unknown {
    return {
      kind: "success" as const,
      schema: TEST_SCHEMA,
      tools: {},
      template: {
        kind: "success" as const,
        name: span("T"),
        namespace: span("Main"),
        outputFormat: null,
        contents: {
          kind: "no-variants",
          content: {
            meta: undefined,
            system: emptyBody(),
            user: pieces,
            examples: undefined,
          },
        },
        snippets: [],
        tools: null,
        schema: null,
        tag: { start: 0, end: 0 },
      },
    };
  }

  it("converts 'text' pieces directly", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithUserBody([{ kind: "text", text: "Hello!" }]),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": {
          contents: { content: { user: [{ kind: "text", text: "Hello!" }] } },
        },
      },
    });
  });

  it("converts 'c-tag' pieces to text pieces", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithUserBody([
          {
            kind: "c-tag",
            text: "myTag",
            cTag: { kind: "identifier" as const, identifier: span("myTag") },
          },
        ]),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": {
          contents: { content: { user: [{ kind: "text", text: "myTag" }] } },
        },
      },
    });
  });

  it("converts 'insert-val' pieces with an expression and default format", () => {
    const inputExpr: Expression<false> = {
      kind: "input",
      fullPath: span("input"),
    };
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithUserBody([
          {
            kind: "insert-val",
            val: inputExpr,
            format: null,
            indent: "",
            tag: { start: 0, end: 0, path: "" },
          },
        ]),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": {
          contents: {
            content: {
              user: [
                {
                  kind: "insert-val",
                  val: { kind: "input" },
                  format: "text",
                  indent: "",
                },
              ],
            },
          },
        },
      },
    });
  });

  it("uses the explicit format from an 'insert-val' piece", () => {
    const inputExpr: Expression<false> = {
      kind: "input",
      fullPath: span("input"),
    };
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithUserBody([
          {
            kind: "insert-val",
            val: inputExpr,
            format: span("json"),
            indent: "  ",
            tag: { start: 0, end: 0, path: "" },
          },
        ]),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": {
          contents: {
            content: {
              user: [{ kind: "insert-val", format: "json", indent: "  " }],
            },
          },
        },
      },
    });
  });

  it("converts 'insert-snippet' pieces", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithUserBody([
          {
            kind: "insert-snippet",
            snippet: span("header"),
            indent: "    ",
            tag: { start: 0, end: 0, path: "" },
          },
        ]),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": {
          contents: {
            content: {
              user: [
                { kind: "insert-snippet", snippet: "header", indent: "    " },
              ],
            },
          },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// makeTemplates - expressions
// ---------------------------------------------------------------------------

describe("makeTemplates - expressions", () => {
  function templateWithExprPiece(val: Expression<false>): unknown {
    return {
      kind: "success" as const,
      schema: TEST_SCHEMA,
      tools: {},
      template: {
        kind: "success" as const,
        name: span("T"),
        namespace: span("Main"),
        outputFormat: null,
        contents: {
          kind: "no-variants",
          content: {
            meta: undefined,
            system: emptyBody(),
            user: [{ kind: "insert-val", val, format: null, indent: "" }],
            examples: undefined,
          },
        },
        snippets: [],
        tools: null,
        schema: null,
        tag: { start: 0, end: 0 },
      },
    };
  }

  function getVal(result: ReturnType<typeof makeTemplates>): unknown {
    const tmpl = result.templates["Main:T"]!;
    const content = (
      tmpl.contents as { content: { user: readonly { val: unknown }[] } }
    ).content;
    return content.user[0]!.val;
  }

  it("converts 'input' expression to { kind: 'input' }", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithExprPiece({
          kind: "input",
          fullPath: span("input"),
        }),
      },
    } as unknown as ValidCompilationResult;
    expect(getVal(makeTemplates(result))).toMatch({
      kind: "input",
    });
  });

  it("converts 'property' expression recursively", () => {
    const expr: Expression<false> = {
      kind: "property",
      left: { kind: "input", fullPath: span("input") },
      property: span("name"),
      fullPath: span("input.name"),
    };
    const result = {
      ...emptyResult(),
      templates: { "Main:T": templateWithExprPiece(expr) },
    } as unknown as ValidCompilationResult;
    expect(getVal(makeTemplates(result))).toMatch({
      kind: "property",
      left: { kind: "input" },
      property: "name",
    });
  });
});

// ---------------------------------------------------------------------------
// makeTemplates - snippets
// ---------------------------------------------------------------------------

describe("makeTemplates - snippets", () => {
  function templateWithSnippets(snippets: readonly Snippet[]): unknown {
    return {
      kind: "success" as const,
      schema: TEST_SCHEMA,
      tools: {},
      template: {
        kind: "success" as const,
        name: span("T"),
        namespace: span("Main"),
        outputFormat: null,
        contents: {
          kind: "no-variants",
          content: {
            meta: undefined,
            system: emptyBody(),
            user: emptyBody(),
            examples: undefined,
          },
        },
        snippets,
        tools: null,
        schema: null,
        tag: { start: 0, end: 0 },
      },
    };
  }

  it("converts a plain 'snippet'", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithSnippets([
          {
            kind: "snippet",
            name: span("header"),
            body: [{ kind: "text", text: "Hi" }],
          },
        ]),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": {
          snippets: {
            header: { kind: "snippet", body: [{ kind: "text", text: "Hi" }] },
          },
        },
      },
    });
  });

  it("converts a 'snippet-if' with no 'is' clause (defaults to 'true')", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithSnippets([
          {
            kind: "snippet-if",
            name: span("maybeFooter"),
            expression: { kind: "input" as const, fullPath: span("input") },
            is: null,
            then: [{ kind: "text", text: "Yes" }],
            else: [{ kind: "text", text: "No" }],
          },
        ]),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": {
          snippets: {
            maybeFooter: {
              kind: "snippet-if",
              is: "true",
              then: [{ kind: "text", text: "Yes" }],
              else: [{ kind: "text", text: "No" }],
            },
          },
        },
      },
    });
  });

  it("converts a 'snippet-if' with an explicit 'is' clause", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithSnippets([
          {
            kind: "snippet-if",
            name: span("s"),
            expression: { kind: "input" as const, fullPath: span("input") },
            is: span("notNull"),
            then: emptyBody(),
            else: emptyBody(),
          },
        ]),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": { snippets: { s: { kind: "snippet-if", is: "not-null" } } },
      },
    });
  });

  it("converts a 'snippet-switch' with branches keyed by case value", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithSnippets([
          {
            kind: "snippet-switch",
            name: span("theme"),
            switchTag: { start: 0, end: 0, path: "" },
            expression: { kind: "input" as const, fullPath: span("input") },
            branches: [
              {
                case: span("dark"),
                body: [{ kind: "text", text: "Dark mode" }],
              },
              {
                case: span("light"),
                body: [{ kind: "text", text: "Light mode" }],
              },
            ],
          },
        ]),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": {
          snippets: {
            theme: {
              kind: "snippet-switch",
              branches: {
                dark: [{ kind: "text", text: "Dark mode" }],
                light: [{ kind: "text", text: "Light mode" }],
              },
            },
          },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// makeTemplates - meta and examples
// ---------------------------------------------------------------------------

describe("makeTemplates - meta and examples", () => {
  function templateWithContent(content: unknown): unknown {
    return {
      kind: "success" as const,
      schema: TEST_SCHEMA,
      tools: {},
      template: {
        kind: "success" as const,
        name: span("T"),
        namespace: span("Main"),
        outputFormat: null,
        contents: { kind: "no-variants", content },
        snippets: [],
        tools: null,
        schema: null,
        tag: { start: 0, end: 0 },
      },
    };
  }

  it("unwraps a JSON meta value", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithContent({
          meta: {
            value: jsonObj({
              temperature: {
                kind: "number",
                firstToken: { start: 0, end: 1 },
                value: 0.5,
              },
            }),
          },
          system: emptyBody(),
          user: emptyBody(),
          examples: undefined,
        }),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": { contents: { content: { meta: { temperature: 0.5 } } } },
      },
    });
  });

  it("produces no meta when the content has no meta field", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithContent({
          meta: undefined,
          system: emptyBody(),
          user: emptyBody(),
          examples: undefined,
        }),
      },
    } as unknown as ValidCompilationResult;
    const spec = makeTemplates(result);
    expect(spec.templates["Main:T"]!.contents).toMatch({ content: {} });
    expect((spec.templates["Main:T"]!.contents as any).content.meta).toBe(
      undefined,
    );
  });

  it("converts few-shot examples from JSON", () => {
    const examplesJson = jsonArr([
      jsonObj({
        input: jsonObj({ prompt: str("hi") }),
        output: str("hello"),
        steps: jsonArr([]),
      }),
    ]);
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithContent({
          meta: undefined,
          system: emptyBody(),
          user: emptyBody(),
          examples: examplesJson,
        }),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": {
          contents: {
            content: {
              examples: [
                {
                  input: { prompt: "hi" },
                  output: "hello",
                  steps: [],
                },
              ],
            },
          },
        },
      },
    });
  });

  it("converts few-shot examples with intermediate tool-call steps", () => {
    const examplesJson = jsonArr([
      jsonObj({
        input: str("q"),
        output: str("a"),
        steps: jsonArr([
          jsonObj({
            toolCalls: jsonArr([
              jsonObj({
                callId: str("c1"),
                tool: str("search"),
                input: jsonObj({ query: str("q") }),
                output: str("result"),
              }),
            ]),
          }),
        ]),
      }),
    ]);
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithContent({
          meta: undefined,
          system: emptyBody(),
          user: emptyBody(),
          examples: examplesJson,
        }),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: {
        "Main:T": {
          contents: {
            content: {
              examples: [
                {
                  input: "q",
                  output: "a",
                  steps: [
                    {
                      toolCalls: [
                        {
                          callId: "c1",
                          toolId: "Main:search",
                          toolName: "search",
                          input: { query: "q" },
                          output: "result",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    });
  });

  it("produces an empty examples array when examples is undefined", () => {
    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": templateWithContent({
          meta: undefined,
          system: emptyBody(),
          user: emptyBody(),
          examples: undefined,
        }),
      },
    } as unknown as ValidCompilationResult;
    expect(makeTemplates(result)).toMatch({
      templates: { "Main:T": { contents: { content: { examples: [] } } } },
    });
  });
});

// ---------------------------------------------------------------------------
// makeTemplates - JSON schemas
// ---------------------------------------------------------------------------

describe("makeTemplates - JSON schemas", () => {
  it("includes JSON schemas", () => {
    const schemaSource = "type Input = string\ntype Output = number";
    const sourceSpan = {
      path: "schema.ts",
      text: schemaSource,
      offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
    };
    const parsed = parseSchema(sourceSpan, "template");
    if (parsed.kind !== "success") throw new Error("parse failed");
    const schema = validateSchema(parsed, EMPTY_SCHEMA);
    if (schema.kind !== "success") throw new Error("validation failed");

    const result = {
      ...emptyResult(),
      templates: {
        "Main:T": {
          kind: "success" as const,
          schema,
          tools: {},
          template: {
            kind: "success" as const,
            name: span("T"),
            namespace: span("Main"),
            outputFormat: null,
            contents: {
              kind: "no-variants",
              content: {
                meta: undefined,
                system: emptyBody(),
                user: emptyBody(),
                examples: undefined,
              },
            },
            snippets: [],
            tools: null,
            schema: null,
            tag: { start: 0, end: 0 },
          },
        },
      },
    } as unknown as ValidCompilationResult;

    const spec = makeTemplates(result);
    expect(spec.templates["Main:T"]!.outputJsonSchema).toMatch({
      type: "number",
    });
  });
});

describe("makeTemplateOverrides", () => {
  const baseFiles = {
    "prompts/Translate.tp": `
      <template name="Translate">
        <schema>
          type Input = { text: string; };
          type Output = string;
        </schema>
        <system>Translate base system</system>
        <user>Translate: <insert val="input.text" /></user>
      </template>
    `,
    "prompts/Summarize.tp": `
      <template name="Summarize">
        <schema>
          type Input = { doc: string; };
          type Output = string;
        </schema>
        <system>Summarize base system</system>
        <user>Summarize: <insert val="input.doc" /></user>
      </template>
    `,
    "prompts/calculator.tp": `
      <tool name="calculator">
        <description>Performs math calculations</description>
        <schema>
          type Input = { expr: string; };
          type Output = { result: number; };
        </schema>
      </tool>
    `,
    "prompts/fetchUrl.tp": `
      <tool name="fetchUrl">
        <description>Fetches URL content</description>
        <schema>
          type Input = { url: string; };
          type Output = { content: string; };
        </schema>
      </tool>
    `,
  };

  it("returns empty templates, tools, and sourceFiles when no files are modified", () => {
    const baseResult = compile(baseFiles, {
      cache: null,
      patchBase: null,
    }) as ValidCompilationResult;
    expect(baseResult.anyErrors).toBe(false);

    const overrideFiles = { ...baseFiles };
    const overrideResult = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    }) as ValidCompilationResult & {
      readonly patchBase: ValidCompilationResult;
    };
    expect(overrideResult.anyErrors).toBe(false);

    const overrides = makeTemplateOverrides(overrideResult);
    expect(overrides.edition).toBe(0);
    expect(overrides.signature).toBe(baseResult.signature);
    expect(Object.keys(overrides.sourceFiles).length).toBe(0);
    expect(Object.keys(overrides.templates).length).toBe(0);
    expect(Object.keys(overrides.tools).length).toBe(0);
  });

  it("includes only modified templates and tools in overrides output", () => {
    const baseResult = compile(baseFiles, {
      cache: null,
      patchBase: null,
    }) as ValidCompilationResult;
    expect(baseResult.anyErrors).toBe(false);

    const overrideFiles = {
      ...baseFiles,
      "prompts/Translate.tp": `
        <template name="Translate">
          <schema>
            type Input = { text: string; };
            type Output = string;
          </schema>
          <system>Custom translation prompt override</system>
          <user>Translate: <insert val="input.text" /></user>
        </template>
      `,
      "prompts/calculator.tp": `
        <tool name="calculator">
          <description>Updated calculator description override</description>
          <schema>
            type Input = { expr: string; };
            type Output = { result: number; };
          </schema>
        </tool>
      `,
    };

    const overrideResult = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    }) as ValidCompilationResult & {
      readonly patchBase: ValidCompilationResult;
    };
    expect(overrideResult.anyErrors).toBe(false);

    const overrides = makeTemplateOverrides(overrideResult);

    expect(overrides.edition).toBe(0);
    expect(overrides.signature).toBe(baseResult.signature);

    // Only the two modified files should be in sourceFiles
    expect(Object.keys(overrides.sourceFiles).sort()).toMatch([
      "prompts/Translate.tp",
      "prompts/calculator.tp",
    ]);

    // Only Translate template should be present, not Summarize
    expect(Object.keys(overrides.templates)).toMatch(["Main:Translate"]);
    expect(overrides.templates["Main:Translate"]!.name).toBe("Translate");
    expect(overrides.templates["Main:Summarize"]).toBe(undefined);

    // Only calculator tool should be present, not fetchUrl
    expect(Object.keys(overrides.tools)).toMatch(["Main:calculator"]);
    expect(overrides.tools["Main:calculator"]!.description).toBe(
      "Updated calculator description override",
    );
    expect(overrides.tools["Main:fetchUrl"]).toBe(undefined);
  });

  it("handles multi-namespace projects and sets singleNamespace=false", () => {
    const multiNamespaceBase = {
      "prompts/Billing/shared.tp": `
        <namespace name="Billing">
          interface Invoice { id: string; amount: number; }
        </namespace>
      `,
      "prompts/Billing/SendInvoice.tp": `
        <template name="SendInvoice" namespace="Billing">
          <schema>
            type Input = { invoiceId: string; };
            type Output = string;
          </schema>
          <system>Billing system</system>
          <user>Send invoice <insert val="input.invoiceId" /></user>
        </template>
      `,
      "prompts/Auth/shared.tp": `
        <namespace name="Auth">
          type Token = string;
        </namespace>
      `,
      "prompts/Auth/Login.tp": `
        <template name="Login" namespace="Auth">
          <schema>
            type Input = string;
            type Output = string;
          </schema>
          <system>Auth system</system>
          <user>Login</user>
        </template>
      `,
    };

    const baseResult = compile(multiNamespaceBase, {
      cache: null,
      patchBase: null,
    }) as ValidCompilationResult;
    expect(baseResult.anyErrors).toBe(false);
    expect(baseResult.singleNamespace).toBe(null);

    const overrideFiles = {
      ...multiNamespaceBase,
      "prompts/Billing/SendInvoice.tp": `
        <template name="SendInvoice" namespace="Billing">
          <schema>
            type Input = { invoiceId: string; };
            type Output = string;
          </schema>
          <system>Updated billing prompt</system>
          <user>Send invoice <insert val="input.invoiceId" /></user>
        </template>
      `,
    };

    const overrideResult = compile(overrideFiles, {
      cache: null,
      patchBase: baseResult,
    }) as ValidCompilationResult & {
      readonly patchBase: ValidCompilationResult;
    };
    expect(overrideResult.anyErrors).toBe(false);

    const overrides = makeTemplateOverrides(overrideResult);
    expect(overrides.signature).toBe(baseResult.signature);
    expect(Object.keys(overrides.sourceFiles)).toMatch([
      "prompts/Billing/SendInvoice.tp",
    ]);
    expect(Object.keys(overrides.templates)).toMatch(["Billing:SendInvoice"]);
    expect(overrides.templates["Billing:SendInvoice"]!.namespace).toBe(
      "Billing",
    );
    expect(overrides.templates["Auth:Login"]).toBe(undefined);
  });
});
