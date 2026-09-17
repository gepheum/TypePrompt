import type { LooseJsonValue } from "../json/json-types.js";
import type { TextSpan } from "../util/shared-types.js";

export type CTag =
  | {
      readonly kind: "json";
      readonly json: LooseJsonValue;
    }
  | {
      readonly kind: "identifier";
      readonly identifier: TextSpan;
    };
