import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { checkNameConflicts, toPascalCase, toSnakeCase } from "./casing.js";
import type { TextSpan } from "./shared-types.js";

describe("toSnakeCase", () => {
  it("converts camelCase", () => {
    expect(toSnakeCase("fooBar")).toMatch("foo_bar");
  });

  it("converts PascalCase", () => {
    expect(toSnakeCase("FooBar")).toMatch("foo_bar");
  });

  it("handles acronyms", () => {
    expect(toSnakeCase("parseHTMLDocument")).toMatch("parse_html_document");
  });

  it("treats dash as word break and strips it", () => {
    expect(toSnakeCase("foo-bar")).toMatch("foo_bar");
  });

  it("treats dot as word break and strips it", () => {
    expect(toSnakeCase("foo.bar")).toMatch("foo_bar");
  });

  it("treats underscore as word break", () => {
    expect(toSnakeCase("foo_bar")).toMatch("foo_bar");
  });

  it("handles mixed separators and camel case", () => {
    expect(toSnakeCase("foo-bar.baz_qux")).toMatch("foo_bar_baz_qux");
  });

  it("handles camel case combined with separators", () => {
    expect(toSnakeCase("parseHTML-document")).toMatch("parse_html_document");
  });

  it("collapses consecutive separators", () => {
    expect(toSnakeCase("foo--bar")).toMatch("foo_bar");
  });

  it("strips a trailing separator", () => {
    expect(toSnakeCase("foo_")).toMatch("foo");
  });

  it("treats a digit before an uppercase letter as a word break", () => {
    expect(toSnakeCase("foo2Bar")).toMatch("foo2_bar");
  });

  it("does not break on a digit embedded in a word", () => {
    expect(toSnakeCase("foo2bar")).toMatch("foo2bar");
  });

  it("keeps a trailing digit attached to the word", () => {
    expect(toSnakeCase("fooBar2")).toMatch("foo_bar2");
  });
});

describe("toPascalCase", () => {
  it("converts camelCase", () => {
    expect(toPascalCase("fooBar")).toMatch("FooBar");
  });

  it("converts PascalCase", () => {
    expect(toPascalCase("FooBar")).toMatch("FooBar");
  });

  it("lowercases ALL_CAPS runs", () => {
    expect(toPascalCase("parseHTMLDocument")).toMatch("ParseHtmlDocument");
  });

  it("treats dash as word break and strips it", () => {
    expect(toPascalCase("foo-bar")).toMatch("FooBar");
  });

  it("treats dot as word break and strips it", () => {
    expect(toPascalCase("foo.bar")).toMatch("FooBar");
  });

  it("treats underscore as word break", () => {
    expect(toPascalCase("foo_bar")).toMatch("FooBar");
  });

  it("handles mixed separators", () => {
    expect(toPascalCase("foo-bar.baz_qux")).toMatch("FooBarBazQux");
  });

  it("handles camel case combined with separators", () => {
    expect(toPascalCase("parseHTML-document")).toMatch("ParseHtmlDocument");
  });

  it("collapses consecutive separators", () => {
    expect(toPascalCase("foo--bar")).toMatch("FooBar");
  });

  it("capitalizes a single word", () => {
    expect(toPascalCase("foo")).toMatch("Foo");
  });

  it("strips a trailing separator", () => {
    expect(toPascalCase("foo_")).toMatch("Foo");
  });

  it("treats a digit before an uppercase letter as a word break", () => {
    expect(toPascalCase("foo2Bar")).toMatch("Foo2Bar");
  });

  it("does not break on a digit embedded in a word", () => {
    expect(toPascalCase("foo2bar")).toMatch("Foo2bar");
  });

  it("keeps a trailing digit attached to the word", () => {
    expect(toPascalCase("fooBar2")).toMatch("FooBar2");
  });
});

describe("checkNameConflicts", () => {
  const span = (
    text: string,
    start: number,
    end: number,
    path = "",
  ): TextSpan => ({
    text,
    start,
    end,
    path,
  });
  it("returns no errors when all casings are consistent", () => {
    const result = checkNameConflicts([
      span("Response", 0, 8),
      span("Error", 40, 45),
    ]);

    expect(result).toMatch([]);
  });

  it("reports an error for each name that conflicts with first casing", () => {
    const result = checkNameConflicts([
      span("Response", 0, 8),
      span("response", 10, 11),
      span("RESPONSE", 20, 21),
      span("R.e-sponse_", 30, 31),
      span("Error", 40, 41),
      span("error", 50, 51),
    ]);

    expect(result).toMatch([
      {
        message: "'response' and 'Response' differ only by casing",
        span: {
          start: 10,
          end: 11,
        },
      },
      {
        message: "'RESPONSE' and 'Response' differ only by casing",
        span: {
          start: 20,
          end: 21,
        },
      },
      {
        message: "'R.e-sponse_' and 'Response' differ only by casing",
        span: {
          start: 30,
          end: 31,
        },
      },
      {
        message: "'error' and 'Error' differ only by casing",
        span: {
          start: 50,
          end: 51,
        },
      },
    ]);
  });

  it("uses the first seen casing as the canonical one", () => {
    const result = checkNameConflicts([
      span("response", 0, 8),
      span("Response", 10, 18),
      span("response", 20, 28),
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
          start: 0,
          end: 8,
        },
        message: "Duplicate identifier 'response'",
      },
      {
        span: {
          start: 20,
          end: 28,
        },
        message: "Duplicate identifier 'response'",
      },
    ]);
  });

  it("treat exact matches as conflicts", () => {
    const result = checkNameConflicts([span("foo", 0, 3), span("foo", 10, 13)]);

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
