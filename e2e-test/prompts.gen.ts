// This file is auto-generated. Do not edit it directly.

import { encode as encodeToon } from "@toon-format/toon";
import YAML from "yaml";
import * as z from "zod";

export type Template<Input, Output> = {
  readonly make: (input: Input) => Prompt<Output, Input>;
};

export type Prompt<Output, Input = unknown> = {
  readonly meta: Meta;
  readonly systemInstructions: string;
  readonly userInstructions: string;
  readonly examples: readonly FewShotExample[];
  readonly outputFormat: OutputFormat<Output>;
  readonly templateId: TemplateId;
  readonly templateInput: Input;
};

export type FewShotExample = {
  readonly userInstructions: string;
  readonly assistantResponse: string;
};

export type OutputFormat<Output> =
  | {
      readonly kind: "json";
      readonly schema: z.ZodType<Output>;
    }
  | (Output extends string ? { readonly kind: "text" } : never);

export type PromptMaker = {
  readonly default: {
    readonly myTemplate: Template<$.Default.MyTemplate.Input, $.Default.MyTemplate.Output>;
  };
};

export type Meta = $.Meta.Meta;

export namespace $ {
  export namespace Meta {
    export type Meta = {
      /** Temperature setting for the template */
      readonly temperature: number;
      readonly foobar?: (
        | "foo"
        | "bar"
      );
    };
  }

  export namespace Default {
    export namespace MyTemplate {
      export type Input = {
        readonly firstName: string;
        readonly lastName: string;
        readonly fooToBar?: { [name: string]: number };
      };

      export type Output = {
        readonly x: number;
      };
    }
  }
}

export type TemplateId = (
  | "Default:MyTemplate"
);

const templateOutputSchemas = {
  "Default:MyTemplate": ((): z.ZodType<$.Default.MyTemplate.Output> => {
    const outputSchema: z.ZodType<$.Default.MyTemplate.Output> = z.object({
      x: z.int32(),
    });
    return outputSchema;
  })(),
} as const;

namespace Spec {
  export type Templates = {
    readonly signature: string;
    readonly templates: { [id: string]: Template };
  };

  export type Template = {
    readonly name: string;
    readonly namespace: string;
    readonly outputFormat: OutputFormat;
    readonly contents: TemplateContents;
    readonly snippets: { [name: string]: Snippet };
  };

  export type OutputFormat = (
    | "json"
    | "text"
  );

  export type TemplateContents = (
    | {
      readonly kind: "noVariants";
      readonly content: TemplateContent;
    }
    | {
      readonly kind: "variants";
      readonly variants: { [c: string]: TemplateContent };
      readonly defaultContent: TemplateContent;
    }
  );

  export type TemplateContent = {
    readonly meta?: unknown;
    readonly system?: Body;
    readonly user?: Body;
    readonly examples?: readonly {
      readonly input: unknown;
      readonly output: unknown;
    }[];
  };

  export type Body = readonly BodyPiece[];

  export type BodyPiece = (
    | {
      readonly kind: "text";
      readonly text: string;
    }
    | {
      readonly kind: "insertVal";
      readonly val: Expression;
      readonly format: InsertFormat;
      readonly indent: string;
    }
    | {
      readonly kind: "insertSnippet";
      /** Snippet name. */
      readonly snippet: string;
      /** Only contains whitespace characters. */
      readonly indent: string;
    }
  );

  export type InsertFormat = (
    | "text"
    | "json"
    | "yaml"
    | "toon"
    | "csv"
    | "tsv"
  );

  export type Expression = (
    | {
      readonly kind: "input";
    }
    | {
      readonly kind: "property";
      readonly left: Expression;
      readonly property: string;
    }
  );

  export type Snippet = (
    | {
      readonly kind: "snippet";
      readonly body: Body;
    }
    | {
      readonly kind: "snippetIf";
      readonly expression: Expression;
      readonly is: (
        | "notNull"
        | "notEmpty"
        | "true"
      );
      readonly then: Body;
      readonly else: Body;
    }
    | {
      readonly kind: "snippetSwitch";
      readonly expression: Expression;
      readonly branches: { [c: string]: Body };
    }
  );
}

