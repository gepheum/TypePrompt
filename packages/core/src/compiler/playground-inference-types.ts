import type { PlaygroundModel } from "./playground-model-types.js";

/**
 * Result of running inference across all samples in a `<samples>` element.
 */
export type PlaygroundInferenceSet = {
  readonly kind: "playground-inference-set";
  readonly model: PlaygroundModel;
  readonly templateId: string;
  /** ISO 8601 timestamp of when the inferences were run. */
  readonly isoTimestamp: string;
  readonly templateFiles: { readonly [path: string]: string };
  readonly inferences: readonly PlaygroundInference[];
};

/**
 * Result of running inference on a single {@link Sample} in `<samples>`.
 */
export type PlaygroundInference = {
  /** 0-based index of the sample in `<samples>`. */
  readonly sampleIndex: number;
  /** Optional display name from the sample's `name` field. */
  readonly name?: string;
  /** The prompt and conversation history leading up to the inference. */
  readonly request: PlaygroundInferenceRequest;
  /** The outcome of the model call (generated output/tool calls or error) and telemetry. */
  readonly result: PlaygroundInferenceResult;
};

/**
 * The prompt and conversation context for a sample inference.
 */
export type PlaygroundInferenceRequest = {
  readonly systemMessage: string;
  readonly tools: readonly PlaygroundTool[];
  readonly outputFormat:
    | {
        readonly format: "json";
        readonly jsonSchema: { readonly [k: string]: unknown };
      }
    | {
        readonly format: "text";
      };
  /**
   * Conversation history leading up to the model call (few-shot examples,
   * prior `history` turns, current rendered user message, and intermediate `steps`).
   */
  readonly messages: readonly PlaygroundMessage[];
};

/**
 * A tool definition available to the model during inference.
 */
export type PlaygroundTool = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly inputJsonSchema: { readonly [k: string]: unknown };
};

/**
 * A message in the conversation history.
 */
export type PlaygroundMessage =
  | {
      readonly role: "user";
      readonly input: unknown;
      readonly rendered: string;
    }
  | {
      readonly role: "assistant";
      readonly output: unknown;
      readonly toolCalls?: undefined;
    }
  | {
      readonly role: "assistant";
      readonly output?: undefined;
      readonly toolCalls: readonly PlaygroundToolCall[];
    }
  | {
      readonly role: "tool";
      readonly toolResults: readonly PlaygroundToolResult[];
    };

/**
 * A tool call emitted by the model or replayed in conversation history.
 */
export type PlaygroundToolCall = {
  readonly callId: string;
  readonly toolName: string;
  readonly input: unknown;
};

/**
 * A tool execution result replayed in conversation history.
 */
export type PlaygroundToolResult = {
  readonly callId: string;
  readonly toolName: string;
  readonly output: unknown;
};

/**
 * The outcome of a single sample inference.
 */
export type PlaygroundInferenceResult =
  | {
      readonly kind: "success";
      readonly response: PlaygroundInferenceResponse;
      /** Model reasoning / thinking text, if returned by the provider. */
      readonly reasoning?: string;
      readonly telemetry: PlaygroundInferenceTelemetry;
    }
  | {
      readonly kind: "error";
      readonly error: PlaygroundInferenceError;
      /** Model reasoning / thinking text, if any was produced before failure. */
      readonly reasoning?: string;
      /** Present when the LLM call completed but output parsing/validation failed. */
      readonly telemetry?: PlaygroundInferenceTelemetry;
    };

/**
 * The parsed response returned by the model on a successful inference.
 */
export type PlaygroundInferenceResponse =
  | {
      readonly kind: "output";
      /** Raw text returned by the model. */
      readonly rawText: string;
      /** Parsed and validated output value matching the template's `Output` type. */
      readonly output: unknown;
    }
  | {
      readonly kind: "tool-calls";
      /** Tool calls requested by the model. */
      readonly toolCalls: readonly PlaygroundToolCall[];
    };

/**
 * Details of a failed inference.
 */
export type PlaygroundInferenceError =
  | {
      readonly kind: "parse-error" | "validation-error";
      readonly message: string;
      readonly rawText: string;
    }
  | {
      readonly kind: "api-error";
      readonly message: string;
    };

/**
 * Latency and token usage metadata for a single LLM call.
 */
export type PlaygroundInferenceTelemetry = {
  /** End-to-end duration of the LLM call in milliseconds. */
  readonly latencyMs: number;
  readonly usage?: PlaygroundTokenUsage;
};

/**
 * Token consumption breakdown for a single LLM call.
 */
export type PlaygroundTokenUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens?: number;
  readonly cachedInputTokens?: number;
  readonly totalTokens: number;
};
