import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { encode as encodeToon } from "@toon-format/toon";
import {
  DEFAULT_NAMESPACE,
  makeTemplates,
  parseJson,
  unwrapJsonValue,
  validateJson,
  type PlaygroundInference,
  type PlaygroundInferenceRequest,
  type PlaygroundInferenceResult,
  type PlaygroundInferenceSet,
  type PlaygroundInferenceTelemetry,
  type PlaygroundMessage,
  type PlaygroundModel,
  type PlaygroundModelId,
  type PlaygroundTokenUsage,
  type PlaygroundTool,
  type Sample,
  type Spec,
  type ValidCompilationResult,
  type ValidTemplate,
} from "@typeprompt/core";
import {
  createGateway,
  generateText,
  jsonSchema,
  tool,
  type JSONValue,
  type LanguageModel,
  type ModelMessage,
  type Output,
  type ToolSet,
} from "ai";
import YAML from "yaml";

export type RunPlaygroundInferencesOptions = {
  readonly openaiApiKey?: string;
  readonly anthropicApiKey?: string;
  readonly googleApiKey?: string;
  readonly xaiApiKey?: string;
  readonly mistralApiKey?: string;
  readonly vercelGatewayApiKey?: string;
  /**
   * Maximum number of sample inferences to run in parallel.
   * @default 5
   */
  readonly maxConcurrency?: number;
  /**
   * Optional custom LanguageModel override (e.g. for testing).
   * When omitted, the model is resolved from the playground's `<model>` configuration
   * and the provided API keys.
   */
  readonly languageModel?: LanguageModel;
};

/**
 * Runs inference across all samples in the `<playground>` associated with `templateId`
 * and returns a {@link PlaygroundInferenceSet}.
 */
