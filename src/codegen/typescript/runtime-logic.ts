import { encode as encodeToon } from "@toon-format/toon";
import YAML from "yaml";
import * as z from "zod";
import * as Spec from "../../runtime/runtime-types.js";

// <generated>
export type Meta = {};

export type TemplateId = string;

const templateSchemas: {
  readonly [id: TemplateId]: {
    readonly input: z.ZodType<any>;
    readonly output: z.ZodType<any>;
  };
} = {} as const;

export type PromptMaker = {
  readonly [namespace: string]: {
    readonly [name: string]: Template<unknown, unknown>;
  };
};

const TEMPLATES_DATA: Spec.Templates = {
  signature: "",
  templates: {},
} as const;

const templatesSchema: z.ZodType<Spec.Templates> = z.any();
// </generated>

// <static:types>
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
// </static:types>

// <static:logic>
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

export const promptMakerFactory: {
  readonly defaultPromptMakerData: unknown,
  readonly newPromptMakerFromData: (data: unknown) => PromptMaker;
} = {
  defaultPromptMakerData: TEMPLATES_DATA,
  newPromptMakerFromData: (data: unknown) => {
    const templatesData = templatesSchema.parse(data);
    if (templatesData.signature !== TEMPLATES_DATA.signature) {
      throw new Error("Signature mismatch");
    }
    return newPromptMakerImpl(templatesData);
  },
} as const;

function resolveTemplate<Input, Output>(
  templateId: TemplateId,
  templates: Spec.Templates,
  input: Input,
): Prompt<Output, Input> {
  const template = templates.templates[templateId];
  if (!template) {
    throw new Error("Template not found: ".concat(templateId));
  }
  const { input: inputSchema, output: outputSchema } =
    templateSchemas[templateId]!;
  input = inputSchema.parse(input) as Input;
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
// </static:logic>
