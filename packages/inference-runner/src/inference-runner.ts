import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { Inferences } from "@typeprompt/core";
import {
  DEFAULT_NAMESPACE,
  generateInferenceRunId,
  makeTemplates,
  normalizeSchemaValue,
  parseJson,
  renderInferenceRequest,
  tryResolveLanguageModel,
  unwrapJsonValue,
  validateJson,
  type ApiKeys,
  type ModelProviderName,
  type PlaygroundModel,
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

export type RunPlaygroundInferencesOptions = {
  readonly apiKeys?: ApiKeys;
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
  /**
   * Optional callback invoked as inferences arrive, immediately before any are
   * computed, and once all inferences have been computed.
   */
  readonly callback?: (
    inferenceRun: Inferences.InferenceRun<Inferences.Pending>,
  ) => void;
};

/**
 * Runs inference across all samples in the `<playground>` associated with `templateId`
 * and returns a {@link Inferences.InferenceRun}.
 */
export async function runPlaygroundInferences(
  compilationResult: ValidCompilationResult,
  templateId: string,
  options: RunPlaygroundInferencesOptions,
  now = new Date(),
): Promise<Inferences.InferenceRun> {
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

  let languageModel = options.languageModel;
  if (!languageModel) {
    const result = tryResolveLanguageModel(
      validatedPlayground.model,
      options.apiKeys,
    );
    if (result.kind === "error") {
      throw new Error(result.detailedMessage);
    }
    languageModel = MODEL_PROVIDERS[result.provider]({
      apiKey: result.apiKey,
    })(result.modelId);
  }
  const templatesSpec = makeTemplates(compilationResult);
  const specTemplate = templatesSpec.templates[templateId]!;
  const sourceFiles = collectSourceFilesForTemplate(
    compilationResult,
    templateId,
  );
  const isoTimestamp = now.toISOString();
  const id = generateInferenceRunId();

  const inferences: Inferences.SampleInference<Inferences.Pending>[] =
    validatedPlayground.samples.map((sample, sampleIndex) => {
      const request = renderInferenceRequest(
        sample,
        specTemplate,
        templatesSpec.tools,
        validTemplate,
      );
      return {
        sampleIndex,
        sample,
        request,
        result: { kind: "pending" },
      };
    });

  const emit = (): void => {
    options.callback?.({
      kind: "playground-inference-run",
      id,
      model: validatedPlayground.model,
      templateId,
      isoTimestamp,
      sourceFiles,
      samples: [...inferences],
    });
  };

  emit();

  if (validatedPlayground.samples.length > 0) {
    await mapWithConcurrency(
      validatedPlayground.samples,
      maxConcurrency,
      async (sample, sampleIndex): Promise<void> => {
        const request = inferences[sampleIndex]!.request;
        const result = await executeSampleInference(
          request,
          validatedPlayground.model,
          languageModel,
          validTemplate,
        );
        inferences[sampleIndex] = {
          sampleIndex,
          sample,
          request,
          result,
        };
        emit();
      },
    );
  } else {
    emit();
  }

  const inferenceRun: Inferences.InferenceRun = {
    kind: "playground-inference-run",
    id,
    model: validatedPlayground.model,
    templateId,
    isoTimestamp,
    sourceFiles,
    samples: inferences as Inferences.SampleInference[],
  };

  return inferenceRun;
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

const MODEL_PROVIDERS: {
  readonly [P in ModelProviderName]: (options: {
    apiKey: string;
  }) => (modelId: string) => LanguageModel;
} = {
  openai: createOpenAI,
  anthropic: createAnthropic,
  google: createGoogleGenerativeAI,
  xai: createXai,
  mistral: createMistral,
  vercelGateway: createGateway,
};

/**
 * Collects only the `.tp` files relevant to `templateId`:
 * the `<template>`, its `<tool>` files, `<namespace>`, `<meta>`, and `<playground>` file.
 */
function collectSourceFilesForTemplate(
  compilationResult: ValidCompilationResult,
  templateId: string,
): { readonly [path: string]: Inferences.InferenceSourceFile } {
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

  const result: { [path: string]: Inferences.InferenceSourceFile } = {};
  for (const filePath of paths) {
    const sourceFile = compilationResult.sourceFiles[filePath]!;
    result[filePath] = {
      content: sourceFile.content,
      kind: sourceFile.entity!.kind,
    };
  }
  return result;
}

async function executeSampleInference(
  request: Inferences.InferenceRequest,
  playgroundModel: PlaygroundModel,
  languageModel: LanguageModel,
  validTemplate: ValidTemplate,
): Promise<Inferences.InferenceResult> {
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
          async parseCompleteOutput({
            text,
          }: {
            text: string;
          }): Promise<string> {
            return text;
          },
          async parsePartialOutput({
            text,
          }: {
            text: string;
          }): Promise<{ partial: string }> {
            return { partial: text };
          },
          createElementStreamTransform(): undefined {
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
  const reasoning = genResult.finalStep.reasoningText || undefined;

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

  const outputType = validTemplate.outputType.valueType;
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
      output: normalizeSchemaValue(
        unwrapJsonValue(parsedAst),
        {
          type: outputType,
          schema: validTemplate.schema,
        },
        "assistant",
      ),
    },
    ...(reasoning ? { reasoning } : {}),
    telemetry,
  };
}

function toModelMessages(
  messages: readonly Inferences.Message[],
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
          content:
            outputFormat === "json"
              ? JSON.stringify(msg.output, undefined, 2)
              : String(msg.output),
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
): Inferences.InferenceTelemetry {
  if (
    !usage ||
    usage.inputTokens === undefined ||
    usage.outputTokens === undefined
  ) {
    return { latencyMs };
  }
  const tokenUsage: Inferences.TokenUsage = {
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

const DEFAULT_MAX_CONCURRENCY = 5;
