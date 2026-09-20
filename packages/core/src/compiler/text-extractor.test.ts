import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import { extractTextContent } from "./text-extractor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseElement(xml: string): ElementNode {
  const result = parseXmlDocument(xml);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

// ---------------------------------------------------------------------------
// extractTextContent
// ---------------------------------------------------------------------------

describe("extractTextContent", () => {
  it("extracts plain text content from an element", () => {
    const root = parseElement(
      "<schema>type Input = { query: string; };</schema>",
    );

    expect(extractTextContent(root, "typescript")).toMatch({
      kind: "success",
      text: {
        text: "type Input = { query: string; };",
      },
      warnings: [],
    });
  });

  it("extracts empty text from an empty element", () => {
    const root = parseElement("<schema></schema>");

    expect(extractTextContent(root, "typescript")).toMatch({
      kind: "success",
      text: {
        text: "",
      },
      warnings: [],
    });
  });

  it("joins multiple text nodes separated by comments", () => {
    const root = parseElement(
      "<schema>type A = string;<!-- comment -->type B = number;</schema>",
    );

    expect(extractTextContent(root, "typescript")).toMatch({
      kind: "success",
      text: {
        text: "type A = string;type B = number;",
      },
      warnings: [
        {
          message: "Use TypeScript comments instead",
        },
      ],
    });
  });

  it("reports an error when child XML elements are present", () => {
    const root = parseElement("<schema>type A = <invalidTag/>;</schema>");

    expect(extractTextContent(root, "typescript")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected element <invalidTag>",
        },
      ],
    });
  });

  it("reports multiple errors for multiple child XML elements", () => {
    const root = parseElement("<schema><firstTag/>text<secondTag/></schema>");

    expect(extractTextContent(root, "typescript")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected element <firstTag>",
        },
        {
          message: "Unexpected element <secondTag>",
        },
      ],
    });
  });

  it("does not generate comment warnings for format 'c-tag'", () => {
    const root = parseElement("<c><!-- comment -->myIdentifier</c>");

    expect(extractTextContent(root, "c-tag")).toMatch({
      kind: "success",
      text: {
        text: "myIdentifier",
      },
      warnings: [],
    });
  });

  it("generates 'Use TypeScript comments instead' for format 'typescript'", () => {
    const root = parseElement(
      "<schema><!-- ts comment -->type X = string;</schema>",
    );

    expect(extractTextContent(root, "typescript")).toMatch({
      kind: "success",
      text: {
        text: "type X = string;",
      },
      warnings: [
        {
          message: "Use TypeScript comments instead",
        },
      ],
    });
  });

  it("generates 'Use YAML comments instead' for format 'yaml'", () => {
    const root = parseElement(
      "<examples><!-- yaml comment -->- name: test</examples>",
    );

    expect(extractTextContent(root, "yaml")).toMatch({
      kind: "success",
      text: {
        text: "- name: test",
      },
      warnings: [
        {
          message: "Use YAML comments instead",
        },
      ],
    });
  });
});
