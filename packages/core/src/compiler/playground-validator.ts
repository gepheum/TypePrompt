import type {
  StrictJsonObjectEntry,
  StrictJsonValue,
} from "../json/json-types.js";
import { validateJson } from "../json/json-validator.js";
import { unwrapJsonValue } from "../json/unwrapper.js";
import type { Schema, SchemaType, Typed } from "../schema/schema-types.js";
import {
  typedAny,
  typedArray,
  typedBoolean,
  typedDiscriminatedUnion,
  typedInterface,
  typedNumber,
  typedOptional,
  typedSimpleStringUnion,
  typedString,
  typedStringLiteral,
  typedStringUnion,
} from "../schema/typed.js";
import type { DefinitionLink, ValidationResult } from "../util/shared-types.js";
import { ValidationResultBuilder } from "../util/validation-result-builder.js";
import type {
  Playground,
  PlaygroundValidationResult,
  Sample,
  TemplateTool,
  ValidatedTemplate,
} from "./compiler-types.js";
import { DEFAULT_NAMESPACE } from "./default-namespace.js";
import {
  PLAYGROUND_MODEL_IDS,
  type AnthropicEffort,
  type AnthropicProviderOptions,
  type AnthropicStructuredOutputMode,
  type AnthropicThinking,
  type GoogleHarmBlockThreshold,
  type GoogleHarmCategory,
  type GoogleProviderOptions,
  type GoogleSafetySetting,
  type GoogleThinkingConfig,
  type MistralProviderOptions,
  type MistralReasoningEffort,
  type OpenAIProviderOptions,
  type OpenAIReasoningEffort,
  type PlaygroundModel,
  type PlaygroundModelId,
  type PlaygroundModelReasoning,
  type ProviderOptions,
  type XAIProviderOptions,
  type XAIReasoningEffort,
  type XAISearchRecencyFilter,
} from "./playground-model-types.js";

/** Validates a top-level <playground> element against its target template. */
export function validatePlayground(
  playground: Playground,
  templateValidation: ValidatedTemplate,
): PlaygroundValidationResult {
  const validationResult = new ValidationResultBuilder();
  const definitionLinks: DefinitionLink[] = [
    {
      reference: playground.for,
      definition: templateValidation.template.name,
    },
  ];

  const playgroundModelSchema = makePlaygroundModelType(
    templateValidation.schema,
  );
  const modelJsonResult = validateJson(
    playground.model,
    playgroundModelSchema.type,
    playgroundModelSchema.schema,
  );
  validationResult.push(modelJsonResult);

  const playgroundSchema = makePlaygroundType(
    templateValidation.schema,
    templateValidation.tools,
  );
  const jsonResult = validateJson(
    playground.samples,
    playgroundSchema.type,
    playgroundSchema.schema,
  );
  validationResult.push(jsonResult);

  if (jsonResult.errors.length <= 0) {
    validationResult.push(
      validateSampleToolCalls(playground.samples, templateValidation.tools),
    );
  }

  definitionLinks.push(...validationResult.definitionLinks);

  if (validationResult.errors.length > 0) {
    return {
      kind: "error",
      errors: validationResult.errors,
      definitionLinks,
      playground,
    };
  }

  const samples = unwrapJsonValue<readonly Sample[]>(playground.samples);
  const namespace =
    templateValidation.template.namespace?.text ?? DEFAULT_NAMESPACE;
  const templateId = `${namespace}:${templateValidation.template.name.text}`;
  const model: PlaygroundModel = unwrapJsonValue<PlaygroundModel>(
    playground.model,
  );

  return {
    kind: "playground",
    playground,
    templateId,
    model,
    samples,
    definitionLinks,
  };
}

