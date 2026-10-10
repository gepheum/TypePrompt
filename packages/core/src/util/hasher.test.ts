import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { combineHashes, combineHashesUnordered, hashString } from "./hasher.js";

describe("hashString", () => {
  it("returns 0 for empty string", () => {
    expect(hashString("")).toBe(0);
  });

  it("hashes single character correctly", () => {
    expect(hashString("a")).toBe(97);
  });

  it("hashes multiple characters deterministically", () => {
    expect(hashString("ab")).toBe(3105);
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  it("returns different hashes for different strings", () => {
    expect(hashString("abc") === hashString("cba")).toBe(false);
    expect(hashString("foo") === hashString("bar")).toBe(false);
  });

  it("always returns a 32-bit signed integer", () => {
    const hash = hashString(
      "very long string with lots of characters to cause 32-bit overflow",
    );
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash | 0).toBe(hash);
  });
});

describe("combineHashesUnordered", () => {
  it("returns 0 for empty array", () => {
    expect(combineHashesUnordered([])).toBe(0);
  });

  it("returns the single hash value for 1-element array", () => {
    expect(combineHashesUnordered([42])).toBe(42);
    expect(combineHashesUnordered([-100])).toBe(-100);
  });

  it("sums hashes in an order-independent way", () => {
    const h1 = hashString("foo");
    const h2 = hashString("bar");
    const h3 = hashString("baz");

    const res1 = combineHashesUnordered([h1, h2, h3]);
    const res2 = combineHashesUnordered([h3, h1, h2]);
    const res3 = combineHashesUnordered([h2, h3, h1]);

    expect(res1).toBe(res2);
    expect(res1).toBe(res3);
  });

  it("correctly handles 32-bit integer wrapping", () => {
    const largeInt = 2147483640;
    const result = combineHashesUnordered([largeInt, 10]);
    expect(result).toBe((largeInt + 10) | 0);
  });
});

describe("combineHashes", () => {
  it("returns 0 for empty array", () => {
    expect(combineHashes([])).toBe(0);
  });

  it("returns the single hash value for 1-element array", () => {
    expect(combineHashes([42])).toBe(42);
    expect(combineHashes([-100])).toBe(-100);
  });

  it("combines hashes in an ordered way", () => {
    const h1 = 1;
    const h2 = 2;

    expect(combineHashes([h1, h2])).toBe(33);
    expect(combineHashes([h2, h1])).toBe(63);
    expect(combineHashes([h1, h2, 3])).toBe(1026);
  });

  it("produces different hashes when order changes", () => {
    const h1 = hashString("first");
    const h2 = hashString("second");

    expect(combineHashes([h1, h2]) === combineHashes([h2, h1])).toBe(false);
  });

  it("always returns a 32-bit signed integer", () => {
    const h1 = hashString("alpha");
    const h2 = hashString("beta");
    const h3 = hashString("gamma");
    const combined = combineHashes([h1, h2, h3]);

    expect(Number.isInteger(combined)).toBe(true);
    expect(combined | 0).toBe(combined);
  });
});
