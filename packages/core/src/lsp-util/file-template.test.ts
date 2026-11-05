import { formatTemplateFile } from "@typeprompt/formatter";
import { describe, it } from "mocha";
import assert from "node:assert/strict";
import type { CompilationResult } from "../compiler/compiler-types.js";
import { compile } from "../compiler/compiler.js";
import { parseMeta } from "../compiler/meta-parser.js";
import { parseNamespace } from "../compiler/namespace-parser.js";
import { parsePlayground } from "../compiler/playground-parser.js";
import { parseTemplate } from "../compiler/template-parser.js";
import { parseTool } from "../compiler/tool-parser.js";
import {
  DEFAULT_CONFIG_YAML,
  parseConfigYaml,
} from "../config/config-parser.js";
import {
  DEFAULT_SECRETS_YAML,
  parseSecretsYaml,
} from "../config/secrets-parser.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import { generateFileTemplate } from "./file-template.js";

const mockCompilation = {
  namespaces: {
    Main: {} as any,
    Legal: {} as any,
  },
} as unknown as CompilationResult;

async function assertValidTemplate(
  filePath: string,
  compilationResult: CompilationResult | null,
  expectedKind: "meta" | "namespace" | "template" | "tool" | "playground",
): Promise<string> {
  const template = generateFileTemplate(filePath, compilationResult);
  assert.notEqual(template, null);

  // (1) Parse successfully using corresponding parse functions
  const xml = parseXmlDocument(template!, filePath);
  assert.equal(xml.kind, "success");
  assert.notEqual(xml.root, null);

  let parsedKind: string;
  switch (expectedKind) {
    case "meta": {
      const meta = parseMeta(xml.root);
      assert.notEqual(meta.kind, "error");
      parsedKind = meta.kind;
      break;
    }
    case "namespace": {
      const ns = parseNamespace(xml.root);
      assert.notEqual(ns.kind, "error");
      parsedKind = ns.kind;
      break;
    }
    case "template": {
      const tpl = parseTemplate(xml.root);
      assert.notEqual(tpl.kind, "error");
      parsedKind = tpl.kind;
      break;
    }
    case "tool": {
      const tool = parseTool(xml.root);
      assert.notEqual(tool.kind, "error");
      parsedKind = tool.kind;
      break;
    }
    case "playground": {
      const play = parsePlayground(xml.root);
      assert.notEqual(play.kind, "error");
      parsedKind = play.kind;
      break;
    }
  }
  assert.equal(parsedKind, expectedKind);

  // (2) Verify well-formatted using formatter library
  const formatted = await formatTemplateFile(template!);
  assert.equal(formatted, template);

  return template!;
}

