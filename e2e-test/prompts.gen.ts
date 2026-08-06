// This file is auto-generated. Do not edit it directly.

import { encode as encodeToon } from "@toon-format/toon";
import YAML from "yaml";
import * as z from "zod";

export type PromptMaker = {
  readonly default: {
    readonly myTemplate: Template<"Default:MyTemplate">;
  };
};

export type Template<Id extends TemplateId> = {
  readonly make: (input: Input<Id>) => Prompt<Id>;
};

export type Prompt<Id extends TemplateId> = {
  readonly meta: Meta;
  readonly systemMessage: string;
  readonly userMessage: string;
  readonly examples: readonly FewShotExample[];
  readonly tools: Tools<Id>;
  readonly outputFormat: OutputFormat<Id>;
  readonly parseResponse: (content: string) => Output<Id>;
  readonly templateId: TemplateId;
  readonly templateInput: Input<Id>;
};

export type FewShotExample = {
  readonly userMessage: string;
  readonly intermediateSteps: readonly IntermediateStepExample[];
  readonly response: string;
};

export type IntermediateStepExample = {
  readonly toolCalls: readonly ToolCallExample[];
};

export type ToolCallExample = {
  readonly callId: string;
  readonly toolName: string;
  readonly description: string;
  readonly rawInput: unknown;
  readonly rawOutput: unknown;
};

export type OutputFormat<Id extends TemplateId> = OutputFormatType<Output<Id>>;
type OutputFormatType<Output> =
  | {
      readonly kind: "json";
      readonly schema: z.ZodType<Output>;
    }
  | (Output extends string ? { readonly kind: "text" } : never);

export type Tool<Id extends ToolId> = {
  readonly id: Id;
  readonly name: ToolName<Id>;
  readonly description: string;
  readonly inputSchema: z.ZodType<Input<Id>>;
  readonly outputSchema: z.ZodType<Output<Id>>;
};

export type Tools<Id extends TemplateId> = {
  [Name in keyof ToolsHelper<Id>]: ToolsHelper<Id>[Name] extends ToolId
    ? Tool<ToolsHelper<Id>[Name]>
    : never;
};

export type ToolImpls<Id extends TemplateId> = {
  [Name in keyof ToolsHelper<Id>]: ToolsHelper<Id>[Name] extends ToolId
    ? (
        input: Input<ToolsHelper<Id>[Name]>,
      ) => Promise<Output<ToolsHelper<Id>[Name]>>
    : never;
};

export type TemplateId = (
  | "Default:MyTemplate"
);

export type ToolId = (
  | "Default:getX"
);

export type Input<Id extends TemplateId | ToolId> = {
  "Default:MyTemplate": $.Default.MyTemplate.Input;
  "Default:getX": $.Default.getX.Input;
}[Id];

export type Output<Id extends TemplateId | ToolId> = {
  "Default:MyTemplate": $.Default.MyTemplate.Output;
  "Default:getX": $.Default.getX.Output;
}[Id];

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

const templateSchemas = {
  "Default:MyTemplate": {
    input: ((): z.ZodType<$.Default.MyTemplate.Input> => {
      const inputSchema: z.ZodType<$.Default.MyTemplate.Input> = z.object({
        firstName: z.string(),
        lastName: z.string(),
        fooToBar: z.record(
          z.string(),
          z.int32(),
        ).optional(),
      });
      return inputSchema;
    })(),
    output: ((): z.ZodType<$.Default.MyTemplate.Output> => {
      const outputSchema: z.ZodType<$.Default.MyTemplate.Output> = z.object({
        x: z.int32(),
      });
      return outputSchema;
    })(),
  },
} as const;

namespace Spec {
  export type Templates = {
    readonly signature: string;
    readonly templates: { [id: string]: Template };
    readonly tools: { [id: string]: Tool };
  };

  export type Template = {
    readonly name: string;
    readonly namespace: string;
    readonly outputFormat: OutputFormat;
    readonly tools: readonly TemplateTool[];
    readonly contents: TemplateContents;
    readonly snippets: { [name: string]: Snippet };
  };

  export type OutputFormat = (
    | "json"
    | "text"
  );

  export type TemplateTool = {
    readonly id: string;
    readonly name: string;
  };

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
    readonly examples?: readonly FewShotExample[];
  };

  export type FewShotExample = {
    readonly input: unknown;
    readonly output: unknown;
    readonly intermediateSteps: readonly {
      readonly toolCalls: readonly ToolCallExample[];
    }[];
  };

  export type ToolCallExample = {
    readonly callId: string;
    readonly toolId: string;
    readonly toolName: string;
    readonly input: unknown;
    readonly output: unknown;
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

  export type Tool = {
    readonly id: string;
    readonly name: string;
    readonly description: string;
  };

}

const templatesSchema = ((): z.ZodType<Spec.Templates> => {
  const outputFormatSchema: z.ZodType<Spec.OutputFormat> = z.union([
    z.literal("json"),
    z.literal("text"),
  ]);
  const templateToolSchema: z.ZodType<Spec.TemplateTool> = z.object({
    id: z.string(),
    name: z.string(),
  });
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
  const toolCallExampleSchema: z.ZodType<Spec.ToolCallExample> = z.object({
    callId: z.string(),
    toolId: z.string(),
    toolName: z.string(),
    input: z.any(),
    output: z.any(),
  });
  const fewShotExampleSchema: z.ZodType<Spec.FewShotExample> = z.object({
    input: z.any(),
    output: z.any(),
    intermediateSteps: z.object({
      toolCalls: toolCallExampleSchema.array(),
    }).array(),
  });
  const templateContentSchema: z.ZodType<Spec.TemplateContent> = z.object({
    meta: z.any().optional(),
    system: bodySchema.optional(),
    user: bodySchema.optional(),
    examples: fewShotExampleSchema.array().optional(),
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
    tools: templateToolSchema.array(),
    contents: templateContentsSchema,
    snippets: z.record(
      z.string(),
      snippetSchema,
    ),
  });
  const toolSchema: z.ZodType<Spec.Tool> = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
  });
  const templatesSchema: z.ZodType<Spec.Templates> = z.object({
    signature: z.string(),
    templates: z.record(
      z.string(),
      templateSchema,
    ),
    tools: z.record(
      z.string(),
      toolSchema,
    ),
  });
  return templatesSchema;
})();

