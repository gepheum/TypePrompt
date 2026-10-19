import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { getPositionContext } from "./position-context.js";

describe("getPositionContext", () => {
  it("computes line coordinates, line text, and indentation correctly", () => {
    const doc = [
      '<template name="Test">',
      "  <system>",
      "    Hello world",
      "  </system>",
      "</template>",
    ].join("\n");

    const offset = doc.indexOf("Hello");
    const ctx = getPositionContext(doc, offset);

    expect(ctx.lineNumber).toBe(2);
    expect(ctx.colNumber).toBe(4);
    expect(ctx.lineText).toBe("    Hello world");
    expect(ctx.textBeforeOnLine).toBe("    ");
    expect(ctx.textAfterOnLine).toBe("Hello world");
    expect(ctx.lineIndent).toBe(4);
    expect(ctx.prevNonEmptyLineText).toBe("  <system>");
    expect(ctx.prevNonEmptyLineIndent).toBe(2);
  });

  it("identifies element hierarchy and content format", () => {
    const doc = [
      '<template name="Test">',
      "  <meta>",
      "    model: gpt-4o",
      "  </meta>",
      "  <schema>",
      "    type Input = string;",
      "  </schema>",
      "</template>",
    ].join("\n");

    // Inside meta (yaml)
    const metaOffset = doc.indexOf("model:");
    const metaCtx = getPositionContext(doc, metaOffset);
    expect(metaCtx.currentElement?.tag.text).toBe("meta");
    expect(metaCtx.parentElements.length).toBe(1);
    expect(metaCtx.parentElements[0]?.tag.text).toBe("template");
    expect(metaCtx.depth).toBe(1);
    expect(metaCtx.contentFormat).toBe("yaml");

    // Inside schema (schema)
    const schemaOffset = doc.indexOf("type Input");
    const schemaCtx = getPositionContext(doc, schemaOffset);
    expect(schemaCtx.currentElement?.tag.text).toBe("schema");
    expect(schemaCtx.depth).toBe(1);
    expect(schemaCtx.contentFormat).toBe("schema");
  });

  it("detects XML comments", () => {
    const doc = [
      '<template name="Test">',
      "  <!-- This is an XML comment -->",
      "</template>",
    ].join("\n");

    const offset = doc.indexOf("This is an XML comment");
    const ctx = getPositionContext(doc, offset);

    expect(ctx.comment).toMatch({
      kind: "xml",
      text: "<!-- This is an XML comment -->",
      isUnclosed: false,
    });
  });

  it("detects schema comments (JSDoc, block, and line)", () => {
    const doc = [
      '<template name="Test">',
      "  <schema>",
      "    /** jsdoc comment */",
      "    /* block comment */",
      "    // line comment",
      "  </schema>",
      "</template>",
    ].join("\n");

    const jsdocCtx = getPositionContext(doc, doc.indexOf("jsdoc"));
    expect(jsdocCtx.comment?.kind).toBe("jsdoc");
    expect(jsdocCtx.comment?.isUnclosed).toBe(false);

    const blockCtx = getPositionContext(doc, doc.indexOf("block"));
    expect(blockCtx.comment?.kind).toBe("block");
    expect(blockCtx.comment?.isUnclosed).toBe(false);

    const lineCtx = getPositionContext(doc, doc.indexOf("line"));
    expect(lineCtx.comment?.kind).toBe("line");
    expect(lineCtx.comment?.isUnclosed).toBe(false);
  });

  it("detects unclosed schema comments", () => {
    const doc = [
      '<template name="Test">',
      "  <schema>",
      "    /** unclosed comment",
      "  </schema>",
      "</template>",
    ].join("\n");

    const ctx = getPositionContext(doc, doc.indexOf("unclosed"));
    expect(ctx.comment?.kind).toBe("jsdoc");
    expect(ctx.comment?.isUnclosed).toBe(true);
  });

  it("detects isBetweenTags", () => {
    const doc = "<system></system>";
    const offset = doc.indexOf("><") + 1; // between > and <
    const ctx = getPositionContext(doc, offset);

    expect(ctx.isBetweenTags).toMatch({
      openTagName: "system",
      closeTagName: "system",
    });
  });

  it("detects isBetweenBrackets", () => {
    const doc1 = "const x = {};";
    const offset1 = doc1.indexOf("{}") + 1;
    expect(getPositionContext(doc1, offset1).isBetweenBrackets).toMatch({
      open: "{",
      close: "}",
    });

    const doc2 = "const x = [  ];";
    const offset2 = doc2.indexOf("[  ]") + 2; // inside spaces
    expect(getPositionContext(doc2, offset2).isBetweenBrackets).toMatch({
      open: "[",
      close: "]",
    });
  });

  it("detects isInsideSchema and isSchemaZone", () => {
    const doc = [
      '<template name="Test">',
      "  <schema>",
      "    type Input = string;",
      "  </schema>",
      "  <system>",
      "    Hello",
      "  </system>",
      "</template>",
    ].join("\n");

    const insideSchema = getPositionContext(doc, doc.indexOf("type Input"));
    expect(insideSchema.isInsideSchema).toBe(true);
    expect(insideSchema.isSchemaZone).toBe(true);

    const insideSystem = getPositionContext(doc, doc.indexOf("Hello"));
    expect(insideSystem.isInsideSchema).toBe(false);
    expect(insideSystem.isSchemaZone).toBe(false);

    const onSchemaTag = getPositionContext(doc, doc.indexOf("<schema>") + 2);
    expect(onSchemaTag.isInsideSchema).toBe(false);
    expect(onSchemaTag.isSchemaZone).toBe(false);
  });

  it("detects isBetweenXmlComment", () => {
    const doc1 = "  <!---->";
    const offset1 = doc1.indexOf("<!---->") + 4;
    expect(getPositionContext(doc1, offset1).isBetweenXmlComment).toBe(true);

    const doc2 = "  <!-- hello -->";
    const offset2 = doc2.indexOf("hello") + 2;
    expect(getPositionContext(doc2, offset2).isBetweenXmlComment).toBe(false);

    const doc3 = "<schema><!----></schema>";
    const offset3 = doc3.indexOf("<!---->") + 4;
    expect(getPositionContext(doc3, offset3).isBetweenXmlComment).toBe(true);
  });
});
