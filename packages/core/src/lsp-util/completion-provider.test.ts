import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { compile } from "../compiler/compiler.js";
import { CONFIG } from "../config/config-parser.js";
import { SECRETS } from "../config/secrets-parser.js";
import {
  getCompletionItems,
  getYamlCompletionItems,
} from "./completion-provider.js";

describe("getCompletionItems", () => {
  it("suggests valid child elements when typing after < in body", () => {
    const xml = [
      '<template name="Test">',
      "  <schema>",
      "    type Input = {};",
      "    type Output = {};",
      "  </schema>",
      "  <system>",
      "    <",
      "  </system>",
      "</template>",
    ].join("\n");

    const pos = xml.indexOf("    <") + 5; // right after '<'
    const cache = compile(
      { "prompts/test.tp": xml },
      { cache: null, patchBase: null },
    );
    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.tp",
      position: pos,
      cache,
    });

    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["c", "enclosed", "insert"]);
    expect(result!.span).toMatch({ start: pos, end: pos });
  });

  it("suggests valid child elements when partially typed in body", () => {
    const xml = [
      '<template name="Test">',
      "  <schema>",
      "    type Input = {};",
      "    type Output = {};",
      "  </schema>",
      "  <system>",
      "    <ins",
      "  </system>",
      "</template>",
    ].join("\n");

    const start = xml.indexOf("<ins") + 1; // start of 'ins'
    const pos = start + 3; // end of 'ins'
    const cache = compile(
      { "prompts/test.tp": xml },
      { cache: null, patchBase: null },
    );
    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.tp",
      position: pos,
      cache,
    });

    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["c", "enclosed", "insert"]);
    expect(result!.span).toMatch({ start, end: pos });
  });

  it("suggests available namespaces for namespace attribute", () => {
    const legalXml = [
      '<namespace name="Legal">',
      "  type Contract = { id: string; };",
      "</namespace>",
    ].join("\n");

    const mainXml = [
      '<template name="Test" namespace="Leg">',
      "  <schema>",
      "    type Input = {};",
      "    type Output = {};",
      "  </schema>",
      "  <system></system>",
      "  <user></user>",
      "</template>",
    ].join("\n");

    const start = mainXml.indexOf('namespace="') + 'namespace="'.length;
    const pos = start + 3; // after 'Leg'
    const cache = compile(
      {
        "prompts/Legal/shared.tp": legalXml,
        "prompts/Leg/Test.tp": mainXml,
      },
      { cache: null, patchBase: null },
    );
    const result = getCompletionItems({
      newContent: mainXml,
      path: "prompts/Leg/Test.tp",
      position: pos,
      cache,
    });

    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["Legal", "Main"]);
  });

  it("returns null when no suggestions available at position", () => {
    const xml = [
      '<template name="Test">',
      "  <schema>",
      "    type Input = {};",
      "    type Output = {};",
      "  </schema>",
      "</template>",
    ].join("\n");

    const cache = compile(
      { "prompts/test.tp": xml },
      { cache: null, patchBase: null },
    );
    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.tp",
      position: 5,
      cache,
    });

    expect(result).toBe(null);
  });

  it("suggests YAML fields on an indented empty line inside examples without trailing newline", () => {
    const xml = [
      '<template name="Test">',
      "  <schema>",
      "    type Input = { subject: string; priority: string; };",
      "    type Output = { status: string; };",
      "  </schema>",
      "  <system>sys</system>",
      "  <user>usr</user>",
      "  <examples>",
      "    - input:",
      "        subject: Test",
      "        ",
      "      output:",
      "        status: ok",
      "  </examples>",
      "</template>",
    ].join("\n");

    const pos = xml.indexOf("        \n") + 8;
    const cache = compile(
      { "prompts/test.tp": xml },
      { cache: null, patchBase: null },
    );
    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.tp",
      position: pos,
      cache,
    });

    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["priority"]);
    expect(result!.span).toMatch({ start: pos, end: pos });
  });

  it("suggests XML attributes when typing a space inside opening tag", () => {
    const xml = [
      '<template name="Test" >',
      "  <schema>",
      "    type Input = {};",
      "    type Output = {};",
      "  </schema>",
      "</template>",
    ].join("\n");

    const pos = xml.indexOf('name="Test" ') + 'name="Test" '.length;
    const cache = compile(
      { "prompts/test.tp": xml },
      { cache: null, patchBase: null },
    );
    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.tp",
      position: pos,
      cache,
    });

    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["namespace"]);
  });

  it("suggests available templates for playground for attribute", () => {
    const templateXml = [
      '<template name="Translate">',
      "  <schema>",
      "    type Input = { text: string; };",
      "    type Output = string;",
      "  </schema>",
      "  <system></system>",
      "  <user></user>",
      "</template>",
    ].join("\n");

    const playgroundXml = [
      '<playground for="Tr">',
      "  <model>",
      "    model: openai/gpt-4o",
      "  </model>",
      "  <samples>",
      "  - input:",
      '      text: "hello"',
      "  </samples>",
      "</playground>",
    ].join("\n");

    const start = playgroundXml.indexOf('for="') + 'for="'.length;
    const pos = start + 2; // after 'Tr'
    const cache = compile(
      {
        "prompts/Translate.tp": templateXml,
        "prompts/Translate.play.tp": playgroundXml,
      },
      { cache: null, patchBase: null },
    );
    const result = getCompletionItems({
      newContent: playgroundXml,
      path: "prompts/Translate.play.tp",
      position: pos,
      cache,
    });

    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["Translate"]);
  });

  it("suggests ' @' right after /// in schema", () => {
    const xml = [
      '<template name="Test">',
      "  <schema>",
      "    type Input = {",
      "      ///",
      "      name: string;",
      "    };",
      "    type Output = {};",
      "  </schema>",
      "</template>",
    ].join("\n");

    const pos = xml.indexOf("      ///") + "      ///".length;
    const cache = compile(
      { "prompts/test.tp": xml },
      { cache: null, patchBase: null },
    );
    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.tp",
      position: pos,
      cache,
    });

    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch([" @"]);
    expect(result!.span).toMatch({ start: pos, end: pos });
  });

  it("suggests @ after /// with space in schema", () => {
    const xml = [
      '<template name="Test">',
      "  <schema>",
      "    type Input = {",
      "      /// ",
      "      name: string;",
      "    };",
      "    type Output = {};",
      "  </schema>",
      "</template>",
    ].join("\n");

    const pos = xml.indexOf("      /// ") + "      /// ".length;
    const cache = compile(
      { "prompts/test.tp": xml },
      { cache: null, patchBase: null },
    );
    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.tp",
      position: pos,
      cache,
    });

    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["@"]);
    expect(result!.span).toMatch({ start: pos, end: pos });
  });

  it("suggests omitDefault after /// @ in schema", () => {
    const xml = [
      '<template name="Test">',
      "  <schema>",
      "    type Input = {",
      "      /// @",
      "      name: string;",
      "    };",
      "    type Output = {};",
      "  </schema>",
      "</template>",
    ].join("\n");

    const pos = xml.indexOf("      /// @") + "      /// @".length;
    const cache = compile(
      { "prompts/test.tp": xml },
      { cache: null, patchBase: null },
    );
    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.tp",
      position: pos,
      cache,
    });

    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["omitDefault"]);
    expect(result!.span).toMatch({ start: pos, end: pos });
  });

  it("suggests omitDefault when partially typed after /// @ in schema", () => {
    const xml = [
      '<template name="Test">',
      "  <schema>",
      "    type Input = {",
      "      /// @omi",
      "      name: string;",
      "    };",
      "    type Output = {};",
      "  </schema>",
      "</template>",
    ].join("\n");

    const start = xml.indexOf("@omi") + 1;
    const pos = start + 3;
    const cache = compile(
      { "prompts/test.tp": xml },
      { cache: null, patchBase: null },
    );
    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.tp",
      position: pos,
      cache,
    });

    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["omitDefault"]);
    expect(result!.span).toMatch({ start, end: pos });
  });
});

