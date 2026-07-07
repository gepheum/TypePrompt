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

export type JsonObject<Mode extends JsonMode> = {
  readonly kind: "object";
  /// The left curly bracket.
  readonly firstToken: JsonSourceSpan;
  readonly entries: readonly JsonObjectEntry<Mode>[];
  readonly ellipsis?: JsonEllipsis;
};

export type JsonObjectEntry<Mode extends JsonMode> = {
  readonly key: JsonString;
  readonly value: JsonValue<Mode>;
};

export type JsonArray<Mode extends JsonMode> = {
  readonly kind: "array";
  /// The left square bracket.
  readonly firstToken: JsonSourceSpan;
  readonly elements: readonly JsonValue<Mode>[];
};

export type JsonString = {
  readonly kind: "string";
  /// The quoted string.
  readonly firstToken: JsonSourceSpan;
  readonly value: string;
};

export type JsonNumber = {
  readonly kind: "number";
  readonly firstToken: JsonSourceSpan;
  readonly value: number;
};

export type JsonBoolean = {
  readonly kind: "boolean";
  readonly firstToken: JsonSourceSpan;
  readonly value: boolean;
};

export type JsonNull = {
  readonly kind: "null";
  readonly firstToken: JsonSourceSpan;
};

export type JsonEllipsis = {
  readonly kind: "ellipsis";
  readonly firstToken: JsonSourceSpan;
};

export type JsonParseErrors = {
  readonly kind: "error";
  readonly errors: readonly JsonParseError[];
};

export type JsonParseError = {
  readonly start: number;
  readonly end: number;
  readonly message: string;
};

export type JsonSourceSpan = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};
