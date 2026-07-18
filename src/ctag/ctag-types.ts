import type { JsonValue } from "../json/json-types.js";
import type { SourceSpan } from "../util/error-types.js";

export type CTag =
  | {
      readonly kind: "json";
      readonly json: JsonValue<"loose">;
    }
  | {
      readonly kind: "identifier";
      /** Unquoted identifier. */
      readonly identifier: SourceSpan;
    };
