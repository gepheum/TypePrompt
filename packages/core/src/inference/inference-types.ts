import type { PlaygroundModel } from "./model-types.js";

/** Result of running inference across all samples in a `<samples>` element. */
export type InferenceSet<Pending = never> = {
  readonly kind: "playground-inference-set";
  /** Unique identifier (UUID) for this inference set. */
  readonly id: string;
  readonly templateId: string;
  /** ISO 8601 timestamp of when the inferences were run. */
  readonly isoTimestamp: string;
  readonly model: PlaygroundModel;
  readonly templateFiles: { readonly [path: string]: string };
  readonly inferences: ReadonlyArray<Inference<Pending>>;
};

/** Result of running inference on a single {@link Sample} in `<samples>`. */
export type Inference<Pending = never> = {
  /** 0-based index of the sample in `<samples>`. */
  readonly sampleIndex: number;
  /** Optional display name from the sample's `name` field. */
  readonly name?: string;
  /** The prompt and conversation history leading up to the inference. */
  readonly request: InferenceRequest;
  /** The outcome of the model call (generated output/tool calls or error) and telemetry. */
  readonly result: InferenceResult<Pending>;
};

/** The rendered prompt and conversation context for a sample inference. */
export type InferenceRequest = {
  readonly systemMessage: string;
  readonly tools: readonly Tool[];
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
  readonly messages: readonly Message[];
};

/** A tool definition available to the model during inference. */
export type Tool = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly inputJsonSchema: { readonly [k: string]: unknown };
};

/** A message in the conversation history. */
export type Message =
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
      readonly toolCalls: readonly ToolCall[];
    }
  | {
      readonly role: "tool";
      readonly toolResults: readonly ToolResult[];
    };

/** A tool call emitted by the model or replayed in conversation history. */
export type ToolCall = {
  readonly callId: string;
  readonly toolName: string;
  readonly input: unknown;
};

/** A tool execution result replayed in conversation history. */
export type ToolResult = {
  readonly callId: string;
  readonly toolName: string;
  readonly output: unknown;
};

/** The outcome of a single sample inference. */
export type InferenceResult<Pending = never> =
  | {
      readonly kind: "success";
      readonly response: InferenceResponse;
      /** Model reasoning / thinking text, if returned by the provider. */
      readonly reasoning?: string;
      readonly telemetry: InferenceTelemetry;
    }
  | {
      readonly kind: "error";
      readonly error: InferenceError;
      /** Model reasoning / thinking text, if any was produced before failure. */
      readonly reasoning?: string;
      /** Present when the LLM call completed but output parsing/validation failed. */
      readonly telemetry?: InferenceTelemetry;
    }
  | Pending;

/** The parsed response returned by the model on a successful inference. */
export type InferenceResponse =
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
      readonly toolCalls: readonly ToolCall[];
    };

/** Details of a failed inference. */
export type InferenceError =
  | {
      readonly kind: "parse-error" | "validation-error";
      readonly message: string;
      readonly rawText: string;
    }
  | {
      readonly kind: "api-error";
      readonly message: string;
    };

/** Latency and token usage metadata for a single LLM call. */
export type InferenceTelemetry = {
  /** End-to-end duration of the LLM call in milliseconds. */
  readonly latencyMs: number;
  readonly usage?: TokenUsage;
};

/** Token consumption breakdown for a single LLM call. */
export type TokenUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens?: number;
  readonly cachedInputTokens?: number;
  readonly totalTokens: number;
};

export type Pending = { readonly kind: "pending" };
