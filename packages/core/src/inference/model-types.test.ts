import type { GatewayModelId } from "@ai-sdk/gateway";
import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { PLAYGROUND_MODEL_IDS, type PlaygroundModelId } from "./model-types.js";

// Distributive conditional type: removes `(string & {})` while preserving literal string types.
// For string literals, `string extends "model"` is false (so the literal is kept).
// For `(string & {})`, `string extends (string & {})` is true (so it converts to never).
type ExtractLiterals<T> = T extends any
  ? string extends T
    ? never
    : T
  : never;
type VercelGatewayModelId = ExtractLiterals<GatewayModelId>;

type AssertExactMatch<Actual, Expected> = [Exclude<Actual, Expected>] extends [
  never,
]
  ? [Exclude<Expected, Actual>] extends [never]
    ? true
    : {
        readonly error: "Missing models from list";
        readonly missing: Exclude<Expected, Actual>;
      }
  : {
      readonly error: "Unexpected extra models in list";
      readonly extra: Exclude<Actual, Expected>;
    };

type Expect<T extends true> = T;

// Static type check: fails TypeScript compilation if PLAYGROUND_MODEL_IDS diverges from Vercel GatewayModelId
type _ParityCheck = Expect<
  AssertExactMatch<PlaygroundModelId, VercelGatewayModelId>
>;

describe("PlaygroundModelId parity with @ai-sdk/gateway", () => {
  it("has no duplicate entries in PLAYGROUND_MODEL_IDS", () => {
    const unique = new Set(PLAYGROUND_MODEL_IDS);
    expect(unique.size).toBe(PLAYGROUND_MODEL_IDS.length);
  });

  it("statically typechecks parity with Vercel GatewayModelId", () => {
    // If _ParityCheck evaluates to anything other than true, tsc will fail.
    const assertion: _ParityCheck = true;
    expect(assertion).toBe(true);
  });
});
