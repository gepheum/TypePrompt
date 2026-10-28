import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { InternalErrors } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { Playground } from "./compiler-types.js";
import { parsePlayground as parsePlaygroundCore } from "./playground-parser.js";

function parsePlayground(
  playgroundNode: ElementNode,
  sourcePath?: string,
): Playground | InternalErrors {
  if (sourcePath !== undefined) {
    return parsePlaygroundCore({ ...playgroundNode, path: sourcePath });
  }
  return parsePlaygroundCore(playgroundNode);
}

function parseElement(
  xml: string,
  path = "prompts/Translate.play.tp",
): ElementNode {
  const result = parseXmlDocument(xml, path);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

describe("parsePlayground", () => {
  it("parses a valid <playground> with 'for' attribute and <samples>", () => {
    const root = parseElement(`
      <playground for="Translate">
        <samples>
        - name: "Spanish greeting"
          input:
            text: "Hello"
        </samples>
      </playground>
    `);

    const result = parsePlayground(root, "prompts/Translate.play.tp");
    expect(result).toMatch({
      kind: "playground",
      for: { text: "Translate" },
      namespace: null,
      warnings: [],
    });
  });

  it("parses a valid <playground> with 'for' and 'namespace' attributes", () => {
    const root = parseElement(`
      <playground for="DraftNda" namespace="Legal">
        <samples>
        - name: "Standard NDA"
          input:
            partyA: "Acme"
            partyB: "Beta"
        </samples>
      </playground>
    `);

    const result = parsePlayground(root, "prompts/Legal/DraftNda.play.tp");
    expect(result).toMatch({
      kind: "playground",
      for: { text: "DraftNda" },
      namespace: { text: "Legal" },
      warnings: [],
    });
  });

  it("reports an error when 'for' attribute is missing", () => {
    const root = parseElement(`
      <playground>
        <samples>
        - input:
            text: "Hello"
        </samples>
      </playground>
    `);

    const result = parsePlayground(root);
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
      <playground for="translate">
        <samples>
        - input:
            text: "Hello"
        </samples>
      </playground>
    `);

    const result = parsePlayground(root);
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
      <playground for="Translate" foo="bar">
        <samples>
        - input:
            text: "Hello"
        </samples>
      </playground>
    `);

    const result = parsePlayground(root);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected attribute 'foo'",
        },
      ],
    });
  });

  it("reports an error when <samples> is missing", () => {
    const root = parseElement(`
      <playground for="Translate">
      </playground>
    `);

    const result = parsePlayground(root);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <samples> element in <playground>",
        },
      ],
    });
  });

  it("reports an error when duplicate <samples> are present", () => {
    const root = parseElement(`
      <playground for="Translate">
        <samples>
        - input:
            text: "Hello"
        </samples>
        <samples>
        - input:
            text: "World"
        </samples>
      </playground>
    `);

    const result = parsePlayground(root);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Duplicate <samples> element in <playground>",
        },
      ],
    });
  });

  it("reports an error when unexpected element is inside <playground>", () => {
    const root = parseElement(`
      <playground for="Translate">
        <foo />
        <samples>
        - input:
            text: "Hello"
        </samples>
      </playground>
    `);

    const result = parsePlayground(root);
    expect(result).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected element <foo> in <playground>",
        },
      ],
    });
  });

  it("reports an error when YAML content in <samples> is invalid", () => {
    const root = parseElement(`
      <playground for="Translate">
        <samples>
        - input: { unclosed
        </samples>
      </playground>
    `);

    const result = parsePlayground(root);
    expect(result).toMatch({
      kind: "error",
    });
  });

  it("warns when filename does not match 'TemplateName.play.tp'", () => {
    const root = parseElement(`
      <playground for="Translate">
        <samples>
        - input:
            text: "Hello"
        </samples>
      </playground>
    `);

    const result = parsePlayground(root, "prompts/WrongName.tp");
    expect(result).toMatch({
      kind: "playground",
      warnings: [
        {
          message: "File path should match '**/Translate.play.tp'",
        },
      ],
    });
  });
});