const TEMPLATES_DATA: Spec.Templates = {
  "signature": "",
  "tools": {
    "Default:getX": {
      "id": "Default:getX",
      "name": "getX",
      "description": "Hello!\n\n and "
    }
  },
  "templates": {
    "Default:MyTemplate": {
      "name": "MyTemplate",
      "namespace": "Default",
      "outputFormat": "text",
      "tools": [
        {
          "id": "Default:getX",
          "name": "getX"
        }
      ],
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
              },
              "intermediateSteps": []
            },
            {
              "input": {
                "firstName": "Jane",
                "lastName": "Smith"
              },
              "output": {
                "x": 9
              },
              "intermediateSteps": []
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
      [name: string]: Template<TemplateId>;
    };
  } = {};
  for (const [templateId, templateSpec] of Object.entries(
    templates.templates,
  )) {
    const namespace = uncapitalize(templateSpec.namespace);
    const name = uncapitalize(templateSpec.name);
    (result[namespace] ??= {})[name] = {
      make: (input: Input<TemplateId>) =>
        resolveTemplate(templateId as TemplateId, templates, input),
    };
  }
  return result as PromptMaker;
}

export const promptMakerFactory: {
  readonly templatesData: unknown;
  readonly newWithOverrides: (overrides: unknown) => PromptMaker;
} = {
  templatesData: TEMPLATES_DATA,
  newWithOverrides: (overrides: unknown) => {
    const templatesData = templatesSchema.parse(
      typeof overrides === "object"
        ? { ...TEMPLATES_DATA, ...overrides }
        : overrides,
    );
    if (templatesData.signature !== TEMPLATES_DATA.signature) {
      throw new Error("Signature mismatch");
    }
    return newPromptMakerImpl(templatesData);
  },
} as const;

function resolveTemplate<Id extends TemplateId>(
  templateId: TemplateId,
  templates: Spec.Templates,
  input: Input<Id>,
): Prompt<Id> {
  const template = templates.templates[templateId];
  if (!template) {
    throw new Error("Template not found: ".concat(templateId));
  }
  const { input: inputSchema, output: outputSchema } = zodSchemas[templateId]!;
  input = inputSchema.parse(input) as Input<Id>;
  const { contents, snippets } = template;
  let meta: Meta;
  let systemMessage: string;
  let userMessage: string;
  let examples: readonly FewShotExample[];
  if (contents.kind === "noVariants") {
    const { content } = contents;
    meta = content.meta as Meta;
    systemMessage = resolveBody(content.system!, input, snippets);
    userMessage = resolveBody(content.user!, input, snippets);
    examples = resolveExamples(content.examples!, content.user!, template, templates.tools);
  } else {
    const { defaultContent, variants } = contents;
    const { variant } = input as unknown as { readonly variant: string };
    const variantContent = variants[variant]!;
    meta = (variantContent.meta ?? defaultContent.meta) as Meta;
    const system = (variantContent.system ?? defaultContent.system)!;
    const user = (variantContent.user ?? defaultContent.user)!;
    systemMessage = resolveBody(system, input, snippets);
    userMessage = resolveBody(user, input, snippets);
    examples = resolveExamples(
      (variantContent.examples ?? defaultContent.examples)!,
      user,
      template,
      templates.tools,
    );
  }
  const tools = Object.fromEntries(
    template.tools.map(({ id, name }): readonly [string, Tool<ToolId>] => {
      const toolData = templates.tools[id]!;
      const toolSchemas = zodSchemas[id as ToolId]!;
      const tool: Tool<ToolId> = {
        id: id as ToolId,
        name: name as ToolName<ToolId>,
        description: toolData.description,
        inputSchema: toolSchemas.input,
        outputSchema: toolSchemas.output,
      };
      return [name, tool];
    }),
  ) as Tools<Id>;
  const outputFormat = (
    template.outputFormat === "json"
      ? { kind: "json", schema: outputSchema }
      : { kind: "text" }
  ) as OutputFormat<Id>;
  const parseResponse = (c: string) => parseResponseImpl(c, outputFormat);
  return {
    meta,
    systemMessage: systemMessage,
    userMessage: userMessage,
    examples,
    tools,
    outputFormat,
    parseResponse,
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
  inputs: readonly Spec.FewShotExample[],
  body: Spec.Body,
  template: Spec.Template,
  tools: { [id: string]: Spec.Tool },
): readonly FewShotExample[] {
  return inputs.map(({ input, output, intermediateSteps }) => ({
    userMessage: resolveBody(body, input, template.snippets),
    intermediateSteps: intermediateSteps.map((step) => ({
      toolCalls: step.toolCalls.map((tc) => ({
        callId: tc.callId,
        toolName: tc.toolName,
        description: tools[tc.toolId]!.description,
        rawInput: tc.input,
        rawOutput: tc.output,
      })),
    })),
    response: format(output, template.outputFormat),
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

function parseResponseImpl<Output>(
  response: string,
  outputFormat: OutputFormatType<Output>,
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

function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
