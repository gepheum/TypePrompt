import type { JsonValue } from "../json/json-types.js";
import type { SourceSpan } from "../util/error-types.js";

export type Example =
  | {
      readonly kind: "success:json";
      readonly json: JsonValue<"loose">;
      readonly identifier?: undefined;
    }
  | {
      readonly kind: "success:identifier";
      /** Unquoted identifier. */
      readonly identifier: SourceSpan;
      readonly json?: undefined;
    };