describe("getYamlCompletionItems", () => {
  it("suggests missing top-level fields", () => {
    const yaml = "include:\n  - prompts/*.tp\n";
    const result = getYamlCompletionItems(yaml, yaml.length, CONFIG);
    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["gen", "patch"]);
    expect(result!.span).toMatch({ start: yaml.length, end: yaml.length });
  });

  it("suggests generators under gen", () => {
    const yaml = "include:\n  - prompts/*.tp\ngen:\n  ";
    const result = getYamlCompletionItems(yaml, yaml.length, CONFIG);
    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch([
      "cpp",
      "csharp",
      "dart",
      "kotlin",
      "python",
      "rust",
      "swift",
      "typescript",
    ]);
    expect(result!.span).toMatch({ start: yaml.length, end: yaml.length });
  });

  it("suggests generator fields under gen.<lang>", () => {
    const yaml = "include:\n  - prompts/*.tp\ngen:\n  typescript:\n    ";
    const result = getYamlCompletionItems(yaml, yaml.length, CONFIG);
    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["file"]);
    expect(result!.span).toMatch({ start: yaml.length, end: yaml.length });
  });

  it("suggests matching fields when partially typed with colon", () => {
    const yaml = "include:\n  - prompts/*.tp\ngen:\n  typ:";
    const pos = yaml.indexOf("typ") + 2;
    const result = getYamlCompletionItems(yaml, pos, CONFIG);
    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch([
      "cpp",
      "csharp",
      "dart",
      "kotlin",
      "python",
      "rust",
      "swift",
      "typescript",
    ]);
    expect(result!.span).toMatch({
      start: yaml.indexOf("typ"),
      end: yaml.indexOf("typ") + 3,
    });
  });

  it("returns null when no suggestions available at position", () => {
    const yaml = "include:\n  - prompts/*.tp\n";
    const pos = yaml.indexOf("prompts") + 2;
    const result = getYamlCompletionItems(yaml, pos, CONFIG);
    expect(result).toBe(null);
  });

  it("suggests fields on an empty line with content following below", () => {
    const yaml =
      "include:\n  - prompts/*.tp\n\ngen:\n  typescript:\n    file: test.ts\n";
    const pos = yaml.indexOf("\n\n") + 1;
    const result = getYamlCompletionItems(yaml, pos, CONFIG);
    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["patch"]);
    expect(result!.span).toMatch({ start: pos, end: pos });
  });

  it("suggests top-level apiKeys for SECRETS", () => {
    const yaml = "";
    const result = getYamlCompletionItems(yaml, 0, SECRETS);
    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch(["apiKeys"]);
  });

  it("suggests provider keys under apiKeys for SECRETS", () => {
    const yaml = "apiKeys:\n  ";
    const result = getYamlCompletionItems(yaml, yaml.length, SECRETS);
    expect(result !== null).toBe(true);
    expect(result!.suggestions).toMatch([
      "openai",
      "anthropic",
      "google",
      "xai",
      "mistral",
      "vercelGateway",
    ]);
  });
});