describe("generateFileTemplate", () => {
  describe("meta.tp", () => {
    it("generates meta skeleton for meta.tp", async () => {
      const template = await assertValidTemplate("meta.tp", null, "meta");
      assert.equal(template, "<meta>\n  type Meta = {};\n</meta>\n");
    });

    it("generates meta skeleton for nested prompts/meta.tp", async () => {
      const template = await assertValidTemplate(
        "prompts/meta.tp",
        null,
        "meta",
      );
      assert.equal(template, "<meta>\n  type Meta = {};\n</meta>\n");
    });
  });

  describe("shared.tp", () => {
    it("generates namespace skeleton with dirname when dirname is PascalCase", async () => {
      const template = await assertValidTemplate(
        "prompts/Legal/shared.tp",
        null,
        "namespace",
      );
      assert.equal(
        template,
        '<namespace name="Legal">\n  // Shared types go here.\n</namespace>\n',
      );
    });

    it("falls back to Main namespace when dirname is not PascalCase (e.g. prompts)", async () => {
      const template = await assertValidTemplate(
        "prompts/shared.tp",
        null,
        "namespace",
      );
      assert.equal(
        template,
        '<namespace name="Main">\n  // Shared types go here.\n</namespace>\n',
      );
    });

    it("falls back to Main namespace for root shared.tp", async () => {
      const template = await assertValidTemplate(
        "shared.tp",
        null,
        "namespace",
      );
      assert.equal(
        template,
        '<namespace name="Main">\n  // Shared types go here.\n</namespace>\n',
      );
    });
  });

  describe("PascalCase.tp (template)", () => {
    it("generates template skeleton without namespace when compilationResult is null", async () => {
      const template = await assertValidTemplate(
        "prompts/Translate.tp",
        null,
        "template",
      );
      assert.equal(
        template,
        '<template name="Translate">\n' +
          "  <schema>\n" +
          "    type Input = {};\n" +
          "    type Output = {};\n" +
          "  </schema>\n\n" +
          "  <system>\n" +
          "    <!-- System prompt goes here. -->\n" +
          "  </system>\n\n" +
          "  <user>\n" +
          "    <!-- User prompt goes here. -->\n" +
          "  </user>\n" +
          "</template>\n",
      );
    });

    it("generates template skeleton with namespace when dirname is in compilationResult namespaces", async () => {
      const template = await assertValidTemplate(
        "prompts/Legal/DraftNda.tp",
        mockCompilation,
        "template",
      );
      assert.equal(
        template,
        '<template name="DraftNda" namespace="Legal">\n' +
          "  <schema>\n" +
          "    type Input = {};\n" +
          "    type Output = {};\n" +
          "  </schema>\n\n" +
          "  <system>\n" +
          "    <!-- System prompt goes here. -->\n" +
          "  </system>\n\n" +
          "  <user>\n" +
          "    <!-- User prompt goes here. -->\n" +
          "  </user>\n" +
          "</template>\n",
      );
    });

    it("does not add namespace when dirname is not in compilationResult namespaces (e.g. prompts)", async () => {
      const template = await assertValidTemplate(
        "prompts/Translate.tp",
        mockCompilation,
        "template",
      );
      assert.equal(
        template,
        '<template name="Translate">\n' +
          "  <schema>\n" +
          "    type Input = {};\n" +
          "    type Output = {};\n" +
          "  </schema>\n\n" +
          "  <system>\n" +
          "    <!-- System prompt goes here. -->\n" +
          "  </system>\n\n" +
          "  <user>\n" +
          "    <!-- User prompt goes here. -->\n" +
          "  </user>\n" +
          "</template>\n",
      );
    });
  });

  describe("camelCase.tp (tool)", () => {
    it("generates tool skeleton without namespace when compilationResult is null", async () => {
      const template = await assertValidTemplate(
        "prompts/myTool.tp",
        null,
        "tool",
      );
      assert.equal(
        template,
        '<tool name="myTool">\n' +
          "  <description>\n" +
          "    <!-- Tool description goes here. -->\n" +
          "  </description>\n\n" +
          "  <schema>\n" +
          "    type Input = {};\n" +
          "    type Output = {};\n" +
          "  </schema>\n" +
          "</tool>\n",
      );
    });

    it("generates tool skeleton with namespace when dirname is in compilationResult namespaces", async () => {
      const template = await assertValidTemplate(
        "prompts/Legal/myTool.tp",
        mockCompilation,
        "tool",
      );
      assert.equal(
        template,
        '<tool name="myTool" namespace="Legal">\n' +
          "  <description>\n" +
          "    <!-- Tool description goes here. -->\n" +
          "  </description>\n\n" +
          "  <schema>\n" +
          "    type Input = {};\n" +
          "    type Output = {};\n" +
          "  </schema>\n" +
          "</tool>\n",
      );
    });
  });

  describe("Foo.play.tp (playground)", () => {
    const compilationWithTemplates = compile(
      {
        "prompts/Translate.tp": [
          '<template name="Translate">',
          "  <schema>",
          "    type Input = { text: string; targetLanguage: string; };",
          "    type Output = { translated: string; };",
          "  </schema>",
          "  <system></system>",
          "  <user></user>",
          "</template>",
        ].join("\n"),
        "prompts/Legal/shared.tp": '<namespace name="Legal"></namespace>',
        "prompts/Legal/DraftNda.tp": [
          '<template name="DraftNda" namespace="Legal">',
          "  <schema>",
          "    type Input = { partyA: string; partyB?: string; count?: integer; };",
          "    type Output = { agreement: string; };",
          "  </schema>",
          "  <system></system>",
          "  <user></user>",
          "</template>",
        ].join("\n"),
      },
      { cache: null, patchBase: null },
    );

    it("generates playground skeleton without namespace when compilationResult is null", async () => {
      const template = await assertValidTemplate(
        "prompts/Translate.play.tp",
        null,
        "playground",
      );
      assert.equal(
        template,
        '<playground for="Translate">\n' +
          "  <model>\n" +
          "    model: openai/gpt-4o\n" +
          "  </model>\n" +
          "\n" +
          "  <samples>\n" +
          "    - input: {}\n" +
          "  </samples>\n" +
          "</playground>\n",
      );
    });

    it("generates playground skeleton with namespace when dirname is in compilationResult namespaces", async () => {
      const template = await assertValidTemplate(
        "prompts/Legal/DraftNda.play.tp",
        mockCompilation,
        "playground",
      );
      assert.equal(
        template,
        '<playground for="DraftNda" namespace="Legal">\n' +
          "  <model>\n" +
          "    model: openai/gpt-4o\n" +
          "  </model>\n" +
          "\n" +
          "  <samples>\n" +
          "    - input: {}\n" +
          "  </samples>\n" +
          "</playground>\n",
      );
    });

    it("generates sample input matching template schema when template exists in compilationResult", async () => {
      const template = await assertValidTemplate(
        "prompts/Translate.play.tp",
        compilationWithTemplates,
        "playground",
      );
      assert.equal(
        template,
        '<playground for="Translate">\n' +
          "  <model>\n" +
          "    model: openai/gpt-4o\n" +
          "  </model>\n" +
          "\n" +
          "  <samples>\n" +
          "    - input:\n" +
          '        text: ""\n' +
          '        targetLanguage: ""\n' +
          "  </samples>\n" +
          "</playground>\n",
      );
    });

    it("generates sample input matching namespaced template schema", async () => {
      const template = await assertValidTemplate(
        "prompts/Legal/DraftNda.play.tp",
        compilationWithTemplates,
        "playground",
      );
      assert.equal(
        template,
        '<playground for="DraftNda" namespace="Legal">\n' +
          "  <model>\n" +
          "    model: openai/gpt-4o\n" +
          "  </model>\n" +
          "\n" +
          "  <samples>\n" +
          "    - input:\n" +
          '        partyA: ""\n' +
          '        partyB: ""\n' +
          "        count: 0\n" +
          "  </samples>\n" +
          "</playground>\n",
      );
    });
  });

  describe("typeprompt.yaml and typeprompt.yml", () => {
    it("generates default config template for typeprompt.yaml", () => {
      const template = generateFileTemplate("typeprompt.yaml", null);
      assert.equal(template, DEFAULT_CONFIG_YAML);
    });

    it("generates default config template for typeprompt.yml", () => {
      const template = generateFileTemplate("typeprompt.yml", null);
      assert.equal(template, DEFAULT_CONFIG_YAML);
    });

    it("generates default config template for nested paths", () => {
      const template = generateFileTemplate("foo/bar/typeprompt.yaml", null);
      assert.equal(template, DEFAULT_CONFIG_YAML);
    });

    it("generates valid config that parses without errors", () => {
      const result = parseConfigYaml(DEFAULT_CONFIG_YAML, "typeprompt.yaml");
      assert.equal(result.kind, "success");
    });
  });

  describe(".typeprompt.secrets.yaml and .typeprompt.secrets.yml", () => {
    it("generates default secrets template for .typeprompt.secrets.yaml", () => {
      const template = generateFileTemplate(".typeprompt.secrets.yaml", null);
      assert.equal(template, DEFAULT_SECRETS_YAML);
    });

    it("generates default secrets template for .typeprompt.secrets.yml", () => {
      const template = generateFileTemplate(".typeprompt.secrets.yml", null);
      assert.equal(template, DEFAULT_SECRETS_YAML);
    });

    it("generates default secrets template for nested paths", () => {
      const template = generateFileTemplate(
        "foo/bar/.typeprompt.secrets.yaml",
        null,
      );
      assert.equal(template, DEFAULT_SECRETS_YAML);
    });

    it("generates valid secrets that parse without errors", () => {
      const result = parseSecretsYaml(
        DEFAULT_SECRETS_YAML,
        ".typeprompt.secrets.yaml",
      );
      assert.equal(result.kind, "success");
    });
  });

  describe("ignored filenames", () => {
    it("returns null for non-PascalCase / non-camelCase filenames", () => {
      assert.equal(generateFileTemplate("prompts/foo-bar.tp", null), null);
      assert.equal(generateFileTemplate("prompts/foo_bar.tp", null), null);
      assert.equal(generateFileTemplate("prompts/123.tp", null), null);
      assert.equal(generateFileTemplate("prompts/.tp", null), null);
      assert.equal(generateFileTemplate("prompts/Foo.test.tp", null), null);
      assert.equal(generateFileTemplate("prompts/Translate.ts", null), null);
    });
  });
});
