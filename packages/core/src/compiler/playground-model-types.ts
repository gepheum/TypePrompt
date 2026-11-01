/**
 * Configuration options for the model used in the playground.
 */
export interface PlaygroundModel {
  /**
   * The model identifier to use (e.g. 'openai/gpt-4o', 'anthropic/claude-sonnet-4.5').
   */
  model: PlaygroundModelId;

  /**
   * Maximum number of tokens to generate.
   */
  maxOutputTokens?: number;

  /**
   * Alias for `maxOutputTokens`.
   */
  maxTokens?: number;

  /**
   * Sampling temperature. Usually between 0 and 2.
   */
  temperature?: number;

  /**
   * Nucleus sampling probability threshold (top-p).
   */
  topP?: number;

  /**
   * Top-k sampling threshold.
   */
  topK?: number;

  /**
   * Presence penalty setting (-2 to 2 or -1 to 1 depending on provider).
   */
  presencePenalty?: number;

  /**
   * Frequency penalty setting (-2 to 2 or -1 to 1 depending on provider).
   */
  frequencyPenalty?: number;

  /**
   * Stop sequences that will halt generation when encountered.
   */
  stopSequences?: string[];

  /**
   * Random seed for deterministic generation.
   */
  seed?: number;

  /**
   * Reasoning effort level for reasoning models.
   */
  reasoning?: PlaygroundModelReasoning;

  /**
   * Provider-specific options for openai, anthropic, google, xai, mistral, etc.
   */
  providerOptions?: ProviderOptions;
}

/**
 * Provider-specific option configurations for supported AI model providers.
 */
export interface ProviderOptions {
  openai?: OpenAIProviderOptions;
  anthropic?: AnthropicProviderOptions;
  google?: GoogleProviderOptions;
  xai?: XAIProviderOptions;
  mistral?: MistralProviderOptions;
}

/**
 * Options specific to the OpenAI provider.
 */
export interface OpenAIProviderOptions {
  /**
   * Reasoning effort level for reasoning models (e.g. o1, o3, o4).
   */
  reasoningEffort?: OpenAIReasoningEffort;

  /**
   * Maximum number of completion tokens to generate.
   */
  maxCompletionTokens?: number;

  /**
   * Whether to enable strict JSON schema enforcement for structured outputs.
   */
  strictJsonSchema?: boolean;

  /**
   * Whether to return log probabilities of the output tokens or number of top logprobs.
   */
  logprobs?: number | boolean;
}

/**
 * Options specific to the Anthropic (Claude) provider.
 */
export interface AnthropicProviderOptions {
  /**
   * Reasoning effort level for Claude models.
   */
  effort?: AnthropicEffort;

  /**
   * Whether to return thinking/reasoning blocks in the response.
   */
  sendReasoning?: boolean;

  /**
   * Thinking configuration for Claude models.
   */
  thinking?: AnthropicThinking;

  /**
   * How structured outputs should be guided.
   */
  structuredOutputMode?: AnthropicStructuredOutputMode;
}

/**
 * Options specific to the Google (Gemini) provider.
 */
export interface GoogleProviderOptions {
  /**
   * Thinking budget and configuration for Gemini models.
   */
  thinkingConfig?: GoogleThinkingConfig;

  /**
   * Whether to enforce structured JSON outputs adhering to the response schema.
   */
  structuredOutputs?: boolean;

  /**
   * Safety settings to override default safety thresholds.
   */
  safetySettings?: GoogleSafetySetting[];

  /**
   * Default harm block threshold across all categories.
   */
  threshold?: GoogleHarmBlockThreshold;
}

/**
 * Options specific to the xAI (Grok) provider.
 */
export interface XAIProviderOptions {
  /**
   * Reasoning effort level for Grok reasoning models.
   */
  reasoningEffort?: XAIReasoningEffort;

  /**
   * Search recency filter when live search is enabled.
   */
  searchRecencyFilter?: XAISearchRecencyFilter;

  /**
   * Whether to include search query and source metadata in the response.
   */
  includeSearchInformation?: boolean;

