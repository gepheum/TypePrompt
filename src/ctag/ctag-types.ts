import type { JsonValue } from "../json/json-types.js";
import type { Span } from "../util/common-types.js";

export type CTag =
  | {
      readonly kind: "json";
      readonly json: JsonValue<"loose">;
    }
  | {
      readonly kind: "identifier";
      /** Unquoted identifier. */
      readonly identifier: Span;
    };
