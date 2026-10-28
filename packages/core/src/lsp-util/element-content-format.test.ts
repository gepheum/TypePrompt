import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { parseXmlDocument } from "../xml/xml-parser.js";
import { getElementContentFormat } from "./element-content-format.js";

describe("getElementContentFormat", () => {
  it("determines schema content format for namespace and schema", () => {
    const doc = parseXmlDocument(
      "<schema>type X = string;</schema>",
      "test.tp",
    );
    expect(getElementContentFormat(doc.root!, 0)).toBe("schema");

    const nsDoc = parseXmlDocument(
      '<namespace name="Foo"></namespace>',
      "test.tp",
    );
    expect(getElementContentFormat(nsDoc.root!, 0)).toBe("schema");
  });

  it("determines meta format based on depth", () => {
    const metaDoc = parseXmlDocument(
      "<meta>type X = string;</meta>",
      "test.tp",
    );
    // Top-level meta (depth 0) is schema
    expect(getElementContentFormat(metaDoc.root!, 0)).toBe("schema");

    // Nested meta inside template (depth >= 1) is yaml
    expect(getElementContentFormat(metaDoc.root!, 1)).toBe("yaml");
  });

  it("determines yaml content format for examples and samples", () => {
    const examplesDoc = parseXmlDocument("<examples></examples>", "test.tp");
    expect(getElementContentFormat(examplesDoc.root!, 1)).toBe("yaml");

    const samplesDoc = parseXmlDocument("<samples></samples>", "test.tp");
    expect(getElementContentFormat(samplesDoc.root!, 1)).toBe("yaml");
  });

  it("determines rendered-xml for system, user, description, then, else, on", () => {
    for (const tag of ["system", "user", "description", "then", "else", "on"]) {
      const doc = parseXmlDocument(`<${tag}></${tag}>`, "test.tp");
      expect(getElementContentFormat(doc.root!, 1)).toBe("rendered-xml");
    }
  });

  it("determines unrendered-xml or rendered-xml for snippet based on if/switch attributes", () => {
    const conditionalSnippet = parseXmlDocument(
      '<snippet if="val"></snippet>',
      "test.tp",
    );
    expect(getElementContentFormat(conditionalSnippet.root!, 1)).toBe(
      "unrendered-xml",
    );

    const switchSnippet = parseXmlDocument(
      '<snippet switch="val"></snippet>',
      "test.tp",
    );
    expect(getElementContentFormat(switchSnippet.root!, 1)).toBe(
      "unrendered-xml",
    );

    const plainSnippet = parseXmlDocument("<snippet></snippet>", "test.tp");
    expect(getElementContentFormat(plainSnippet.root!, 1)).toBe("rendered-xml");
  });

  it("determines unrendered-xml for template, tool, tools, variant, c, enclosed, insert, playground", () => {
    for (const tag of [
      "template",
      "tool",
      "tools",
      "variant",
      "c",
      "enclosed",
      "insert",
      "playground",
    ]) {
      const doc = parseXmlDocument(`<${tag}></${tag}>`, "test.tp");
      expect(getElementContentFormat(doc.root!, 0)).toBe("unrendered-xml");
    }
  });
});
