import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { generateInferenceSetId } from "./inference-id.js";

describe("generateInferenceSetId", () => {
  it("generates an 8-character Base62 string", () => {
    const id = generateInferenceSetId();
    expect(id.length).toBe(8);
    expect(/^[0-9a-zA-Z]{8}$/.test(id)).toBe(true);
  });

  it("generates unique IDs across 1,000 iterations without collisions", () => {
    const ids = new Set<string>();
    const count = 1000;
    for (let i = 0; i < count; i++) {
      const id = generateInferenceSetId();
      expect(id.length).toBe(8);
      expect(/^[0-9a-zA-Z]{8}$/.test(id)).toBe(true);
      ids.add(id);
    }
    expect(ids.size).toBe(count);
  });
});