function makePlaygroundType(
  templateSchema: Schema,
  tools: { readonly [name: string]: TemplateTool },
): SchemaType {
  const { typeDeclarations } = templateSchema;
  const inputType = typeDeclarations["Input"]!.valueType;
  const outputType = typeDeclarations["Output"]!.valueType;

  const stepsType = typedOptional(
    typedArray(
      typedInterface({
        toolCalls: typedArray(
          typedInterface({
            tool: typedStringUnion(
              Object.fromEntries(
                Object.entries(tools).map(([k, t]) => [
                  k,
                  {
                    kind: "unquoted",
                    unquotedName: t.tool.tool.name,
                  },
                ]),
              ),
            ),
            callId: typedString(),
            input: typedAny(),
            output: typedOptional(typedAny()),
          }),
        ),
      }),
    ),
  );

  const samplesType = typedArray(
    typedInterface({
      name: typedOptional(typedString()),
      note: typedOptional(typedString()),
      history: typedOptional(
        typedArray(
          typedInterface({
            input: typedAny(inputType),
            steps: stepsType,
            output: typedAny(outputType),
          }),
        ),
      ),
      input: typedAny(inputType),
      steps: stepsType,
    }),
  );

  return {
    type: samplesType.type,
    schema: templateSchema,
  };
}

function makePlaygroundModelType(templateSchema: Schema): SchemaType {
  const openAIOptions = typedInterface<OpenAIProviderOptions>({
    reasoningEffort: typedOptional(
      typedSimpleStringUnion<OpenAIReasoningEffort>([
        "none",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
      ]),
    ),
    maxCompletionTokens: typedOptional(typedNumber()),
    strictJsonSchema: typedOptional(typedBoolean()),
    logprobs: typedOptional(typedAny()),
  });

  const anthropicThinking = typedDiscriminatedUnion<AnthropicThinking>("type", {
    adaptive: typedInterface({
      type: typedStringLiteral("adaptive"),
      display: typedOptional(
        typedSimpleStringUnion(["omitted", "summarized", "updates"]),
      ),
    }),
    enabled: typedInterface({
      type: typedStringLiteral("enabled"),
      budgetTokens: typedOptional(typedNumber()),
    }),
    disabled: typedInterface({
      type: typedStringLiteral("disabled"),
    }),
  });

  const anthropicOptions = typedInterface<AnthropicProviderOptions>({
    effort: typedOptional(
      typedSimpleStringUnion<AnthropicEffort>([
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
      ]),
    ),
    sendReasoning: typedOptional(typedBoolean()),
    thinking: typedOptional(anthropicThinking),
    structuredOutputMode: typedOptional(
      typedSimpleStringUnion<AnthropicStructuredOutputMode>([
        "outputFormat",
        "jsonTool",
        "auto",
      ]),
    ),
  });

  const googleHarmBlockThreshold =
    typedSimpleStringUnion<GoogleHarmBlockThreshold>([
      "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
      "BLOCK_LOW_AND_ABOVE",
      "BLOCK_MEDIUM_AND_ABOVE",
      "BLOCK_ONLY_HIGH",
      "BLOCK_NONE",
      "OFF",
    ]);

  const googleSafetySetting = typedInterface<GoogleSafetySetting>({
    category: typedSimpleStringUnion<GoogleHarmCategory>([
      "HARM_CATEGORY_UNSPECIFIED",
      "HARM_CATEGORY_HATE_SPEECH",
      "HARM_CATEGORY_DANGEROUS_CONTENT",
      "HARM_CATEGORY_HARASSMENT",
      "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      "HARM_CATEGORY_CIVIC_INTEGRITY",
    ]),
    threshold: googleHarmBlockThreshold,
  });

  const googleThinkingConfig = typedInterface<GoogleThinkingConfig>({
    thinkingBudget: typedOptional(typedNumber()),
    includeThoughts: typedOptional(typedBoolean()),
    thinkingLevel: typedOptional(
      typedSimpleStringUnion(["minimal", "low", "medium", "high"]),
    ),
  });

  const googleOptions = typedInterface<GoogleProviderOptions>({
    thinkingConfig: typedOptional(googleThinkingConfig),
    structuredOutputs: typedOptional(typedBoolean()),
    safetySettings: typedOptional(
      typedArray(googleSafetySetting) as Typed<GoogleSafetySetting[]>,
    ),
    threshold: typedOptional(googleHarmBlockThreshold),
  });

  const xaiOptions = typedInterface<XAIProviderOptions>({
    reasoningEffort: typedOptional(
      typedSimpleStringUnion<XAIReasoningEffort>([
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
      ]),
    ),
    searchRecencyFilter: typedOptional(
      typedSimpleStringUnion<XAISearchRecencyFilter>([
        "month",
        "week",
        "day",
        "hour",
      ]),
    ),
    includeSearchInformation: typedOptional(typedBoolean()),
    sources: typedOptional(typedBoolean()),
  });

  const mistralOptions = typedInterface<MistralProviderOptions>({
    safePrompt: typedOptional(typedBoolean()),
    structuredOutputs: typedOptional(typedBoolean()),
    reasoningEffort: typedOptional(
      typedSimpleStringUnion<MistralReasoningEffort>([
        "none",
        "low",
        "medium",
        "high",
      ]),
    ),
  });

  const providerOptions = typedInterface<ProviderOptions>({
    openai: typedOptional(openAIOptions),
    anthropic: typedOptional(anthropicOptions),
    google: typedOptional(googleOptions),
    xai: typedOptional(xaiOptions),
    mistral: typedOptional(mistralOptions),
  });

  const modelType = typedInterface<PlaygroundModel>({
    model: typedSimpleStringUnion<PlaygroundModelId>(PLAYGROUND_MODEL_IDS),
    maxOutputTokens: typedOptional(typedNumber()),
    maxTokens: typedOptional(typedNumber()),
    temperature: typedOptional(typedNumber()),
    topP: typedOptional(typedNumber()),
    topK: typedOptional(typedNumber()),
    presencePenalty: typedOptional(typedNumber()),
    frequencyPenalty: typedOptional(typedNumber()),
    stopSequences: typedOptional(typedArray(typedString()) as Typed<string[]>),
    seed: typedOptional(typedNumber()),
    reasoning: typedOptional(
      typedSimpleStringUnion<PlaygroundModelReasoning>([
        "provider-default",
        "none",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
      ]),
    ),
    providerOptions: typedOptional(providerOptions),
  });

  return {
    type: modelType.type,
    schema: templateSchema,
  };
}

