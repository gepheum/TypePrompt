import type { InternalError, Span } from "../util/shared-types.js";

/**
 * In "loose" mode, the JSON source may contain ellipses ("..."") and Javascript
 * comments (single line and multi-line).
 */
export type JsonMode = "strict" | "loose";

export type JsonValue<Mode extends JsonMode> =
  | JsonObject<Mode>
  | JsonArray<Mode>
  | JsonString
  | JsonNumber
  | JsonBoolean
  | JsonNull
  | (Mode extends "loose" ? JsonEllipsis : never);

export type StrictJsonValue = JsonValue<"strict">;
export type LooseJsonValue = JsonValue<"loose">;

export type JsonObject<Mode extends JsonMode> = {
  readonly kind: "object";
  /// The left curly bracket.
  readonly firstToken: Span;
  readonly entries: readonly JsonObjectEntry<Mode>[];
  readonly ellipsis?: JsonEllipsis;
};

export type StrictJsonObject = JsonObject<"strict">;
export type LooseJsonObject = JsonObject<"loose">;

export type JsonObjectEntry<Mode extends JsonMode> = {
  readonly key: JsonString;
  readonly value: JsonValue<Mode>;
};

export type JsonArray<Mode extends JsonMode> = {
  readonly kind: "array";
  /// The left square bracket.
  readonly firstToken: Span;
  readonly elements: readonly JsonValue<Mode>[];
};

export type StrictJsonArray = JsonArray<"strict">;
export type LooseJsonArray = JsonArray<"loose">;

export type JsonString = {
  readonly kind: "string";
  /// The quoted string.
  readonly firstToken: Span;
  readonly value: string;
};

export type JsonNumber = {
  readonly kind: "number";
  readonly firstToken: Span;
  readonly value: number;
};

export type JsonBoolean = {
  readonly kind: "boolean";
  readonly firstToken: Span;
  readonly value: boolean;
};

export type JsonNull = {
  readonly kind: "null";
  readonly firstToken: Span;
};

export type JsonEllipsis = {
  readonly kind: "ellipsis";
  readonly firstToken: Span;
};

export type JsonTypeMatch =
  | { readonly kind: "match" }
  | {
      readonly kind: "mismatch";
      readonly details?: {
        readonly reason: InternalError;
        /** In [0, 1]. Used to infer which of two mismatches was closer to a match. */
        readonly matchScore: number;
      };
    };
