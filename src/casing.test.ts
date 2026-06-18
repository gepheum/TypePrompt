import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { checkConsistentCasing } from "./casing.js";

describe("checkConsistentCasing", () => {
  it("returns no errors when all casings are consistent", () => {
    const result = checkConsistentCasing([
      { name: "Response", start: 0, end: 8 },
      { name: "Response", start: 20, end: 28 },
      { name: "Error", start: 40, end: 45 },
    ]);

    expect(result).toMatch([]);
  });

  it("reports an error for each name that conflicts with first casing", () => {
    const result = checkConsistentCasing([
      { name: "Response", start: 0, end: 8 },
      { name: "response", start: 10, end: 18 },
      { name: "RESPONSE", start: 20, end: 28 },
      { name: "Error", start: 30, end: 35 },
      { name: "error", start: 36, end: 41 },
    ]);

    expect(result).toMatch([
      {
        message: "Name 'response' conflicts with 'Response'",
        start: 10,
        end: 18,
      },
      {
        message: "Name 'RESPONSE' conflicts with 'Response'",
        start: 20,
        end: 28,
      },
      {
        message: "Name 'error' conflicts with 'Error'",
        start: 36,
        end: 41,
      },
    ]);
  });

  it("uses the first seen casing as the canonical one", () => {
    const result = checkConsistentCasing([
      { name: "response", start: 0, end: 8 },
      { name: "Response", start: 10, end: 18 },
      { name: "response", start: 20, end: 28 },
    ]);

    expect(result).toMatch([
      {
        message: "Name 'Response' conflicts with 'response'",
        start: 10,
        end: 18,
      },
    ]);
  });
});
