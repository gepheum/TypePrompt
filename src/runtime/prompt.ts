import { encode as encodeToon } from "@toon-format/toon";
import YAML from "yaml";
import * as z from "zod";
import {
  Body,
  BodyPiece,
  Expression,
  InsertFormat,
  Snippet,
  TemplateSpec,
  Templates,
} from "./runtime-types.js";

export type Template<Input, Output> = {
  readonly make: (input: Input) => Prompt<Output, Input>;
};

export type Prompt<Output, Input = unknown> = {
  readonly meta: Meta;
  readonly systemInstructions: string;
  readonly userInstructions: string;
  readonly examples: readonly FewShotExample[];
  readonly outputFormat:
    | {
      readonly kind: "json";
      readonly schema: z.ZodType<Output>;
    }
    | (Output extends string ? { readonly kind: "text" } : never);
  readonly templateId: TemplateId;
  readonly templateInput: Input;
};

export type FewShotExample = {
  readonly userInstructions: string;
  readonly assistantResponse: string;
};

// <generated>

export type Meta = {};

export type TemplateId = string;

function getOutputType(templateId: TemplateId): z.ZodType<unknown> {
  // TODO
  return z.any();
}

export type PromptMaker = {
  readonly [namespace: string]: {
    readonly [name: string]: Template<unknown, unknown>;
  };
};

// </generated>

function newPromptMaker(templates: Templates): PromptMaker {
  const result: {
    [namespace: string]: {
      [name: string]: Template<unknown, unknown>;
    };
  } = {};
  for (const [templateId, templateSpec] of Object.entries(templates.templates)) {
    const {namespace, name} = templateSpec;
    (result[namespace] ??= {})[name] = {
      make: (input: unknown) => resolveTemplate(templateId, templates, input),
    };
  }
  return result;
}

function resolveTemplate<Input, Output>(
  templateId: string,
  templates: Templates,
  input: Input,
): Prompt<Output, Input> {
  const template = templates.templates[templateId];
  if (!template) {
    throw new Error(`Template '${templateId}' not found`);
  }
  const { contents, snippets } = template;

  let meta: Meta;
  let systemInstructions: string;
  let userInstructions: string;
  let examples: readonly FewShotExample[];
  if (contents.kind === "no-variants") {
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
  const outputType = getOutputType(templateId) as z.ZodType<Output>;
  return {
    meta,
    systemInstructions,
    userInstructions,
    examples,
    outputType,
    templateId,
    templateInput: input,
  };
}

function resolveBody<Input>(
  body: Body,
  input: Input,
  snippets: { readonly [c: string]: Snippet },
): string {
  const resolvePiece = (piece: BodyPiece): string => {
    switch (piece.kind) {
      case "text": {
        return piece.text;
      }
      case "insert-snippet": {
        const snippet = snippets[piece.snippet];
        if (!snippet) {
          throw new Error(`Snippet '${piece.snippet}' not found`);
        }
        return indent(resolveSnippet(snippet, input, snippets), piece.indent);
      }
      case "insert-val": {
        const val = evaluate(input, piece.val);
        return indent(format(val, piece.format), piece.indent);
      }
    }
  };
  return body.map(resolvePiece).join("");
}

function resolveSnippet<Input>(
  snippet: Snippet,
  input: Input,
  snippets: { readonly [c: string]: Snippet },
): string {
  switch (snippet.kind) {
    case "snippet": {
      return resolveBody(snippet.body, input, snippets);
    }
    case "snippet-if": {
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
    case "snippet-switch": {
      const { expression, branches } = snippet;
      const evalResult = evaluate(input, expression);
      const branch = branches[evalResult as string];
      if (!branch) {
        throw new Error(`Branch '${evalResult}' not found`);
      }
      return resolveBody(branch, input, snippets);
    }
  }
}

function indent(text: string, spaces: string): string {
  if (spaces.length <= 0) {
    return text;
  } else {
    return text.replace(/\n/g, `\n${spaces}`);
  }
}

function evaluate<Input>(input: Input, expression: Expression): unknown {
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
  body: Body,
  template: TemplateSpec,
): readonly FewShotExample[] {
  return inputs.map(({ input, output }) => ({
    userInstructions: resolveBody(body, input, template.snippets),
    assistantResponse: format(output, template.outputFormat),
  }));
}

function format(input: unknown, format?: InsertFormat): string {
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
                  ? `"${str.replace(/"/g, '""')}"`
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