function validateSampleToolCalls(
  samples: StrictJsonValue,
  tools: { readonly [name: string]: TemplateTool },
): ValidationResult {
  const validationResult = new ValidationResultBuilder();
  if (samples.kind !== "array") {
    return validationResult;
  }
  for (const sample of samples.elements) {
    if (sample.kind !== "object") continue;

    validateStepsToolCalls(sample.entries["steps"], tools, validationResult);

    const historyEntry = sample.entries["history"];
    if (historyEntry && historyEntry.value.kind === "array") {
      for (const item of historyEntry.value.elements) {
        if (item.kind !== "object") continue;
        validateStepsToolCalls(item.entries["steps"], tools, validationResult);
      }
    }
  }
  return validationResult;
}

function validateStepsToolCalls(
  stepsEntry: StrictJsonObjectEntry | undefined,
  tools: { readonly [name: string]: TemplateTool },
  validationResult: ValidationResultBuilder,
): void {
  if (!stepsEntry || stepsEntry.value.kind !== "array") {
    return;
  }
  for (const step of stepsEntry.value.elements) {
    if (step.kind !== "object") continue;
    const toolCallsEntry = step.entries["toolCalls"];
    if (!toolCallsEntry || toolCallsEntry.value.kind !== "array") continue;
    for (const toolCall of toolCallsEntry.value.elements) {
      if (toolCall.kind !== "object") continue;
      const { entries } = toolCall;
      const toolEntry = entries["tool"];
      const inputEntry = entries["input"];
      const outputEntry = entries["output"];
      if (toolEntry?.value.kind !== "string" || !inputEntry) continue;

      const toolName = toolEntry.value.value;
      const templateTool = tools[toolName];
      if (!templateTool || templateTool.tool.kind === "error") continue;

      const { schema } = templateTool.tool;
      const inputType = schema.typeDeclarations["Input"];
      const outputType = schema.typeDeclarations["Output"];
      if (inputType) {
        validationResult.push(
          validateJson(inputEntry.value, inputType.valueType, schema),
        );
      }
      if (outputType && outputEntry) {
        validationResult.push(
          validateJson(outputEntry.value, outputType.valueType, schema),
        );
      }
    }
  }
}
