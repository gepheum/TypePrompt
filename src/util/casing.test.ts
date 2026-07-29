import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { checkNameConflicts } from "./casing.js";

describe("checkNameConflicts", () => {
  it("returns no errors when all casings are consistent", () => {
    const result = checkNameConflicts(
      [
        { text: "Response", start: 0, end: 8 },
        { text: "Response", start: 20, end: 28 },
        { text: "Error", start: 40, end: 45 },
      ],
      { exactMatchIsConflict: false },
    );

    expect(result).toMatch([]);
  });

  it("reports an error for each name that conflicts with first casing", () => {
    const result = checkNameConflicts(
      [
        { text: "Response", start: 0, end: 8 },
        { text: "response", start: 10, end: 18 },
        { text: "RESPONSE", start: 20, end: 28 },
        { text: "Error", start: 30, end: 35 },
        { text: "error", start: 36, end: 41 },
      ],
      { exactMatchIsConflict: false },
    );

    expect(result).toMatch([
      {
        message: "Name 'response' conflicts with 'Response'",
        span: {
          start: 10,
          end: 18,
        },
      },
      {
        message: "Name 'RESPONSE' conflicts with 'Response'",
        span: {
          start: 20,
          end: 28,
        },
      },
      {
        message: "Name 'error' conflicts with 'Error'",
        span: {
          start: 36,
          end: 41,
        },
      },
    ]);
  });

  it("uses the first seen casing as the canonical one", () => {
    const result = checkNameConflicts(
      [
        { text: "response", start: 0, end: 8 },
        { text: "Response", start: 10, end: 18 },
        { text: "response", start: 20, end: 28 },
      ],
      { exactMatchIsConflict: false },
    );

    expect(result).toMatch([
      {
        message: "Name 'Response' conflicts with 'response'",
        span: {
          start: 10,
          end: 18,
        },
      },
    ]);
  });

  it("can treat exact matches as conflicts when requested", () => {
    const result = checkNameConflicts(
      [
        { text: "foo", start: 0, end: 3 },
        { text: "foo", start: 10, end: 13 },
      ],
      { exactMatchIsConflict: true },
    );

    expect(result).toMatch([
      {
        message: "Name 'foo' is duplicated",
        span: {
          start: 0,
          end: 3,
        },
      },
      {
        message: "Name 'foo' is duplicated",
        span: {
          start: 10,
          end: 13,
        },
      },
    ]);
  });
});