  /**
   * Whether to cite web sources in responses.
   */
  sources?: boolean;
}

/**
 * Options specific to the Mistral provider.
 */
export interface MistralProviderOptions {
  /**
   * Whether to inject Mistral's safety prompt before conversations.
   */
  safePrompt?: boolean;

  /**
   * Whether to enable strict structured outputs following provided schemas.
   */
  structuredOutputs?: boolean;

  /**
   * Reasoning effort level for Mistral reasoning models.
   */
  reasoningEffort?: MistralReasoningEffort;
}

/**
 * Thinking configuration for Anthropic models.
 */
export type AnthropicThinking =
  | {
      type: "adaptive";
      display?: "omitted" | "summarized" | "updates";
    }
  | {
      type: "enabled";
      budgetTokens?: number;
    }
  | {
      type: "disabled";
    };

/**
 * Thinking configuration for Google Gemini models.
 */
export interface GoogleThinkingConfig {
  thinkingBudget?: number;
  includeThoughts?: boolean;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
}

/**
 * Safety setting override for Google Gemini models.
 */
export interface GoogleSafetySetting {
  category: GoogleHarmCategory;
  threshold: GoogleHarmBlockThreshold;
}

/**
 * Structured output guidance mode for Anthropic models.
 */
export type AnthropicStructuredOutputMode =
  "outputFormat" | "jsonTool" | "auto";

/**
 * Harm categories for Google safety settings.
 */
export type GoogleHarmCategory =
  | "HARM_CATEGORY_UNSPECIFIED"
  | "HARM_CATEGORY_HATE_SPEECH"
  | "HARM_CATEGORY_DANGEROUS_CONTENT"
  | "HARM_CATEGORY_HARASSMENT"
  | "HARM_CATEGORY_SEXUALLY_EXPLICIT"
  | "HARM_CATEGORY_CIVIC_INTEGRITY";

/**
 * Harm block thresholds for Google safety settings.
 */
export type GoogleHarmBlockThreshold =
  | "HARM_BLOCK_THRESHOLD_UNSPECIFIED"
  | "BLOCK_LOW_AND_ABOVE"
  | "BLOCK_MEDIUM_AND_ABOVE"
  | "BLOCK_ONLY_HIGH"
  | "BLOCK_NONE"
  | "OFF";

/**
 * Recency filter for xAI live search.
 */
export type XAISearchRecencyFilter = "month" | "week" | "day" | "hour";

/**
 * Reasoning effort for OpenAI reasoning models.
 */
export type OpenAIReasoningEffort =
  "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Reasoning effort for Anthropic models.
 */
export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Reasoning effort for xAI reasoning models.
 */
export type XAIReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

/**
 * Reasoning effort for Mistral reasoning models.
 */
export type MistralReasoningEffort = "none" | "low" | "medium" | "high";

/**
 * Reasoning effort level for models supporting reasoning.
 */
export type PlaygroundModelReasoning =
  | "provider-default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/**
 * Model identifiers supported by the Vercel AI SDK Gateway.
 */
