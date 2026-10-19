import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeBackspaceAction,
  computeEnterAction,
  getAutoCloseCommentAction,
  getAutoCloseTagAction,
} from "./editor-actions.js";

describe("editor-actions", () => {
  describe("getAutoCloseTagAction", () => {
    it("suggests closing tag for an unclosed start tag", () => {
      const content = "<system>";
      const action = getAutoCloseTagAction(content, content.length);
      assert.equal(action, "</system>");
    });

    it("suggests closing tag for a nested start tag", () => {
      const content = "<prompt>\n  <user>";
      const action = getAutoCloseTagAction(content, content.length);
      assert.equal(action, "</user>");
    });

    it("returns null for self-closing tag", () => {
      const content = '<val name="foo" />';
      const action = getAutoCloseTagAction(content, content.length);
      assert.equal(action, null);
    });

    it("returns null for already closed tag", () => {
      const content = "<system></system>";
      const action = getAutoCloseTagAction(content, "<system>".length);
      assert.equal(action, null);
    });

    it("returns null for an XML comment", () => {
      const content = "<!-- comment -->";
      const action = getAutoCloseTagAction(content, content.length);
      assert.equal(action, null);
    });
  });

  describe("getAutoCloseCommentAction", () => {
    it("auto-closes when typing * after / inside schema", () => {
      const content = "<schema>/</schema>";
      const offset = "<schema>/".length;
      const action = getAutoCloseCommentAction(content, offset, "*");
      assert.deepEqual(action, {
        insert: "* */",
        cursorOffset: offset + 1,
      });
    });

    it("auto-closes when typing /* inside schema", () => {
      const content = "<schema></schema>";
      const offset = "<schema>".length;
      const action = getAutoCloseCommentAction(content, offset, "/*");
      assert.deepEqual(action, {
        insert: "/* */",
        cursorOffset: offset + 2,
      });
    });

    it("does not auto-close /* if already followed by */ inside schema", () => {
      const content = "<schema>/*/</schema>";
      const offset = "<schema>/".length;
      const action = getAutoCloseCommentAction(content, offset, "*");
      assert.equal(action, null);
    });

    it("does not auto-close /* if already followed by  */ inside schema", () => {
      const content = "<schema>/ */</schema>";
      const offset = "<schema>/".length;
      const action = getAutoCloseCommentAction(content, offset, "*");
      assert.equal(action, null);
    });

    it("does not auto-close /* outside schema zone", () => {
      const content = "<system>/</system>";
      const offset = "<system>/".length;
      assert.equal(getAutoCloseCommentAction(content, offset, "*"), null);
      assert.equal(getAutoCloseCommentAction("", 0, "/*"), null);
    });

    it("auto-closes when typing - after <!- outside schema", () => {
      const content = "<!-";
      const action = getAutoCloseCommentAction(content, 3, "-");
      assert.deepEqual(action, {
        insert: "--->",
        cursorOffset: 4,
      });
    });

    it("auto-closes when typing <!-- outside schema", () => {
      const content = "";
      const action = getAutoCloseCommentAction(content, 0, "<!--");
      assert.deepEqual(action, {
        insert: "<!---->",
        cursorOffset: 4,
      });
    });

    it("does not auto-close <!-- if already followed by -->", () => {
      const content = "<!--->";
      const action = getAutoCloseCommentAction(content, 3, "-");
      assert.equal(action, null);
    });

    it("auto-closes <!-- regardless of context", () => {
      const content = "<schema><!-</schema>";
      const offset = "<schema><!-".length;
      assert.deepEqual(getAutoCloseCommentAction(content, offset, "-"), {
        insert: "--->",
        cursorOffset: offset + 1,
      });
    });

    it("returns null for other characters", () => {
      assert.equal(getAutoCloseCommentAction("foo", 3, "a"), null);
    });
  });

  describe("computeBackspaceAction", () => {
    it("undos auto-closed /** */ inside schema", () => {
      const content = "<schema>/** */</schema>";
      const offset = "<schema>/**".length;
      const action = computeBackspaceAction(content, offset);
      assert.deepEqual(action, {
        from: offset - 1,
        to: offset + 3,
        insert: "",
        targetCursorOffset: offset - 1,
      });
    });

    it("undos auto-closed /* */ inside schema", () => {
      const content = "<schema>/* */</schema>";
      const offset = "<schema>/*".length;
      const action = computeBackspaceAction(content, offset);
      assert.deepEqual(action, {
        from: offset - 1,
        to: offset + 3,
        insert: "",
        targetCursorOffset: offset - 1,
      });
    });

    it("does not undo /* */ outside schema", () => {
      const content = "<system>/* */</system>";
      const offset = "<system>/*".length;
      assert.equal(computeBackspaceAction(content, offset), null);
    });

    it("undos auto-closed <!----> outside schema", () => {
      const content = "<!---->";
      const offset = 4; // cursor between <!-- and -->
      const action = computeBackspaceAction(content, offset);
      assert.deepEqual(action, {
        from: 3,
        to: 7,
        insert: "",
        targetCursorOffset: 3,
      });
    });

    it("returns null if comment content has been typed", () => {
      const content = "<schema>/** hello */</schema>";
      const offset = "<schema>/**".length;
      assert.equal(computeBackspaceAction(content, offset), null);
    });
  });

  describe("computeEnterAction", () => {
    it("splits /** */ into three aligned lines inside schema", () => {
      const content = "<schema>\n  /** */\n</schema>";
      const offset = content.indexOf("/** ") + 3; // cursor right between /** and  */
      const res = computeEnterAction(content, offset);
      assert.equal(res.handled, true);
      assert.equal(res.changes[0]?.insert, "\n   * \n   */");
      assert.equal(res.targetCursorOffset, offset + "\n   * ".length);
    });

    it("splits /* */ into three aligned lines inside schema", () => {
      const content = "<schema>\n  /* */\n</schema>";
      const offset = content.indexOf("/* ") + 2;
      const res = computeEnterAction(content, offset);
      assert.equal(res.handled, true);
      assert.equal(res.changes[0]?.insert, "\n   * \n   */");
    });

    it("moves */ to next line when hitting Enter before */ inside schema", () => {
      const content = "<schema>\n   * some comment */\n</schema>";
      const offset = content.indexOf("*/");
      const res = computeEnterAction(content, offset);
      assert.equal(res.handled, true);
      assert.equal(res.changes[0]?.insert, "\n   */");
    });

    it("continues comment with star aligned when hitting Enter in unclosed comment inside schema", () => {
      const content = "<schema>\n  /**\n</schema>";
      const offset = content.indexOf("  /**") + "  /**".length;
      const res = computeEnterAction(content, offset);
      assert.equal(res.handled, true);
      assert.equal(res.changes[0]?.insert, "\n   * ");
    });

    it("continues comment with star aligned on comment continuation line inside schema", () => {
      const content = "<schema>\n   * some text\n</schema>";
      const offset =
        content.indexOf("   * some text") + "   * some text".length;
      const res = computeEnterAction(content, offset);
      assert.equal(res.handled, true);
      assert.equal(res.changes[0]?.insert, "\n   * ");
    });

    it("does not format JSDoc comment when hitting Enter outside schema", () => {
      const content = "<system>\n  /** */\n</system>";
      const offset = content.indexOf("/** ") + 3;
      const res = computeEnterAction(content, offset);
      assert.equal(res.handled, false);
    });

    it("splits between <!-- and --> with indent and outdent", () => {
      const content = "  <!---->";
      const offset = content.indexOf("<!---->") + 4;
      const res = computeEnterAction(content, offset, { tabSize: 2 });
      assert.equal(res.handled, true);
      assert.equal(res.changes[0]?.insert, "\n    \n  ");
      assert.equal(res.targetCursorOffset, offset + 1 + 4);
    });

    it("outdents to slash column when hitting Enter after closing */ of multiline comment", () => {
      const content = "<schema>\n  /**\n   * test\n   */\n</schema>";
      const closeOffset = content.indexOf("   */") + "   */".length;
      const res = computeEnterAction(content, closeOffset);
      assert.equal(res.handled, true);
      assert.equal(res.changes[0]?.insert, "\n  ");
    });

    it("does NOT append * when hitting Enter after a single-line comment", () => {
      const content =
        "<schema>\n  /** A support ticket to be triaged. */\n</schema>";
      const endOffset = content.indexOf("*/") + 2;
      const res = computeEnterAction(content, endOffset);
      assert.equal(res.handled, false);
    });

    it("splits single-line comment if Enter is pressed in the middle of it", () => {
      const content = "<schema>\n  /** A support| ticket */\n</schema>".replace(
        "|",
        "",
      );
      const offset = content.indexOf("support") + "support".length;
      const res = computeEnterAction(content, offset);
      assert.equal(res.handled, true);
      assert.equal(res.changes[0]?.insert, "\n   * ");
    });

    it("indents and outdents between matching XML tags", () => {
      const content = "  <system></system>";
      const offset = content.indexOf("><") + 1;
      const res = computeEnterAction(content, offset, { tabSize: 2 });
      assert.equal(res.handled, true);
      assert.equal(res.changes[0]?.insert, "\n    \n  ");
      assert.equal(res.targetCursorOffset, offset + 1 + 4);
    });

    it("indents and outdents between matching brackets", () => {
      const content = "  {}";
      const offset = content.indexOf("}");
      const res = computeEnterAction(content, offset, { tabSize: 2 });
      assert.equal(res.handled, true);
      assert.equal(res.changes[0]?.insert, "\n    \n  ");
    });

    it("returns handled: false for normal code", () => {
      const content = '  <val name="foo" />';
      const offset = content.length;
      const res = computeEnterAction(content, offset);
      assert.equal(res.handled, false);
    });
  });
});
