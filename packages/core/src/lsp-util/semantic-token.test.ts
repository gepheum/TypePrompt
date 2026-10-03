import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { tokenize } from "./semantic-token.js";

describe("tokenize", () => {
  it("returns an empty array for empty XML or documents without root", () => {
    expect(tokenize("")).toMatch([]);
    expect(tokenize("</root>")).toMatch([]);
  });

  it("leniently tokenizes unclosed tags while typing", () => {
    expect(tokenize("<unclosed")).toMatch([
      {
        kind: "xml-tag",
        span: { start: 1, end: 9 },
      },
    ]);
  });

  it("tokenizes XML tags, closing tags, and attributes", () => {
    const input = '<template name="test">\n  <child key="value"/>\n</template>';
    const tokens = tokenize(input);

    expect(tokens).toMatch([
      {
        kind: "xml-tag",
        span: { start: 1, end: 9 }, // "template"
      },
      {
        kind: "string",
        span: { start: 16, end: 20 }, // "test"
      },
      {
        kind: "xml-tag",
        span: { start: 26, end: 31 }, // "child"
      },
      {
        kind: "string",
        span: { start: 37, end: 42 }, // "value"
      },
      {
        kind: "xml-tag",
        span: { start: 46, end: 57 }, // "</template>"
      },
    ]);
  });

  it("tokenizes top-level and element XML comments", () => {
    const input =
      "<!-- top comment -->\n<root>\n  <!-- element comment -->\n</root>";
    const tokens = tokenize(input);

    expect(tokens).toMatch([
      {
        kind: "comment",
        span: { start: 0, end: 20 },
      },
      {
        kind: "xml-tag",
        span: { start: 22, end: 26 }, // "root"
      },
      {
        kind: "comment",
        span: { start: 30, end: 54 },
      },
      {
        kind: "xml-tag",
        span: { start: 55, end: 62 }, // "</root>"
      },
    ]);
  });

  it("tokenizes TypeScript schema inside <schema> and <namespace>", () => {
    const input = [
      "<schema>",
      "  /** User description */",
      '  type User = { name: "Alice"; active: true };',
      "</schema>",
    ].join("\n");

    const tokens = tokenize(input);

    expect(tokens).toMatch([
      {
        kind: "xml-tag",
        span: { start: 1, end: 7 }, // "schema"
      },
      {
        kind: "comment",
        span: { start: 11, end: 34 }, // /** User description */
      },
      {
        kind: "schema-keyword",
        span: { start: 37, end: 41 }, // "type"
      },
      {
        kind: "string",
        span: { start: 57, end: 64 }, // "Alice"
      },
      {
        kind: "boolean",
        span: { start: 74, end: 78 }, // "true"
      },
      {
        kind: "xml-tag",
        span: { start: 82, end: 91 }, // "</schema>"
      },
    ]);
  });

  it("tokenizes YAML inside <template><meta>", () => {
    const input = [
      "<template name='demo'>",
      "  <meta>",
      "    # Model config",
      "    model: gpt-4",
      "    temperature: 0.7",
      "    stream: true",
      "  </meta>",
      "</template>",
    ].join("\n");

    const tokens = tokenize(input);

    const kinds = new Set(tokens.map((t) => t.kind));
    expect(kinds.has("comment")).toBe(true);
    expect(kinds.has("string")).toBe(true);
    expect(kinds.has("number")).toBe(true);
    expect(kinds.has("boolean")).toBe(true);

    const yamlComment = tokens.find((t) => t.kind === "comment");
    expect(yamlComment).toMatch({
      kind: "comment",
      span: {
        start: input.indexOf("# Model config"),
        end: input.indexOf("# Model config") + "# Model config".length,
      },
    });

    const numberToken = tokens.find((t) => t.kind === "number");
    expect(numberToken).toMatch({
      kind: "number",
      span: {
        start: input.indexOf("0.7"),
        end: input.indexOf("0.7") + "0.7".length,
      },
    });

    const booleanToken = tokens.find((t) => t.kind === "boolean");
    expect(booleanToken).toMatch({
      kind: "boolean",
      span: {
        start: input.indexOf("true"),
        end: input.indexOf("true") + "true".length,
      },
    });
  });

  it("tokenizes schema inside top-level <meta>", () => {
    const input = [
      "<meta>",
      "  type GlobalConfig = { timeout: 1000 };",
      "</meta>",
    ].join("\n");

    const tokens = tokenize(input);

    const schemaKeyword = tokens.find((t) => t.kind === "schema-keyword");
    expect(schemaKeyword).toMatch({
      kind: "schema-keyword",
      span: {
        start: input.indexOf("type"),
        end: input.indexOf("type") + "type".length,
      },
    });
  });

  it("tokenizes YAML inside <examples>", () => {
    const input = [
      "<examples>",
      "  - input: 'hello'",
      "    output: 42 # example comment",
      "</examples>",
    ].join("\n");

    const tokens = tokenize(input);

    const commentToken = tokens.find((t) => t.kind === "comment");
    expect(commentToken).toMatch({
      kind: "comment",
      span: {
        start: input.indexOf("# example comment"),
        end: input.indexOf("# example comment") + "# example comment".length,
      },
    });

    const numberToken = tokens.find((t) => t.kind === "number");
    expect(numberToken).toMatch({
      kind: "number",
      span: {
        start: input.indexOf("42"),
        end: input.indexOf("42") + "42".length,
      },
    });
  });

  it("ensures tokens are sorted by start span", () => {
    const input = [
      "<!-- top -->",
      "<template name='t'>",
      "  <meta>",
      "    temperature: 0.5",
      "  </meta>",
      "  <schema>",
      "    type X = string;",
      "  </schema>",
      "</template>",
    ].join("\n");

    const tokens = tokenize(input);
    for (let i = 1; i < tokens.length; ++i) {
      expect(tokens[i]!.span.start >= tokens[i - 1]!.span.start).toBe(true);
    }
  });
});
