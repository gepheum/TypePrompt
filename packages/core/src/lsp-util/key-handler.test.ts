import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { compile } from "../compiler/compiler.js";
import { onKeyDown } from "./key-handler.js";

describe("onKeyDown", () => {
  it("returns none for valid XML without unclosed tags", () => {
    expect(onKeyDown(">", "<template></template>", 10, null)).toMatch({
      action: "none",
    });
  });

  it("returns none when position does not match end of an unclosed tag", () => {
    expect(onKeyDown(">", "<template>", 5, null)).toMatch({
      action: "none",
    });
  });

  it("returns none when tag is not closed with >", () => {
    expect(onKeyDown(">", "<template", 9, null)).toMatch({
      action: "none",
    });
  });

  it("inserts closing tag for generic unclosed element", () => {
    const result = onKeyDown(">", "<custom>", 8, null);
    expect(result).toMatch({
      action: "insert-after",
      text: "</custom>",
    });
  });

  it("returns none for nested elements", () => {
    const xml = "<root><template>";
    const result = onKeyDown(">", xml, 16, null);
    expect(result).toMatch({
      action: "none",
    });
  });

  it("inserts boilerplate for top-level <meta>", () => {
    const result = onKeyDown(">", "<meta>", 6, null);
    expect(result).toMatch({
      action: "insert-after",
      text: "\n  type Meta = {};\n  </meta>",
    });
  });

  it("inserts boilerplate for top-level <tool>", () => {
    const result = onKeyDown(">", "<tool>", 6, null);
    expect(result).toMatch({
      action: "insert-after",
      text: [
        "",
        "  <schema>",
        "    type Input = {};",
        "  ",
        "    type Output = {};",
        "  </schema>",
        "  ",
        "  <description>",
        "    Describe what the tool does here.",
        "  </description>",
        "  </tool>",
      ].join("\n"),
    });
  });

  it("inserts boilerplate for top-level <template> when compilationResult is null", () => {
    const result = onKeyDown(">", "<template>", 10, null);
    expect(result).toMatch({
      action: "insert-after",
      text: [
        "",
        "  <schema>",
        "    type Input = {",
        "      question: string;",
        "    };",
        "  ",
        "    type Output = {",
        "      answer: string;",
        "    };",
        "  </schema>",
        "  ",
        "  <system>",
        "    Write system instructions here.",
        "  </system>",
        "  ",
        "  <user>",
        '    <insert val="input" format="json" />',
        "  </user>",
        "  ",
        "  <examples>",
        "    - input:",
        '        question: "What is the secret of the universe?"',
        "      output:",
        '        answer: "42"',
        "  </examples>",
        "  </template>",
      ].join("\n"),
    });
  });

  it("inserts boilerplate for top-level <template> with meta defaults from compilationResult", () => {
    const compilationResult = compile(
      {
        "prompts/meta.xml": `
          <meta>
            type Meta = {
              model: "gpt4o" | "gpt4oMini";
              temperature: number;
              timeoutMs?: integer;
              tags: string[];
              isProduction: boolean;
            };
          </meta>
        `,
      },
      { cache: null },
    );

    const result = onKeyDown(">", "<template>", 10, compilationResult);
    expect(result).toMatch({
      action: "insert-after",
      text: [
        "",
        "  <schema>",
        "    type Input = {",
        "      question: string;",
        "    };",
        "  ",
        "    type Output = {",
        "      answer: string;",
        "    };",
        "  </schema>",
        "  ",
        "  <meta>",
        "    model: gpt4o",
        "    temperature: 0",
        "    timeoutMs: 0",
        "    tags:",
        '      - ""',
        "    isProduction: false",
        "    ",
        "  </meta>",
        "  ",
        "  <system>",
        "    Write system instructions here.",
        "  </system>",
        "  ",
        "  <user>",
        '    <insert val="input" format="json" />',
        "  </user>",
        "  ",
        "  <examples>",
        "    - input:",
        '        question: "What is the secret of the universe?"',
        "      output:",
        '        answer: "42"',
        "  </examples>",
        "  </template>",
      ].join("\n"),
    });
  });

  it("handles complex meta schema types (records, booleans, any, literals)", () => {
    const compilationResult = compile(
      {
        "prompts/meta.xml": `
          <meta>
            type Meta = {
              flag: true;
              config: any;
              headers: { [name: string]: string };
            };
          </meta>
        `,
      },
      { cache: null },
    );

    const result = onKeyDown(">", "<template>", 10, compilationResult);
    expect(result).toMatch({
      action: "insert-after",
      text: [
        "",
        "  <schema>",
        "    type Input = {",
        "      question: string;",
        "    };",
        "  ",
        "    type Output = {",
        "      answer: string;",
        "    };",
        "  </schema>",
        "  ",
        "  <meta>",
        "    flag: true",
        "    config: {}",
        "    headers:",
        '      some-key: ""',
        "    ",
        "  </meta>",
        "  ",
        "  <system>",
        "    Write system instructions here.",
        "  </system>",
        "  ",
        "  <user>",
        '    <insert val="input" format="json" />',
        "  </user>",
        "  ",
        "  <examples>",
        "    - input:",
        '        question: "What is the secret of the universe?"',
        "      output:",
        '        answer: "42"',
        "  </examples>",
        "  </template>",
      ].join("\n"),
    });
  });
});
