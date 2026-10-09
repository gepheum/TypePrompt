import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { getCompletionItems } from "./completion-provider.js";

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
    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.xml",
      pathToOldContent: { "prompts/test.xml": xml },
      position: pos,
      cache: null,
      patchBase: null,
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
    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.xml",
      pathToOldContent: { "prompts/test.xml": xml },
      position: pos,
      cache: null,
      patchBase: null,
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
    const result = getCompletionItems({
      newContent: mainXml,
      path: "prompts/Leg/Test.xml",
      pathToOldContent: {
        "prompts/Legal/shared.xml": legalXml,
        "prompts/Leg/Test.xml": mainXml,
      },
      position: pos,
      cache: null,
      patchBase: null,
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

    const result = getCompletionItems({
      newContent: xml,
      path: "prompts/test.xml",
      pathToOldContent: { "prompts/test.xml": xml },
      position: 5,
      cache: null,
      patchBase: null,
    });

    expect(result).toBe(null);
  });
});