const templatesSchema = ((): z.ZodType<Spec.Templates> => {
  const outputFormatSchema: z.ZodType<Spec.OutputFormat> = z.union([
    z.literal("json"),
    z.literal("text"),
  ]);
  const expressionSchema: z.ZodType<Spec.Expression> = z.union([
    z.object({
      kind: z.literal("input"),
    }),
    z.object({
      kind: z.literal("property"),
      left: z.lazy((): z.ZodType<Spec.Expression> => expressionSchema),
      property: z.string(),
    }),
  ]);
  const insertFormatSchema: z.ZodType<Spec.InsertFormat> = z.union([
    z.literal("text"),
    z.literal("json"),
    z.literal("yaml"),
    z.literal("toon"),
    z.literal("csv"),
    z.literal("tsv"),
  ]);
  const bodyPieceSchema: z.ZodType<Spec.BodyPiece> = z.union([
    z.object({
      kind: z.literal("text"),
      text: z.string(),
    }),
    z.object({
      kind: z.literal("insertVal"),
      val: expressionSchema,
      format: insertFormatSchema,
      indent: z.string(),
    }),
    z.object({
      kind: z.literal("insertSnippet"),
      snippet: z.string().describe("Snippet name."),
      indent: z.string().describe("Only contains whitespace characters."),
    }),
  ]);
  const bodySchema: z.ZodType<Spec.Body> = bodyPieceSchema.array();
  const templateContentSchema: z.ZodType<Spec.TemplateContent> = z.object({
    meta: z.any().optional(),
    system: bodySchema.optional(),
    user: bodySchema.optional(),
    examples: z.object({
      input: z.any(),
      output: z.any(),
    }).array().optional(),
  });
  const templateContentsSchema: z.ZodType<Spec.TemplateContents> = z.union([
    z.object({
      kind: z.literal("noVariants"),
      content: templateContentSchema,
    }),
    z.object({
      kind: z.literal("variants"),
      variants: z.record(
        z.string(),
        templateContentSchema,
      ),
      defaultContent: templateContentSchema,
    }),
  ]);
  const snippetSchema: z.ZodType<Spec.Snippet> = z.union([
    z.object({
      kind: z.literal("snippet"),
      body: bodySchema,
    }),
    z.object({
      kind: z.literal("snippetIf"),
      expression: expressionSchema,
      is: z.union([
        z.literal("notNull"),
        z.literal("notEmpty"),
        z.literal("true"),
      ]),
      then: bodySchema,
      else: bodySchema,
    }),
    z.object({
      kind: z.literal("snippetSwitch"),
      expression: expressionSchema,
      branches: z.record(
        z.string(),
        bodySchema,
      ),
    }),
  ]);
  const templateSchema: z.ZodType<Spec.Template> = z.object({
    name: z.string(),
    namespace: z.string(),
    outputFormat: outputFormatSchema,
    contents: templateContentsSchema,
    snippets: z.record(
      z.string(),
      snippetSchema,
    ),
  });
  const templatesSchema: z.ZodType<Spec.Templates> = z.object({
    signature: z.string(),
    templates: z.record(
      z.string(),
      templateSchema,
    ),
  });
  return templatesSchema;
})();

