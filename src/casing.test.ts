import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { checkNoAmbiguity } from "./casing.js";

describe("checkNoAmbiguity", () => {
  it("returns no errors when all casings are consistent", () => {
    const result = checkNoAmbiguity([
      { name: "Response", start: 0, end: 8 },
      { name: "Response", start: 20, end: 28 },
      { name: "Error", start: 40, end: 45 },
    ]);

    expect(result).toMatch([]);
  });

  it("reports an error for each name that conflicts with first casing", () => {
    const result = checkNoAmbiguity([
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
    const result = checkNoAmbiguity([
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

  it("can treat exact matches as conflicts when requested", () => {
    const result = checkNoAmbiguity(
      [
        { name: "foo", start: 0, end: 3 },
        { name: "foo", start: 10, end: 13 },
      ],
      { exactMatchIsConflict: true },
    );

    expect(result).toMatch([
      {
        message: "Name 'foo' conflicts with 'foo'",
        start: 10,
        end: 13,
      },
    ]);
  });
});
