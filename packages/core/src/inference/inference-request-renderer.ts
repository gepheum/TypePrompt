import { encode as encodeToon } from "@toon-format/toon";
import YAML from "yaml";
import type { Sample, ValidTemplate } from "../compiler/compiler-types.js";
import type * as Spec from "../compiler/spec-types.js";
import { normalizeSchemaValue } from "../schema/index.js";
import type * as Inferences from "./inference-types.js";

/**
 * Renders a {@link Sample} against `specTemplate` into a
 * {@link Inferences.InferenceRequest}.
 */
export function renderInferenceRequest(
  sample: Sample,
  specTemplate: Spec.Template,
  specTools: { readonly [id: string]: Spec.Tool },
  validTemplate: ValidTemplate,
): Inferences.InferenceRequest {
  const inputSchemaType = {
    type: validTemplate.inputType.valueType,
    schema: validTemplate.schema,
  };
  const outputSchemaType = {
    type: validTemplate.outputType.valueType,
    schema: validTemplate.schema,
  };
  const normalizeToolInput = (toolName: string, value: unknown): unknown => {
    const toolEntry = validTemplate.tools[toolName];
    if (!toolEntry) return value;
    const { tool } = toolEntry;
    return normalizeSchemaValue(
      value,
      {
        type: tool.inputType.valueType,
        schema: tool.schema,
      },
      "assistant",
    );
  };
  const normalizeToolOutput = (toolName: string, value: unknown): unknown => {
    const toolEntry = validTemplate.tools[toolName];
    if (!toolEntry) return value;
    const { tool } = toolEntry;
    return normalizeSchemaValue(
      value,
      {
        type: tool.outputType.valueType,
        schema: tool.schema,
      },
      "user",
    );
  };

  const normalizedSampleInput = normalizeSchemaValue(
    sample.input,
    inputSchemaType,
    "user",
  );
  const mainContent = resolveTemplateContent(
    specTemplate.contents,
    normalizedSampleInput,
  );
  const systemMessage = renderBody(
    mainContent.system,
    normalizedSampleInput,
    specTemplate.snippets,
  );

  const tools: readonly Inferences.Tool[] = specTemplate.tools.map(
    ({ id, name }) => {
      const toolSpec = specTools[id]!;
      return {
        id,
        name,
        description: toolSpec.description,
        inputJsonSchema: toolSpec.inputJsonSchema as {
          readonly [k: string]: unknown;
        },
      };
    },
  );

  const outputFormat: Inferences.InferenceRequest["outputFormat"] =
    specTemplate.outputFormat === "json"
      ? {
          format: "json",
          jsonSchema: specTemplate.outputJsonSchema as {
            readonly [k: string]: unknown;
          },
        }
      : {
          format: "text",
        };

  const messages: Inferences.Message[] = [];

  // 1. Few-shot examples
  for (const example of mainContent.examples) {
    const normalizedExampleInput = normalizeSchemaValue(
      example.input,
      inputSchemaType,
      "user",
    );
    const exampleContent = resolveTemplateContent(
      specTemplate.contents,
      normalizedExampleInput,
    );
    messages.push({
      role: "user",
      input: normalizedExampleInput,
      rendered: renderBody(
        exampleContent.user,
        normalizedExampleInput,
        specTemplate.snippets,
      ),
    });

    for (const step of example.steps) {
      messages.push({
        role: "assistant",
        toolCalls: step.toolCalls.map((tc) => ({
          callId: tc.callId,
          toolName: tc.toolName,
          input: normalizeToolInput(tc.toolName, tc.input),
        })),
      });
      messages.push({
        role: "tool",
        toolResults: step.toolCalls.map((tc) => ({
          callId: tc.callId,
          toolName: tc.toolName,
          output:
            tc.output !== undefined && tc.output !== null
              ? normalizeToolOutput(tc.toolName, tc.output)
              : tc.output,
        })),
      });
    }

    messages.push({
      role: "assistant",
      output: normalizeSchemaValue(
        example.output,
        outputSchemaType,
        "assistant",
      ),
    });
  }

  // 2. Prior conversation history turns
  for (const historyEntry of sample.history ?? []) {
    const normalizedHistoryInput = normalizeSchemaValue(
      historyEntry.input,
      inputSchemaType,
      "user",
    );
    const historyContent = resolveTemplateContent(
      specTemplate.contents,
      normalizedHistoryInput,
    );
    messages.push({
      role: "user",
      input: normalizedHistoryInput,
      rendered: renderBody(
        historyContent.user,
        normalizedHistoryInput,
        specTemplate.snippets,
      ),
    });

    for (const step of historyEntry.steps ?? []) {
      messages.push({
        role: "assistant",
        toolCalls: step.toolCalls.map((tc) => ({
          callId: tc.callId,
          toolName: tc.tool,
          input: normalizeToolInput(tc.tool, tc.input),
        })),
      });
      messages.push({
        role: "tool",
        toolResults: step.toolCalls.map((tc) => ({
          callId: tc.callId,
          toolName: tc.tool,
          output:
            tc.output !== undefined && tc.output !== null
              ? normalizeToolOutput(tc.tool, tc.output)
              : tc.output,
        })),
      });
    }

    messages.push({
      role: "assistant",
      output: normalizeSchemaValue(
        historyEntry.output,
        outputSchemaType,
        "assistant",
      ),
    });
  }

  // 3. Current turn user message
  messages.push({
    role: "user",
    input: normalizedSampleInput,
    rendered: renderBody(
      mainContent.user,
      normalizedSampleInput,
      specTemplate.snippets,
    ),
  });

  // 4. Current turn intermediate steps
  for (const step of sample.steps ?? []) {
    messages.push({
      role: "assistant",
      toolCalls: step.toolCalls.map((tc) => ({
        callId: tc.callId,
        toolName: tc.tool,
        input: normalizeToolInput(tc.tool, tc.input),
      })),
    });
    messages.push({
      role: "tool",
      toolResults: step.toolCalls.map((tc) => ({
        callId: tc.callId,
        toolName: tc.tool,
        output:
          tc.output !== undefined && tc.output !== null
            ? normalizeToolOutput(tc.tool, tc.output)
            : null,
      })),
    });
  }

  return {
    systemMessage,
    tools,
    outputFormat,
    messages,
  };
}

