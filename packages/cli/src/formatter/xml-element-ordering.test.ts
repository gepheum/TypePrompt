import { parseXmlDocument } from "@typeprompt/core";
import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { reorderXmlElements } from "./xml-element-ordering.js";

describe("reorderXmlElements", () => {
  it("reorders template children into canonical order", () => {
    const xml = `<template name="Test">
  <user>U</user>
  <system>S</system>
</template>`;

    const doc = parseXmlDocument(xml, "test.xml");
    if (doc.kind !== "success") throw new Error("Parse failed");

    const reordered = reorderXmlElements(doc);
    expect(reordered.content).toBe(`<template name="Test">
  <system>S</system>
  <user>U</user>
</template>`);
  });

  it("reorders tools before schema into schema before tools", () => {
    const xml = `<template name="Test">
  <tools>
    - tool: webSearch
  </tools>
  <schema>
    type Input = { q: string; };
    type Output = string;
  </schema>
</template>`;

    const doc = parseXmlDocument(xml, "test.xml");
    if (doc.kind !== "success") throw new Error("Parse failed");

    const reordered = reorderXmlElements(doc);
    expect(reordered.content).toBe(`<template name="Test">
  <schema>
    type Input = { q: string; };
    type Output = string;
  </schema>
  <tools>
    - tool: webSearch
  </tools>
</template>`);
  });

  it("reorders fully scrambled template elements into canonical order", () => {
    const xml = `<template name="Scrambled">
  <variant case="v">
    <system>Variant S</system>
  </variant>
  <examples>
    - input: {}
      output: ok
  </examples>
  <user>User msg</user>
  <system>System msg</system>
  <snippet name="snip">
    Snippet text
  </snippet>
  <tools>
    - tool: myTool
  </tools>
  <schema>
    type Input = {};
    type Output = string;
  </schema>
  <meta>
    model: gpt-4o
  </meta>
</template>`;

    const doc = parseXmlDocument(xml, "test.xml");
    if (doc.kind !== "success") throw new Error("Parse failed");

    const reordered = reorderXmlElements(doc);
    expect(reordered.content).toBe(`<template name="Scrambled">
  <meta>
    model: gpt-4o
  </meta>
  <schema>
    type Input = {};
    type Output = string;
  </schema>
  <tools>
    - tool: myTool
  </tools>
  <system>System msg</system>
  <user>User msg</user>
  <examples>
    - input: {}
      output: ok
  </examples>
  <snippet name="snip">
    Snippet text
  </snippet>
  <variant case="v">
    <system>Variant S</system>
  </variant>
</template>`);
    expect(reordered.content.length).toBe(xml.length);
  });

  it("returns the exact same document reference if already in canonical order", () => {
    const xml = `<template name="Ordered">
  <meta>
    model: gpt-4o
  </meta>
  <schema>
    type Input = {};
    type Output = string;
  </schema>
  <system>S</system>
  <user>U</user>
</template>`;

    const doc = parseXmlDocument(xml, "test.xml");
    if (doc.kind !== "success") throw new Error("Parse failed");

    const reordered = reorderXmlElements(doc);
    expect(reordered).toBe(doc);
  });

  it("preserves comments preceding each element during reordering", () => {
    const xml = `<template name="WithComments">
  <!-- Comment for user -->
  <user>U</user>
  <!-- Comment for system -->
  <system>S</system>
</template>`;

    const doc = parseXmlDocument(xml, "test.xml");
    if (doc.kind !== "success") throw new Error("Parse failed");

    const reordered = reorderXmlElements(doc);
    expect(reordered.content).toBe(`<template name="WithComments">
  <!-- Comment for system -->
  <system>S</system>
  <!-- Comment for user -->
  <user>U</user>
</template>`);
  });

  it("reorders children inside variant elements", () => {
    const xml = `<template name="WithVariant">
  <variant case="a">
    <user>Variant U</user>
    <system>Variant S</system>
  </variant>
</template>`;

    const doc = parseXmlDocument(xml, "test.xml");
    if (doc.kind !== "success") throw new Error("Parse failed");

    const reordered = reorderXmlElements(doc);
    expect(reordered.content).toBe(`<template name="WithVariant">
  <variant case="a">
    <system>Variant S</system>
    <user>Variant U</user>
  </variant>
</template>`);
  });

  it("reorders description before schema inside tool elements", () => {
    const xml = `<tool name="myTool">
  <schema>
    interface Input { x: string; }
    type Output = string;
  </schema>
  <description>Search tool description</description>
</tool>`;

    const doc = parseXmlDocument(xml, "test.xml");
    if (doc.kind !== "success") throw new Error("Parse failed");

    const reordered = reorderXmlElements(doc);
    expect(reordered.content).toBe(`<tool name="myTool">
  <description>Search tool description</description>
  <schema>
    interface Input { x: string; }
    type Output = string;
  </schema>
</tool>`);
  });

  it("leaves tool unchanged when description is already before schema", () => {
    const xml = `<tool name="myTool">
  <description>Search tool description</description>
  <schema>
    interface Input { x: string; }
    type Output = string;
  </schema>
</tool>`;

    const doc = parseXmlDocument(xml, "test.xml");
    if (doc.kind !== "success") throw new Error("Parse failed");

    const reordered = reorderXmlElements(doc);
    expect(reordered).toBe(doc);
  });

  it("does not reorder unsupported elements like namespace", () => {
    const xml = `<namespace name="Finance">
  type B = string;
  type A = number;
</namespace>`;

    const doc = parseXmlDocument(xml, "test.xml");
    if (doc.kind !== "success") throw new Error("Parse failed");

    const reordered = reorderXmlElements(doc);
    expect(reordered).toBe(doc);
  });
});
