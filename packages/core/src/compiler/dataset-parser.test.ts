import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { InternalErrors } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { Dataset } from "./compiler-types.js";
import { parseDataset as parseDatasetCore } from "./dataset-parser.js";

function parseDataset(
  datasetNode: ElementNode,
  sourcePath?: string,
): Dataset | InternalErrors {
  if (sourcePath !== undefined) {
    return parseDatasetCore({ ...datasetNode, path: sourcePath });
  }
  return parseDatasetCore(datasetNode);
}

function parseElement(
  xml: string,
  path = "prompts/Translate.dataset.tp",
): ElementNode {
  const result = parseXmlDocument(xml, path);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

describe("parseDataset", () => {
  it("parses a valid <dataset> with 'for' attribute", () => {
    const root = parseElement(`
      <dataset for="Translate">
        - name: "Spanish greeting"
          input:
            text: "Hello"
          output: "Hola"
      </dataset>
    `);

    const result = parseDataset(root, "prompts/Translate.dataset.tp");
    expect(result).toMatch({
      kind: "dataset",
      for: { text: "Translate" },
      namespace: null,
      warnings: [],
    });
  });

  it("parses a valid <dataset> with 'for' and 'namespace' attributes", () => {
    const root = parseElement(`
      <dataset for="DraftNda" namespace="Legal">
        - name: "Standard NDA"
          input:
            partyA: "Acme"
            partyB: "Beta"
      </dataset>
    `);

    const result = parseDataset(root, "prompts/Legal/DraftNda.dataset.tp");
    expect(result).toMatch({
      kind: "dataset",
      for: { text: "DraftNda" },
      namespace: { text: "Legal" },
      warnings: [],
    });
  });

  it("reports an error when 'for' attribute is missing", () => {
    const root = parseElement(`
      <dataset>
        - input:
            text: "Hello"
      </dataset>
    `);

    const result = parseDataset(root);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing required attribute 'for'",
        },
      ],
    });
  });

  it("reports an error when 'for' attribute is not PascalCase", () => {
    const root = parseElement(`
      <dataset for="translate">
        - input:
            text: "Hello"
      </dataset>
    `);

    const result = parseDataset(root);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Invalid value for attribute 'for': expected a PascalCase identifier",
        },
      ],
    });
  });

  it("reports an error when unknown attribute is passed", () => {
    const root = parseElement(`
      <dataset for="Translate" foo="bar">
        - input:
            text: "Hello"
      </dataset>
    `);

    const result = parseDataset(root);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected attribute 'foo'",
        },
      ],
    });
  });

  it("reports an error when YAML content is invalid", () => {
    const root = parseElement(`
      <dataset for="Translate">
        - input: { unclosed
      </dataset>
    `);

    const result = parseDataset(root);
    expect(result).toMatch({
      kind: "error",
    });
  });

  it("warns when filename does not match 'TemplateName.dataset.tp'", () => {
    const root = parseElement(`
      <dataset for="Translate">
        - input:
            text: "Hello"
      </dataset>
    `);

    const result = parseDataset(root, "prompts/WrongName.tp");
    expect(result).toMatch({
      kind: "dataset",
      warnings: [
        {
          message: "File path should match '**/Translate.dataset.tp'",
        },
      ],
    });
  });
});
