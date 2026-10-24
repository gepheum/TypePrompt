import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { EMPTY_SCHEMA } from "../schema/empty-schema.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { ValidatedTemplate } from "./compiler-types.js";
import { parseDataset } from "./dataset-parser.js";
import { validateDataset } from "./dataset-validator.js";
import { parseTemplate } from "./template-parser.js";
import { validateTemplate } from "./template-validator.js";

function parseElement(xml: string, path = "prompts/Translate.tp"): ElementNode {
  const result = parseXmlDocument(xml, path);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

function makeTemplate(templateXml: string): ValidatedTemplate {
  const root = parseElement(templateXml, "prompts/Translate.tp");
  const parsedTemplate = parseTemplate(root);
  if (parsedTemplate.kind !== "template") {
    throw new Error("parseTemplate failed");
  }
  const validated = validateTemplate({
    template: parsedTemplate,
    metaSchema: EMPTY_SCHEMA,
    namespaceSchema: EMPTY_SCHEMA,
    namespaceTools: {},
  });
  if (validated.kind !== "template") {
    throw new Error("validateTemplate failed");
  }
  return validated;
}

describe("validateDataset", () => {
  const template = makeTemplate(`
    <template name="Translate">
      <schema>
        type Input = { text: string; targetLanguage?: string; };
        type Output = { translated: string; };
      </schema>
      <system>Translator</system>
      <user><insert val="input.text"/></user>
    </template>
  `);

  it("validates a dataset matching template input and output schemas", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - name: "Spanish greeting"
          weight: 2
          input:
            text: "Hello"
            targetLanguage: "es"
          output:
            translated: "Hola"
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
    expect(result).toMatch({
      kind: "dataset",
      templateId: "Main:Translate",
      items: [
        {
          name: "Spanish greeting",
          weight: 2,
          input: {
            text: "Hello",
            targetLanguage: "es",
          },
          output: {
            translated: "Hola",
          },
        },
      ],
    });
  });

  it("validates a dataset where output is omitted", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - name: "Input only sample"
          input:
            text: "What time is it?"
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
    expect(result).toMatch({
      kind: "dataset",
      items: [
        {
          name: "Input only sample",
          input: {
            text: "What time is it?",
          },
          output: undefined,
        },
      ],
    });
  });

  it("reports an error when an unknown field is present", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - input:
            text: "Bonjour"
          output:
            translated: "Hello"
          goldenOutput:
            translated: "Hello"
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unknown field 'goldenOutput'",
        },
      ],
    });
  });

  it("reports an error when input has mismatched schema", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - input:
            text: 12345
          output:
            translated: "Bonjour"
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected string but got number",
        },
      ],
    });
  });

  it("reports an error when output has mismatched schema", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - input:
            text: "Hello"
          output:
            translated: 999
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected string but got number",
        },
      ],
    });
  });

  it("reports an error when dataset content is not a YAML array", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        input:
          text: "Hello"
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Expected array but got object",
        },
      ],
    });
  });

  it("links dataset 'for' attribute to template name span", () => {
    const datasetNode = parseElement(
      `
      <dataset for="Translate">
        - input:
            text: "Hello"
          output:
            translated: "Hola"
      </dataset>
    `,
      "prompts/Translate.dataset.tp",
    );

    const parsed = parseDataset(datasetNode);
    if (parsed.kind === "error") throw new Error("parseDataset failed");

    const result = validateDataset(parsed, template);
    if (result.kind !== "dataset") throw new Error("Expected dataset result");

    expect(result.definitionLinks[0]).toMatch({
      reference: parsed.for,
      definition: template.template.name,
    });
  });
});