function resolveTemplateContent(
  contents: Spec.TemplateContents,
  input: unknown,
): {
  readonly system: Spec.Body;
  readonly user: Spec.Body;
  readonly examples: readonly Spec.FewShotExample[];
} {
  if (contents.kind === "no-variants") {
    const { content } = contents;
    return {
      system: content.system!,
      user: content.user!,
      examples: content.examples ?? [],
    };
  }
  const { defaultContent, variants } = contents;
  const { variant } = input as { readonly variant: string };
  const variantContent = variants[variant]!;
  return {
    system: (variantContent.system ?? defaultContent.system)!,
    user: (variantContent.user ?? defaultContent.user)!,
    examples: variantContent.examples ?? defaultContent.examples ?? [],
  };
}

function renderBody<Input>(
  body: Spec.Body,
  input: Input,
  snippets: { readonly [c: string]: Spec.Snippet },
): string {
  const renderPiece = (piece: Spec.BodyPiece): string => {
    switch (piece.kind) {
      case "text": {
        return piece.text;
      }
      case "insert-snippet": {
        const snippet = snippets[piece.snippet];
        if (!snippet) {
          throw new Error(`Snippet not found: ${piece.snippet}`);
        }
        return indent(renderSnippet(snippet, input, snippets), piece.indent);
      }
      case "insert-val": {
        const val = evaluate(input, piece.val);
        return indent(format(val, piece.format), piece.indent);
      }
    }
  };
  return body.map(renderPiece).join("");
}

function renderSnippet<Input>(
  snippet: Spec.Snippet,
  input: Input,
  snippets: { readonly [c: string]: Spec.Snippet },
): string {
  switch (snippet.kind) {
    case "snippet": {
      return renderBody(snippet.body, input, snippets);
    }
    case "snippet-if": {
      const { expression, then: thenBody, else: elseBody } = snippet;
      const evalResult = evaluate(input, expression);
      const condition = ((): boolean => {
        switch (snippet.is) {
          case "not-empty": {
            return (evalResult as { readonly length: number }).length >= 1;
          }
          case "not-null": {
            return evalResult !== undefined && evalResult !== null;
          }
          case "true": {
            return !!evalResult;
          }
        }
      })();
      const body = condition ? thenBody : elseBody;
      return renderBody(body, input, snippets);
    }
    case "snippet-switch": {
      const { expression, branches } = snippet;
      const evalResult = evaluate(input, expression);
      const branch = branches[evalResult as string];
      if (!branch) {
        throw new Error(`Branch not found: ${evalResult as string}`);
      }
      return renderBody(branch, input, snippets);
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
      const parent = evaluate(input, expression.left);
      return (parent as Record<string, unknown>)[expression.property];
    }
  }
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
      // Remove trailing newline if present.
      return YAML.stringify(input).replace(/\n$/, "");
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
      const rows: readonly string[] = [
        headerRow,
        ...array.map((row) =>
          Object.values(row)
            .map((val) =>
              val === undefined || val === null ? "" : String(val),
            )
            .join(separator),
        ),
      ];
      return rows.join("\n");
    }
  }
}
