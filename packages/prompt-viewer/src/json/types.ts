// To use instead of `any`
export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [name: string]: Json };

// -----------------------------------------------------------------------------
// ERRORS
// -----------------------------------------------------------------------------

export interface JsonError {
  readonly kind: "error";
  readonly segment: Segment;
  readonly message: string;
}

// -----------------------------------------------------------------------------
// PARSING
// -----------------------------------------------------------------------------

export interface JsonParseResult {
  /// If `undefined`, then `errors` is guaranteed not to be empty.
  readonly value: JsonValue | undefined;
  readonly errors: readonly JsonError[];
  /// Set of edits to apply to the original JSON code to fix formatting and
  // comma errors (no comma between consecutive values, trailing comma).
  readonly edits: readonly JsonEdit[];
}

export type JsonValue = JsonArray | JsonObject | JsonLiteral;

export interface JsonArray {
  readonly kind: "array";
  /// Position of the '[' token.
  readonly firstToken: Segment;
  /// From '[' to ']' included.
  readonly segment: Segment;
  readonly values: JsonValue[];
  readonly indent: number;
}

export interface JsonKey {
  readonly keySegment: Segment;
  readonly key: string;
}

export interface JsonKeyValue {
  readonly keySegment: Segment;
  readonly key: string;
  readonly value: JsonValue;
}

export interface JsonObject {
  readonly kind: "object";
  /// Position of the '{' token.
  readonly firstToken: Segment;
  /// From '{' to '}' included.
  readonly segment: Segment;
  readonly keyValues: { readonly [key: string]: JsonKeyValue };
  /// Includes "broken" keys which produced a parsing error.
  readonly allKeys: readonly JsonKey[];
  readonly indent: number;
}

export interface JsonLiteral {
  readonly kind: "literal";
  /// Position of the first and only token. Same as `segment`.
  readonly firstToken: Segment;
  readonly segment: Segment;
  readonly jsonCode: string;
  readonly type: "boolean" | "null" | "number" | "string";
  readonly indent: number;
}

export interface Segment {
  readonly start: number;
  readonly end: number;
}

export interface JsonEdit {
  readonly segment: Segment;
  readonly replacement: string;
}