export const PLAYGROUND_MODEL_IDS = [
  "alibaba/qwen-3-14b",
  "alibaba/qwen-3-235b",
  "alibaba/qwen-3-30b",
  "alibaba/qwen-3-32b",
  "alibaba/qwen3-coder",
  "alibaba/qwen3-coder-30b-a3b",
  "alibaba/qwen3-coder-next",
  "alibaba/qwen3-max-thinking",
  "alibaba/qwen3-next-80b-a3b-instruct",
  "alibaba/qwen3-next-80b-a3b-thinking",
  "alibaba/qwen3-vl-instruct",
  "alibaba/qwen3.5-flash",
  "alibaba/qwen3.5-plus",
  "alibaba/qwen3.6-27b",
  "alibaba/qwen3.6-plus",
  "alibaba/qwen3.7-flash",
  "alibaba/qwen3.7-max",
  "alibaba/qwen3.7-plus",
  "alibaba/qwen3.8-2.4t-a95b",
  "alibaba/qwen3.8-27b",
  "alibaba/qwen3.8-flash",
  "alibaba/qwen3.8-max",
  "alibaba/qwen3.8-max-0902",
  "alibaba/qwen3.8-max-prime",
  "alibaba/qwen3.8-omni-flash",
  "amazon/nova-2-lite",
  "amazon/nova-lite",
  "amazon/nova-micro",
  "amazon/nova-pro",
  "anthropic/claude-fable-5",
  "anthropic/claude-fable-5-batch",
  "anthropic/claude-fable-5.1",
  "anthropic/claude-fable-5.1-batch",
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-haiku-4.5-batch",
  "anthropic/claude-haiku-5.5",
  "anthropic/claude-haiku-5.5-batch",
  "anthropic/claude-opus-4.5",
  "anthropic/claude-opus-4.5-batch",
  "anthropic/claude-opus-4.6",
  "anthropic/claude-opus-4.6-batch",
  "anthropic/claude-opus-4.7",
  "anthropic/claude-opus-4.7-batch",
  "anthropic/claude-opus-4.8",
  "anthropic/claude-opus-4.8-batch",
  "anthropic/claude-opus-4.8-fast",
  "anthropic/claude-opus-5",
  "anthropic/claude-opus-5-batch",
  "anthropic/claude-opus-5-fast",
  "anthropic/claude-opus-5.5",
  "anthropic/claude-opus-5.5-batch",
  "anthropic/claude-opus-5.5-fast",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-sonnet-4.5-batch",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-sonnet-4.6-batch",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-sonnet-5-batch",
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-sonnet-5.5-batch",
  "arcee-ai/trinity-large-thinking",
  "bytedance/seed-1.6",
  "bytedance/seed-1.8",
  "bytedance/seed-2.1-turbo",
  "callstack/apex",
  "cohere/command-a",
  "deepseek/deepseek-r1",
  "deepseek/deepseek-v3.1",
  "deepseek/deepseek-v3.2",
  "deepseek/deepseek-v3.2-thinking",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-flash-0731",
  "deepseek/deepseek-v4-flash-vision-exp",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4-pro-0813",
  "deepseek/deepseek-v4.1-flash",
  "deepseek/deepseek-v4.1-flash-1017",
  "deepseek/deepseek-v4.1-flash-1017-fast",
  "deepseek/deepseek-v4.1-flash-fast",
  "elorian/glimpse",
  "fireworks/ember-1",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-batch",
  "google/gemini-2.5-flash-image",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash-lite-batch",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-pro-batch",
  "google/gemini-3-flash",
  "google/gemini-3-flash-batch",
  "google/gemini-3-pro-image",
  "google/gemini-3.1-flash-image",
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3.1-flash-lite",
  "google/gemini-3.1-flash-lite-batch",
  "google/gemini-3.1-flash-lite-image",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.1-pro-preview-batch",
  "google/gemini-3.5-flash",
  "google/gemini-3.5-flash-batch",
  "google/gemini-3.5-flash-lite",
  "google/gemini-3.5-flash-lite-batch",
  "google/gemini-3.6-flash",
  "google/gemini-3.6-flash-batch",
  "google/gemini-3.7-flash",
  "google/gemini-3.7-flash-batch",
  "google/gemini-3.8-flash",
  "google/gemini-4-argon",
  "google/gemini-nano-banana-2.1",
  "google/gemini-omni-flash-preview",
  "google/gemma-4-26b-a4b-it",
  "google/gemma-4-31b-it",
  "inception/mercury-2",
  "inception/mercury-2.5",
  "inception/mercury-3",
  "inception/mercury-coder-small",
  "inclusionai/ling-3.0-flash",
  "inclusionai/ling-3.0-flash-fin",
  "inclusionai/ling-3.0-flash-sante",
  "inclusionai/ling-3.0-flash-vl",
  "inclusionai/ling-3.1-flash",
  "inference-net/schematron-v2-small",
  "inference-net/schematron-v2-turbo",
  "interfaze/interfaze-beta",
  "liquid/lfm2.5-24b-a2b",
  "meituan/longcat-2.5-preview",
  "meta/llama-3.1-70b",
  "meta/llama-3.1-8b",
  "meta/llama-3.3-70b",
  "meta/llama-4-maverick",
  "meta/llama-4-scout",
  "meta/muse-glimmer-30b",
  "meta/muse-spark-1.1",
  "meta/muse-spark-1.2",
  "meta/muse-spark-1.2-contributor",
  "meta/muse-spark-1.3",
  "meta/muse-spark-1.3-contributor",
  "meta/muse-spark-open",
  "meta/muse-wonder-1.0",
  "minimax/minimax-m2",
  "minimax/minimax-m2.1",
  "minimax/minimax-m2.1-lightning",
  "minimax/minimax-m2.5",
  "minimax/minimax-m2.5-highspeed",
  "minimax/minimax-m2.7",
  "minimax/minimax-m2.7-highspeed",
  "minimax/minimax-m3",
  "minimax/minimax-m3.1-flash",
  "mistral/codestral",
  "mistral/ministral-14b",
  "mistral/ministral-3b",
  "mistral/ministral-8b",
  "mistral/mistral-large-3",
  "mistral/mistral-large-4",
  "mistral/mistral-medium-3.5",
  "mistral/mistral-nemo",
  "mistral/mistral-small",
  "mixedbread/toast-1",
  "moonshotai/kimi-k2",
  "moonshotai/kimi-k2.5",
  "moonshotai/kimi-k2.6",
  "moonshotai/kimi-k2.7-code",
  "moonshotai/kimi-k2.7-code-highspeed",
  "moonshotai/kimi-k3",
  "moonshotai/kimi-k3-fast",
  "moonshotai/kimi-k3.1-pro",
  "moonshotai/kimi-k3.1-pro-highspeed",
  "morph/morph-v3-fast",
  "morph/morph-v3-large",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3.5-lightning",
  "nvidia/nemotron-3.5-lightning-free",
  "nvidia/nemotron-3.5-super-vl",
  "nvidia/nemotron-nano-12b-v2-vl",
  "nvidia/nemotron-nano-9b-v2",
  "openai/gpt-4.1",
  "openai/gpt-4.1-batch",
  "openai/gpt-4.1-fast",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1-mini-batch",
  "openai/gpt-4.1-mini-fast",
  "openai/gpt-4.1-nano",
  "openai/gpt-4o",
  "openai/gpt-4o-batch",
  "openai/gpt-4o-fast",
  "openai/gpt-4o-mini",
  "openai/gpt-4o-mini-batch",
  "openai/gpt-4o-mini-fast",
  "openai/gpt-5",
  "openai/gpt-5-batch",
  "openai/gpt-5-codex",
  "openai/gpt-5-fast",
  "openai/gpt-5-mini",
  "openai/gpt-5-mini-batch",
  "openai/gpt-5-mini-fast",
  "openai/gpt-5-nano",
  "openai/gpt-5-nano-batch",
  "openai/gpt-5-pro",
  "openai/gpt-5-pro-batch",
  "openai/gpt-5.1-codex",
  "openai/gpt-5.1-codex-max",
  "openai/gpt-5.1-codex-mini",
  "openai/gpt-5.1-thinking",
  "openai/gpt-5.1-thinking-fast",
  "openai/gpt-5.2",
  "openai/gpt-5.2-batch",
  "openai/gpt-5.2-codex",
  "openai/gpt-5.2-fast",
  "openai/gpt-5.2-pro",
  "openai/gpt-5.3-codex",
  "openai/gpt-5.3-codex-fast",
  "openai/gpt-5.4",
  "openai/gpt-5.4-batch",
  "openai/gpt-5.4-fast",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-mini-batch",
  "openai/gpt-5.4-mini-fast",
  "openai/gpt-5.4-nano",
  "openai/gpt-5.4-nano-batch",
  "openai/gpt-5.4-pro",
  "openai/gpt-5.5",
  "openai/gpt-5.5-batch",
  "openai/gpt-5.5-fast",
  "openai/gpt-5.5-pro",
  "openai/gpt-5.5-pro-batch",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.6-luna-batch",
  "openai/gpt-5.6-luna-fast",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-sol-batch",
  "openai/gpt-5.6-sol-fast",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-terra-batch",
  "openai/gpt-5.6-terra-fast",
  "openai/gpt-6-astra",
  "openai/gpt-6-astra-batch",
  "openai/gpt-6-astra-fast",
  "openai/gpt-6-luna",
  "openai/gpt-6-luna-batch",
  "openai/gpt-6-luna-fast",
  "openai/gpt-6-sol",
  "openai/gpt-6-sol-batch",
  "openai/gpt-6-sol-fast",
  "openai/gpt-6.1-sol",
  "openai/gpt-6.1-sol-batch",
  "openai/gpt-6.1-sol-fast",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-safeguard-120b",
  "openai/gpt-oss-safeguard-20b",
  "openai/o1",
  "openai/o3",
  "openai/o3-fast",
  "openai/o3-mini",
  "openai/o3-pro",
  "openai/o4-mini",
  "perplexity/sonar",
  "poolside/laguna-s-2.1",
  "poolside/laguna-s-2.1-free",
  "quiverai/arrow-2",
  "quiverai/arrow-2-telos",
  "reflection/beam",
  "reflection/beam-free",
  "sakana/fugu-max",
  "sakana/fugu-ultra",
  "sakana/fugu-ultra-v2",
  "sakana/namazu",
  "scaledown/scaledown-extract-1",
  "scaledown/scaledown-summarize-1",
  "spacexai/grok-4.20-multi-agent",
  "spacexai/grok-4.20-multi-agent-batch",
  "spacexai/grok-4.20-multi-agent-beta",
  "spacexai/grok-4.20-non-reasoning",
  "spacexai/grok-4.20-non-reasoning-batch",
  "spacexai/grok-4.20-non-reasoning-beta",
  "spacexai/grok-4.20-reasoning",
  "spacexai/grok-4.20-reasoning-batch",
  "spacexai/grok-4.20-reasoning-beta",
  "spacexai/grok-4.3",
  "spacexai/grok-4.3-batch",
  "spacexai/grok-4.5",
  "spacexai/grok-4.6",
  "spacexai/grok-4.7",
  "spacexai/grok-build-0.1",
  "stealth/glyph-cluster",
  "stepfun/step-3.7-flash",
  "stepfun/step-5-preview",
  "tencent/hy-mt2-lite",
  "tencent/hy-mt2-plus",
  "tencent/hy-mt2-pro",
  "tencent/hy3",
  "tencent/hy4-preview",
  "thinkingmachines/inkling",
  "thinkingmachines/inkling-small",
  "xiaomi/mimo-v2.5",
  "xiaomi/mimo-v2.5-pro",
  "xiaomi/mimo-v2.6-flash",
  "xiaomi/mimo-v2.6-pro",
  "xiaomi/mimo-v2.6-pro-ultraspeed",
  "zai/glm-4.5",
  "zai/glm-4.5-air",
  "zai/glm-4.5v",
  "zai/glm-4.6",
  "zai/glm-4.7",
  "zai/glm-4.7-flash",
  "zai/glm-4.7-flashx",
  "zai/glm-5",
  "zai/glm-5-turbo",
  "zai/glm-5.1",
  "zai/glm-5.2",
  "zai/glm-5.2-fast",
  "zai/glm-5.3",
  "zai/glm-5.3-fast",
  "zai/glm-5.3-flash",
  "zai/glm-5.3-flashx",
  "zai/glm-5v-turbo",
] as const;

export type PlaygroundModelId = (typeof PLAYGROUND_MODEL_IDS)[number];

export type GatewayModelId = PlaygroundModelId;
export type ModelId = PlaygroundModelId;
