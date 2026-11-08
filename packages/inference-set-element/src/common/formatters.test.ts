import { expect } from "buckwheat";
import { describe, it } from "mocha";
import {
  formatDuration,
  formatNumber,
  formatTimestamp,
  stringifyAsJson,
  stringifyAsYaml,
} from "./formatters.js";

describe("formatters", () => {
  describe("formatDuration", () => {
    it("formats milliseconds below 1000", () => {
      expect(formatDuration(450)).toBe("450ms");
      expect(formatDuration(0)).toBe("0ms");
      expect(formatDuration(999)).toBe("999ms");
    });

    it("formats durations of 1000ms or higher in seconds", () => {
      expect(formatDuration(1000)).toBe("1.00s");
      expect(formatDuration(2500)).toBe("2.50s");
      expect(formatDuration(12345)).toBe("12.35s");
    });
  });

  describe("formatNumber", () => {
    it("formats numbers with en-US digit grouping", () => {
      expect(formatNumber(0)).toBe("0");
      expect(formatNumber(100)).toBe("100");
      expect(formatNumber(1000)).toBe("1,000");
      expect(formatNumber(1234567)).toBe("1,234,567");
    });
  });

  describe("formatTimestamp", () => {
    it("formats an ISO timestamp string into a readable date string", () => {
      const formatted = formatTimestamp("2026-11-06T12:00:00.000Z");
      expect(formatted.length > 0).toBe(true);
      expect(formatted.includes("2026")).toBe(true);
    });
  });

  describe("stringifyAsJson", () => {
    it("pretty-prints an object as JSON with 2-space indentation", () => {
      const obj = { foo: "bar", num: 42 };
      expect(stringifyAsJson(obj)).toBe(JSON.stringify(obj, null, 2));
    });
  });

  describe("stringifyAsYaml", () => {
    it("serializes an object as YAML trimmed at the end", () => {
      const obj = { foo: "bar", list: [1, 2] };
      const yaml = stringifyAsYaml(obj);
      expect(yaml.includes("foo: bar")).toBe(true);
      expect(yaml.endsWith("\n")).toBe(false);
    });
  });
});