export async function runPlaygroundInferences(
  compilationResult: ValidCompilationResult,
  templateId: string,
  options: RunPlaygroundInferencesOptions = {},
  now = new Date(),
): Promise<PlaygroundInferenceSet> {
  const validTemplate = compilationResult.templates[templateId];
  if (!validTemplate) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const validatedPlayground = compilationResult.playgrounds[templateId];
  if (!validatedPlayground) {
    throw new Error(`Playground not found for template: ${templateId}`);
  }

  const maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error(
      `Invalid maxConcurrency: ${maxConcurrency} (expected a positive integer)`,
    );
  }

  const languageModel = resolveLanguageModel(
    validatedPlayground.model.model,
    options,
  );
  const templatesSpec = makeTemplates(compilationResult);
  const specTemplate = templatesSpec.templates[templateId]!;
  const templateFiles = collectTemplateFilesForTemplate(
    compilationResult,
    templateId,
  );
  const isoTimestamp = now.toISOString();

  const inferences = await mapWithConcurrency(
    validatedPlayground.samples,
    maxConcurrency,
    async (sample, sampleIndex): Promise<PlaygroundInference> => {
      const request = buildPlaygroundInferenceRequest(
        sample,
        specTemplate,
        templatesSpec.tools,
      );
      const result = await executeSampleInference(
        request,
        validatedPlayground.model,
        languageModel,
        validTemplate,
      );
      return {
        sampleIndex,
        ...(sample.name ? { name: sample.name.text } : {}),
        request,
        result,
      };
    },
  );

  return {
    kind: "playground-inference-set",
    model: validatedPlayground.model,
    templateId,
    isoTimestamp,
    templateFiles,
    inferences,
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  maxConcurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await fn(items[currentIndex]!, currentIndex);
    }
  }

  const workerCount = Math.min(maxConcurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Resolves a Vercel AI SDK {@link LanguageModel} from a {@link PlaygroundModelId}
 * and the configured API keys:
 * - For `openai/*`, `anthropic/*`, `google/*`, `xai/*` (`spacexai/*`), or `mistral/*`
 *   models, uses the provider's SDK key if present, falling back to `vercelGatewayApiKey`.
 * - For all other providers, requires `vercelGatewayApiKey`.
 */
export function resolveLanguageModel(
  modelId: PlaygroundModelId,
  options: RunPlaygroundInferencesOptions,
): LanguageModel {
  if (options.languageModel) {
    return options.languageModel;
  }

  const slashIndex = modelId.indexOf("/");
  const provider = slashIndex >= 0 ? modelId.slice(0, slashIndex) : "";
  const providerModelName =
    slashIndex >= 0 ? modelId.slice(slashIndex + 1) : modelId;

  switch (provider) {
    case "openai": {
      if (options.openaiApiKey) {
        return createOpenAI({ apiKey: options.openaiApiKey })(
          providerModelName,
        );
      }
      if (options.vercelGatewayApiKey) {
        return createGateway({ apiKey: options.vercelGatewayApiKey })(modelId);
      }
      throw new Error(
        `Missing API key for model '${modelId}': provide 'openaiApiKey' or 'vercelGatewayApiKey'`,
      );
    }
    case "anthropic": {
      if (options.anthropicApiKey) {
        return createAnthropic({ apiKey: options.anthropicApiKey })(
          providerModelName,
        );
      }
      if (options.vercelGatewayApiKey) {
        return createGateway({ apiKey: options.vercelGatewayApiKey })(modelId);
      }
      throw new Error(
        `Missing API key for model '${modelId}': provide 'anthropicApiKey' or 'vercelGatewayApiKey'`,
      );
    }
    case "google": {
      if (options.googleApiKey) {
        return createGoogleGenerativeAI({ apiKey: options.googleApiKey })(
          providerModelName,
        );
      }
      if (options.vercelGatewayApiKey) {
        return createGateway({ apiKey: options.vercelGatewayApiKey })(modelId);
      }
      throw new Error(
        `Missing API key for model '${modelId}': provide 'googleApiKey' or 'vercelGatewayApiKey'`,
      );
    }
    case "xai":
    case "spacexai": {
      if (options.xaiApiKey) {
        return createXai({ apiKey: options.xaiApiKey })(providerModelName);
      }
      if (options.vercelGatewayApiKey) {
        return createGateway({ apiKey: options.vercelGatewayApiKey })(modelId);
      }
      throw new Error(
        `Missing API key for model '${modelId}': provide 'xaiApiKey' or 'vercelGatewayApiKey'`,
      );
    }
    case "mistral": {
      if (options.mistralApiKey) {
        return createMistral({ apiKey: options.mistralApiKey })(
          providerModelName,
        );
      }
      if (options.vercelGatewayApiKey) {
        return createGateway({ apiKey: options.vercelGatewayApiKey })(modelId);
      }
      throw new Error(
        `Missing API key for model '${modelId}': provide 'mistralApiKey' or 'vercelGatewayApiKey'`,
      );
    }
    default: {
      if (options.vercelGatewayApiKey) {
        return createGateway({ apiKey: options.vercelGatewayApiKey })(modelId);
      }
      throw new Error(`Missing 'vercelGatewayApiKey' for model '${modelId}'`);
    }
  }
}

/**
 * Collects only the `.tp` files relevant to `templateId`:
 * the `<template>`, its `<tool>` files, `<namespace>`, `<meta>`, and `<playground>` file.
 */
export function collectTemplateFilesForTemplate(
  compilationResult: ValidCompilationResult,
  templateId: string,
): { readonly [path: string]: string } {
  const validTemplate = compilationResult.templates[templateId];
  if (!validTemplate) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const paths = new Set<string>();
  const templateNamespace =
    validTemplate.template.namespace?.text ?? DEFAULT_NAMESPACE;

  // 1. Template file
  paths.add(validTemplate.template.sourcePath);

  // 2. Tool files used by the template
  for (const templateTool of Object.values(validTemplate.tools)) {
    paths.add(templateTool.tool.tool.name.path);
  }

  // 3. Namespace and Meta files
  for (const [filePath, sourceFile] of Object.entries(
    compilationResult.sourceFiles,
  )) {
    const { entity } = sourceFile;
    if (!entity) continue;
    if (entity.kind === "namespace" && entity.name.text === templateNamespace) {
      paths.add(filePath);
    } else if (entity.kind === "meta") {
      paths.add(filePath);
    }
  }

  // 4. Playground file
  const validatedPlayground = compilationResult.playgrounds[templateId];
  if (validatedPlayground) {
    paths.add(validatedPlayground.playground.tag.path);
  }

  const result: Record<string, string> = {};
  for (const filePath of paths) {
    const sourceFile = compilationResult.sourceFiles[filePath];
    if (sourceFile) {
      result[filePath] = sourceFile.content;
    }
  }
  return result;
}

/**
 * Renders a {@link Sample} against `specTemplate` into a {@link PlaygroundInferenceRequest}.
 */
export function buildPlaygroundInferenceRequest(
  sample: Sample,
  specTemplate: Spec.Template,
  specTools: { readonly [id: string]: Spec.Tool },
): PlaygroundInferenceRequest {
  const mainContent = resolveTemplateContent(
    specTemplate.contents,
    sample.input,
  );
  const systemMessage = renderBody(
    mainContent.system,
    sample.input,
    specTemplate.snippets,
  );

  const tools: readonly PlaygroundTool[] = specTemplate.tools.map(
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

  const outputFormat: PlaygroundInferenceRequest["outputFormat"] =
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

  const messages: PlaygroundMessage[] = [];

  // 1. Few-shot examples
  for (const example of mainContent.examples) {
    const exampleContent = resolveTemplateContent(
      specTemplate.contents,
      example.input,
    );
    messages.push({
      role: "user",
      input: example.input,
      rendered: renderBody(
        exampleContent.user,
        example.input,
        specTemplate.snippets,
      ),
    });

    for (const step of example.steps) {
      messages.push({
        role: "assistant",
        toolCalls: step.toolCalls.map((tc) => ({
          callId: tc.callId,
          toolName: tc.toolName,
          input: tc.input,
        })),
      });
      messages.push({
        role: "tool",
        toolResults: step.toolCalls.map((tc) => ({
          callId: tc.callId,
          toolName: tc.toolName,
          output: tc.output,
        })),
      });
    }

    messages.push({
      role: "assistant",
      output: example.output,
    });
  }

  // 2. Prior conversation history turns
  for (const historyEntry of sample.history ?? []) {
    const historyContent = resolveTemplateContent(
      specTemplate.contents,
      historyEntry.input,
    );
    messages.push({
      role: "user",
      input: historyEntry.input,
      rendered: renderBody(
        historyContent.user,
        historyEntry.input,
        specTemplate.snippets,
      ),
    });

    for (const step of historyEntry.steps ?? []) {
      messages.push({
        role: "assistant",
        toolCalls: step.toolCalls.map((tc) => ({
          callId: tc.callId.text,
          toolName: tc.toolName.text,
          input: unwrapJsonValue(tc.input),
        })),
      });
      messages.push({
        role: "tool",
        toolResults: step.toolCalls.map((tc) => ({
          callId: tc.callId.text,
          toolName: tc.toolName.text,
          output: tc.output !== undefined ? unwrapJsonValue(tc.output) : null,
        })),
      });
    }

    messages.push({
      role: "assistant",
      output: historyEntry.output,
    });
  }

  // 3. Current turn user message
  messages.push({
    role: "user",
    input: sample.input,
    rendered: renderBody(mainContent.user, sample.input, specTemplate.snippets),
  });

  // 4. Current turn intermediate steps
  for (const step of sample.steps ?? []) {
    messages.push({
      role: "assistant",
      toolCalls: step.toolCalls.map((tc) => ({
        callId: tc.callId.text,
        toolName: tc.toolName.text,
        input: unwrapJsonValue(tc.input),
      })),
    });
    messages.push({
      role: "tool",
      toolResults: step.toolCalls.map((tc) => ({
        callId: tc.callId.text,
        toolName: tc.toolName.text,
        output: tc.output !== undefined ? unwrapJsonValue(tc.output) : null,
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

async function executeSampleInference(
  request: PlaygroundInferenceRequest,
  playgroundModel: PlaygroundModel,
  languageModel: LanguageModel,
  validTemplate: ValidTemplate,
): Promise<PlaygroundInferenceResult> {
  const modelMessages = toModelMessages(
    request.messages,
    request.outputFormat.format,
  );

  const aiTools: ToolSet | undefined =
    request.tools.length > 0
      ? Object.fromEntries(
          request.tools.map((t) => [
            t.name,
            tool({
              description: t.description,
              inputSchema: jsonSchema<any>(t.inputJsonSchema),
            }),
          ]),
        )
      : undefined;

  const aiOutput: Output.Output<string, string, never> | undefined =
    request.outputFormat.format === "json"
      ? {
          name: "json",
          responseFormat: Promise.resolve({
            type: "json" as const,
            schema: request.outputFormat.jsonSchema,
          }),
          async parseCompleteOutput({ text }: { text: string }) {
            return text;
          },
          async parsePartialOutput({ text }: { text: string }) {
            return { partial: text };
          },
          createElementStreamTransform() {
            return undefined;
          },
        }
      : undefined;

  const startTime = performance.now();
  let genResult: Awaited<ReturnType<typeof generateText>>;
  try {
    genResult = await generateText({
      model: languageModel,
      system: request.systemMessage,
      messages: modelMessages,
      tools: aiTools,
      output: aiOutput,
      maxOutputTokens:
        playgroundModel.maxOutputTokens ?? playgroundModel.maxTokens,
      temperature: playgroundModel.temperature,
      topP: playgroundModel.topP,
      topK: playgroundModel.topK,
      presencePenalty: playgroundModel.presencePenalty,
      frequencyPenalty: playgroundModel.frequencyPenalty,
      stopSequences: playgroundModel.stopSequences,
      seed: playgroundModel.seed,
      reasoning: playgroundModel.reasoning,
      providerOptions: playgroundModel.providerOptions as
        Record<string, Record<string, JSONValue>> | undefined,
    });
  } catch (err) {
    return {
      kind: "error",
      error: {
        kind: "api-error",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const latencyMs = Math.round(performance.now() - startTime);
  const telemetry = extractTelemetry(latencyMs, genResult.usage);
  const reasoning = genResult.reasoningText || undefined;

  if (genResult.toolCalls && genResult.toolCalls.length > 0) {
    return {
      kind: "success",
      response: {
        kind: "tool-calls",
        toolCalls: genResult.toolCalls.map((tc) => ({
          callId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.input,
        })),
      },
      ...(reasoning ? { reasoning } : {}),
      telemetry,
    };
  }

  const rawText = genResult.text;
  if (request.outputFormat.format === "text") {
    return {
      kind: "success",
      response: {
        kind: "output",
        rawText,
        output: rawText,
      },
      ...(reasoning ? { reasoning } : {}),
      telemetry,
    };
  }

  const trimmed = rawText.trim();
  const stripped = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, "$1").trim()
    : trimmed;

  try {
    JSON.parse(stripped);
  } catch (err) {
    return {
      kind: "error",
      error: {
        kind: "parse-error",
        message: err instanceof Error ? err.message : String(err),
        rawText,
      },
      ...(reasoning ? { reasoning } : {}),
      telemetry,
    };
  }

  const parsedAst = parseJson(
    {
      path: validTemplate.template.sourcePath,
      text: stripped,
      offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
    },
    "strict",
  );
  if (parsedAst.kind === "error") {
    return {
      kind: "error",
      error: {
        kind: "parse-error",
        message: parsedAst.errors.map((e) => e.message).join("; "),
        rawText,
      },
      ...(reasoning ? { reasoning } : {}),
      telemetry,
    };
  }

  const outputType = validTemplate.schema.typeDeclarations["Output"]!.valueType;
  const validation = validateJson(parsedAst, outputType, validTemplate.schema);
  if (validation.errors.length > 0) {
    return {
      kind: "error",
      error: {
        kind: "validation-error",
        message: validation.errors.map((e) => e.message).join("; "),
        rawText,
      },
      ...(reasoning ? { reasoning } : {}),
      telemetry,
    };
  }

  return {
    kind: "success",
    response: {
      kind: "output",
      rawText,
      output: unwrapJsonValue(parsedAst),
    },
    ...(reasoning ? { reasoning } : {}),
    telemetry,
  };
}

function toModelMessages(
  messages: readonly PlaygroundMessage[],
  outputFormat: Spec.OutputFormat,
): ModelMessage[] {
  return messages.map((msg): ModelMessage => {
    switch (msg.role) {
      case "user": {
        return {
          role: "user",
          content: msg.rendered,
        };
      }
      case "assistant": {
        if (msg.toolCalls !== undefined) {
          return {
            role: "assistant",
            content: msg.toolCalls.map((tc) => ({
              type: "tool-call",
              toolCallId: tc.callId,
              toolName: tc.toolName,
              input: tc.input,
            })),
          };
        }
        return {
          role: "assistant",
          content: format(msg.output, outputFormat),
        };
      }
      case "tool": {
        return {
          role: "tool",
          content: msg.toolResults.map((tr) => ({
            type: "tool-result" as const,
            toolCallId: tr.callId,
            toolName: tr.toolName,
            output: {
              type: "json" as const,
              value: (tr.output ?? null) as JSONValue,
            },
          })),
        };
      }
    }
  });
}

function extractTelemetry(
  latencyMs: number,
  usage:
    | {
        readonly inputTokens: number | undefined;
        readonly outputTokens: number | undefined;
        readonly totalTokens: number | undefined;
        readonly inputTokenDetails?: {
          readonly cacheReadTokens: number | undefined;
        };
        readonly outputTokenDetails?: {
          readonly reasoningTokens: number | undefined;
        };
      }
    | undefined,
): PlaygroundInferenceTelemetry {
  if (
    !usage ||
    usage.inputTokens === undefined ||
    usage.outputTokens === undefined
  ) {
    return { latencyMs };
  }
  const tokenUsage: PlaygroundTokenUsage = {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(usage.outputTokenDetails?.reasoningTokens !== undefined
      ? { reasoningTokens: usage.outputTokenDetails.reasoningTokens }
      : {}),
    ...(usage.inputTokenDetails?.cacheReadTokens !== undefined
      ? { cachedInputTokens: usage.inputTokenDetails.cacheReadTokens }
      : {}),
    totalTokens: usage.totalTokens ?? usage.inputTokens + usage.outputTokens,
  };
  return {
    latencyMs,
    usage: tokenUsage,
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

const DEFAULT_MAX_CONCURRENCY = 5;