const TEMPLATES_DATA: Spec.Templates = {
  "signature": "",
  "templates": {
    "Default.MyTemplate": {
      "name": "MyTemplate",
      "namespace": "Default",
      "outputFormat": "text",
      "contents": {
        "kind": "noVariants",
        "content": {
          "meta": {
            "temperature": 0.7,
            "foobar": "bar"
          },
          "system": [
            {
              "kind": "insertSnippet",
              "snippet": "greet",
              "indent": ""
            },
            {
              "kind": "text",
              "text": "\n\nHow many characters are in your full name?"
            }
          ],
          "user": [
            {
              "kind": "text",
              "text": "Your "
            },
            {
              "kind": "text",
              "text": " is: "
            },
            {
              "kind": "insertVal",
              "val": {
                "kind": "property",
                "left": {
                  "kind": "input"
                },
                "property": "firstName"
              },
              "format": "text",
              "indent": ""
            },
            {
              "kind": "text",
              "text": "\nYour "
            },
            {
              "kind": "text",
              "text": " is: "
            },
            {
              "kind": "insertVal",
              "val": {
                "kind": "property",
                "left": {
                  "kind": "input"
                },
                "property": "lastName"
              },
              "format": "text",
              "indent": ""
            },
            {
              "kind": "text",
              "text": "\n\nFor example "
            }
          ],
          "examples": [
            {
              "input": {
                "firstName": "John",
                "lastName": "Doe"
              },
              "output": {
                "x": 8
              }
            },
            {
              "input": {
                "firstName": "Jane",
                "lastName": "Smith"
              },
              "output": {
                "x": 9
              }
            }
          ]
        }
      },
      "snippets": {
        "greet": {
          "kind": "snippet",
          "body": [
            {
              "kind": "text",
              "text": "Hello,\n"
            }
          ]
        }
      }
    }
  }
} as const;


export function newPromptMaker(): PromptMaker {
  return newPromptMakerImpl(TEMPLATES_DATA);
}

function newPromptMakerImpl(templates: Spec.Templates): PromptMaker {
  const result: {
    [namespace: string]: {
      [name: string]: Template<unknown, unknown>;
    };
  } = {};
  for (const [templateId, templateSpec] of Object.entries(
    templates.templates,
  )) {
    const namespace = uncapitalize(templateSpec.namespace);
    const name = uncapitalize(templateSpec.name);
    (result[namespace] ??= {})[name] = {
      make: (input: unknown) =>
        resolveTemplate(templateId as TemplateId, templates, input),
    };
  }
  return result as PromptMaker;
}

export function parseResponse<Output>(
  response: string,
  outputFormat: OutputFormat<Output>,
): Output {
  switch (outputFormat.kind) {
    case "json": {
      response = response.trim();
      response = response.startsWith("```")
        ? response.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, "$1").trim()
        : response;
      return outputFormat.schema.parse(JSON.parse(response));
    }
    case "text": {
      return response as Output;
    }
  }
}

function resolveTemplate<Input, Output>(
  templateId: TemplateId,
  templates: Spec.Templates,
  input: Input,
): Prompt<Output, Input> {
  const template = templates.templates[templateId];
  if (!template) {
    throw new Error("Template not found: ".concat(templateId));
  }
  const { contents, snippets } = template;
  let meta: Meta;
  let systemInstructions: string;
  let userInstructions: string;
  let examples: readonly FewShotExample[];
  if (contents.kind === "noVariants") {
    const { content } = contents;
    meta = content.meta as Meta;
    systemInstructions = resolveBody(content.system!, input, snippets);
    userInstructions = resolveBody(content.user!, input, snippets);
    examples = resolveExamples(content.examples!, content.user!, template);
  } else {
    const { defaultContent, variants } = contents;
    const { variant } = input as { readonly variant: string };
    const variantContent = variants[variant]!;
    meta = (variantContent.meta ?? defaultContent.meta) as Meta;
    const system = (variantContent.system ?? defaultContent.system)!;
    const user = (variantContent.user ?? defaultContent.user)!;
    systemInstructions = resolveBody(system, input, snippets);
    userInstructions = resolveBody(user, input, snippets);
    examples = resolveExamples(
      (variantContent.examples ?? defaultContent.examples)!,
      user,
      template,
    );
  }
  const outputSchema = templateOutputSchemas[templateId];
  const outputFormat = (
    template.outputFormat === "json"
      ? { kind: "json", schema: outputSchema }
      : { kind: "text" }
  ) as OutputFormat<Output>;
  return {
    meta,
    systemInstructions,
    userInstructions,
    examples,
    outputFormat,
    templateId,
    templateInput: input,
  };
}

