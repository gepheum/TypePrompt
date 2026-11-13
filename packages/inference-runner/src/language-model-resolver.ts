import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { ApiKeys, PlaygroundModel } from "@typeprompt/core";
import { createGateway, type LanguageModel } from "ai";

export type TryResolveLanguageModelResult =
  | {
      readonly kind: "success";
      readonly languageModel: LanguageModel;
    }
  | {
      readonly kind: "error";
      readonly shortMessage: string;
      readonly detailedMessage: string;
    };

/**
 * Attempts to resolve a Vercel AI SDK {@link LanguageModel} from a {@link PlaygroundModel}
 * and configured {@link ApiKeys}:
 * - If `apiKeys` is not specified, returns an error instructing to create
 *     `.typeprompt.secrets.yaml`.
 * - For supported providers, uses the provider's SDK key if present, falling back to
 * `vercelGateway`.
 * - For all other providers, requires `vercelGateway`.
 */
export function tryResolveLanguageModel(
  model: PlaygroundModel,
  apiKeys?: ApiKeys,
): TryResolveLanguageModelResult {
  if (!apiKeys) {
    return {
      kind: "error",
      shortMessage: "No API keys configured",
      detailedMessage: [
        [
          "No API keys configured.",
          "Create a .typeprompt.secrets.yaml file in your project directory and set the API keys for the provider(s) you want to support.",
          "Example:",
        ].join(" "),
        "",
        "```yaml",
        "# .typeprompt.secrets.yaml",
        "",
        "apiKeys:",
        "  openai: sk-...",
        "  anthropic: sk-...",
        "  google: AIzaSy...",
        "  # or use Vercel AI Gateway to access all providers:",
        "  vercelGateway: ...",
        "```",
      ].join("\n"),
    };
  }

  const modelId = model.model;
  const slashIndex = modelId.indexOf("/");
  const prefix = slashIndex >= 0 ? modelId.slice(0, slashIndex) : "";
  const providerModelName =
    slashIndex >= 0 ? modelId.slice(slashIndex + 1) : modelId;

  const directProvider = MODEL_PREFIX_TO_PROVIDER[prefix];

  if (directProvider !== undefined) {
    const providerKey = apiKeys[directProvider];
    if (providerKey) {
      return {
        kind: "success",
        languageModel: DIRECT_PROVIDERS[directProvider]({
          apiKey: providerKey,
        })(providerModelName),
      };
    }
    if (apiKeys.vercelGateway) {
      return {
        kind: "success",
        languageModel: createGateway({ apiKey: apiKeys.vercelGateway })(
          modelId,
        ),
      };
    }
    const shortMessage = `Missing '${directProvider}' or 'vercelGateway' API key`;
    const detailedMessage = `Missing API key for model '${modelId}': provide '${directProvider}' or 'vercelGateway' API key`;
    return {
      kind: "error",
      shortMessage,
      detailedMessage,
    };
  }

  if (apiKeys.vercelGateway) {
    return {
      kind: "success",
      languageModel: createGateway({ apiKey: apiKeys.vercelGateway })(modelId),
    };
  }

  const shortMessage = "Missing 'vercelGateway' API key";
  const detailedMessage = `Missing 'vercelGateway' API key for model '${modelId}'`;
  return {
    kind: "error",
    shortMessage,
    detailedMessage,
  };
}

const DIRECT_PROVIDERS: {
  readonly [
    P in "openai" | "anthropic" | "google" | "xai" | "mistral"
  ]: (options: { apiKey: string }) => (modelId: string) => LanguageModel;
} = {
  openai: createOpenAI,
  anthropic: createAnthropic,
  google: createGoogleGenerativeAI,
  xai: createXai,
  mistral: createMistral,
};

type DirectProvider = keyof typeof DIRECT_PROVIDERS;

const MODEL_PREFIX_TO_PROVIDER: {
  readonly [prefix: string]: DirectProvider;
} = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  xai: "xai",
  spacexai: "xai",
  mistral: "mistral",
};
