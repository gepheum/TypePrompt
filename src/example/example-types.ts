import type {
  JsonParseError,
  JsonSourceSpan,
  JsonValue,
} from "../json/json-types.js";

export type Example =
  | {
      readonly kind: "success:json";
      readonly json: JsonValue<"loose">;
      readonly identifier?: undefined;
    }
  | {
      readonly kind: "success:identifier";
      /** Unquoted identifier. */
      readonly identifier: JsonSourceSpan;
      readonly json?: undefined;
    };

export type ExampleParseErrors = {
  readonly kind: "error";
  readonly errors: readonly JsonParseError[];
};

export type ExampleValidationError = {
  sourceSpan: JsonSourceSpan;
  message: string;
};
