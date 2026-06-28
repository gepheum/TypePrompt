export type Example =
  | {
      readonly kind: "success:json";
      readonly json: JsonValue;
      readonly identifier?: undefined;
    }
  | {
      readonly kind: "success:identifier";
      /** Unquoted identifier. */
      readonly identifier: ExampleSourceSpan;
      readonly json?: undefined;
    };

export type ExampleParseErrors = {
  readonly kind: "error";
  readonly errors: readonly ExampleParseError[];
};

export type ExampleParseError = {
  readonly start: number;
  readonly end: number;
  readonly message: string;
};

export type JsonValue =
  | JsonObject
  | JsonArray
  | JsonString
  | JsonNumber
  | JsonBoolean
  | JsonNull
  | JsonEllipsis;

export type JsonObject = {
  readonly kind: "object";
  /// The left curly bracket.
  readonly firstToken: ExampleSourceSpan;
  readonly entries: readonly JsonObjectEntry[];
  readonly ellipsis?: JsonEllipsis;
};

export type JsonObjectEntry = {
  readonly key: JsonString;
  readonly value: JsonValue;
};

export type JsonArray = {
  readonly kind: "array";
  /// The left square bracket.
  readonly firstToken: ExampleSourceSpan;
  readonly values: readonly JsonValue[];
};

export type JsonString = {
  readonly kind: "string";
  /// The quoted string.
  readonly firstToken: ExampleSourceSpan;
  readonly value: string;
};

export type JsonNumber = {
  readonly kind: "number";
  readonly firstToken: ExampleSourceSpan;
  readonly value: number;
};

export type JsonBoolean = {
  readonly kind: "boolean";
  readonly firstToken: ExampleSourceSpan;
  readonly value: boolean;
};

export type JsonNull = {
  readonly kind: "null";
  readonly firstToken: ExampleSourceSpan;
};

export type JsonEllipsis = {
  readonly kind: "ellipsis";
  readonly firstToken: ExampleSourceSpan;
};

export type ExampleSourceSpan = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};

export type ExampleValidationError = {
  sourceSpan: ExampleSourceSpan;
  message: string;
};
