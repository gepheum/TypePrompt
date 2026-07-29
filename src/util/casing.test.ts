import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { checkNameConflicts } from "./casing.js";

describe("checkNameConflicts", () => {
  it("returns no errors when all casings are consistent", () => {
    const result = checkNameConflicts([
      { text: "Response", start: 0, end: 8 },
      { text: "Error", start: 40, end: 45 },
    ]);

    expect(result).toMatch([]);
  });

  it("reports an error for each name that conflicts with first casing", () => {
    const result = checkNameConflicts([
      { text: "Response", start: 0, end: 8 },
      { text: "response", start: 10, end: 18 },
      { text: "RESPONSE", start: 20, end: 28 },
      { text: "Error", start: 30, end: 35 },
      { text: "error", start: 36, end: 41 },
    ]);

    expect(result).toMatch([
      {
        message: "'response' and 'Response' differ only by casing",
        span: {
          start: 10,
          end: 18,
        },
      },
      {
        message: "'RESPONSE' and 'Response' differ only by casing",
        span: {
          start: 20,
          end: 28,
        },
      },
      {
        message: "'error' and 'Error' differ only by casing",
        span: {
          start: 36,
          end: 41,
        },
      },
    ]);
  });

  it("uses the first seen casing as the canonical one", () => {
    const result = checkNameConflicts([
      { text: "response", start: 0, end: 8 },
      { text: "Response", start: 10, end: 18 },
      { text: "response", start: 20, end: 28 },
    ]);

    expect(result).toMatch([
      {
        message: "'Response' and 'response' differ only by casing",
        span: {
          start: 10,
          end: 18,
        },
      },
      {
        span: {
          text: "response",
          start: 0,
          end: 8,
        },
        message: "Duplicate identifier 'response'",
      },
      {
        span: {
          text: "response",
          start: 20,
          end: 28,
        },
        message: "Duplicate identifier 'response'",
      },
    ]);
  });

  it("treat exact matches as conflicts", () => {
    const result = checkNameConflicts([
      { text: "foo", start: 0, end: 3 },
      { text: "foo", start: 10, end: 13 },
    ]);

    expect(result).toMatch([
      {
        message: "Duplicate identifier 'foo'",
        span: {
          start: 0,
          end: 3,
        },
      },
      {
        message: "Duplicate identifier 'foo'",
        span: {
          start: 10,
          end: 13,
        },
      },
    ]);
  });
});