function resolveBody<Input>(
  body: Spec.Body,
  input: Input,
  snippets: { readonly [c: string]: Spec.Snippet },
): string {
  const resolvePiece = (piece: Spec.BodyPiece): string => {
    switch (piece.kind) {
      case "text": {
        return piece.text;
      }
      case "insertSnippet": {
        const snippet = snippets[piece.snippet];
        if (!snippet) {
          throw new Error("Snippet not found: ".concat(piece.snippet));
        }
        return indent(resolveSnippet(snippet, input, snippets), piece.indent);
      }
      case "insertVal": {
        const val = evaluate(input, piece.val);
        return indent(format(val, piece.format), piece.indent);
      }
    }
  };
  return body.map(resolvePiece).join("");
}

function resolveSnippet<Input>(
  snippet: Spec.Snippet,
  input: Input,
  snippets: { readonly [c: string]: Spec.Snippet },
): string {
  switch (snippet.kind) {
    case "snippet": {
      return resolveBody(snippet.body, input, snippets);
    }
    case "snippetIf": {
      const { expression, then: thenBody, else: elseBody } = snippet;
      const evalResult = evaluate(input, expression);
      const condition = ((): boolean => {
        switch (snippet.is) {
          case "notEmpty": {
            return (evalResult as { readonly length: number }).length > 0;
          }
          case "notNull": {
            return evalResult === undefined || evalResult === null;
          }
          case "true": {
            return !!evalResult;
          }
        }
      })();
      const body = condition ? thenBody : elseBody;
      return resolveBody(body, input, snippets);
    }
    case "snippetSwitch": {
      const { expression, branches } = snippet;
      const evalResult = evaluate(input, expression);
      const branch = branches[evalResult as string];
      if (!branch) {
        throw new Error("Branch not found: ".concat(evalResult as string));
      }
      return resolveBody(branch, input, snippets);
    }
  }
}

function indent(text: string, spaces: string): string {
  if (spaces.length <= 0) {
    return text;
  } else {
    return text.replace(/\n/g, "\n".concat(spaces));
  }
}

function evaluate<Input>(input: Input, expression: Spec.Expression): unknown {
  switch (expression.kind) {
    case "input": {
      return input;
    }
    case "property": {
      const { property } = expression;
      return (input as Record<string, unknown>)[property];
    }
  }
}

function resolveExamples(
  inputs: ReadonlyArray<{
    readonly input: unknown;
    readonly output: unknown;
  }>,
  body: Spec.Body,
  template: Spec.Template,
): readonly FewShotExample[] {
  return inputs.map(({ input, output }) => ({
    userInstructions: resolveBody(body, input, template.snippets),
    assistantResponse: format(output, template.outputFormat),
  }));
}

function format(input: unknown, format?: Spec.InsertFormat): string {
  switch (format) {
    case undefined:
    case "text": {
      return String(input);
    }
    case "json": {
      return JSON.stringify(input, undefined, 2);
    }
    case "yaml": {
      return YAML.stringify(input);
    }
    case "toon": {
      return encodeToon(input);
    }
    case "csv":
    case "tsv": {
      const separator = format === "csv" ? "," : "\t";
      const array = input as ReadonlyArray<{ [k: string]: string | number }>;
      if (array.length <= 0) {
        return "";
      }
      const firstElement = array[0]!;
      const headerRow = Object.keys(firstElement).join(separator);
      const rows: string[] = [
        headerRow,
        ...array.map((e) => {
          return Object.values(e)
            .map((cell) => {
              const str = String(cell);
              if (separator === ",") {
                // CSV per RFC 4180: wrap in double quotes if the cell contains a
                // double quote, a comma, a newline, or a carriage return.
                return /[",\n\r]/.test(str)
                  ? '"'.concat(str.replace(/"/g, '""')).concat('"')
                  : str;
              } else {
                // TSV: no standard quoting; escape special characters with
                // backslash so the value remains a single field.
                return str
                  .replace(/\\/g, "\\\\")
                  .replace(/\t/g, "\\t")
                  .replace(/\n/g, "\\n")
                  .replace(/\r/g, "\\r");
              }
            })
            .join(separator);
        }),
      ];
      return rows.join("\n");
    }
  }
}

function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
