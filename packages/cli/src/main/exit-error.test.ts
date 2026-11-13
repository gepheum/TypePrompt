import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { ExitError } from "./exit-error.js";

describe("ExitError", () => {
  describe("wrap", () => {
    it("returns the error as-is if it is already an ExitError", () => {
      const exitError = new ExitError("already an exit error");
      const result = ExitError.wrap(exitError);
      expect(result).toBe(exitError);
    });

    it("wraps a generic Error in a new ExitError with the same message", () => {
      const genericError = new Error("something went wrong");
      const result = ExitError.wrap(genericError);
      expect(result instanceof ExitError).toBe(true);
      expect(result.message).toBe("something went wrong");
    });
  });
});
