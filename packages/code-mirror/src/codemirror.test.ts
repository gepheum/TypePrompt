import { CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { getIndentation, IndentContext } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { githubDark } from "@uiw/codemirror-themes-all";
import { describe, it } from "mocha";
import assert from "node:assert";
import {
  CLOSE_RE,
  getCompilationResult,
  getSemanticTokens,
  OPEN_BRACKET_RE,
  OPEN_TAG_RE,
  typeprompt,
  typepromptBackspaceCommand,
  typepromptCompletionSource,
  typepromptConfigFacet,
  typepromptEnterCommand,
  typepromptHighlightField,
  typepromptHighlighting,
  typepromptIndentation,
  typepromptIndentCalculation,
  typepromptLinter,
  typepromptStateField,
} from "./codemirror/index.js";

const validTemplate = `
<template name="Summarize">
  <schema>
    type Input = { text: string; };
    type Output = { summary: string; };
  </schema>
  <system>
    You are a helpful assistant.
  </system>
  <user>
    Summarize: <insert val="input.text" />
  </user>
</template>
`.trim();

const invalidTemplate = `
<template name="Broken">
  <schema>
    type Input = { text: string };
  </schema>
  <system>
    <unknownElement />
  </system>
</template>
`.trim();

describe("TypePrompt CodeMirror Extension", () => {
  describe("StateField & Immutability Caching", () => {
    it("creates initial compilation result and semantic tokens", () => {
      const state = EditorState.create({
        doc: validTemplate,
        extensions: [typepromptStateField],
      });

      const compState = state.field(typepromptStateField);
      assert.ok(compState);
      assert.strictEqual(compState.compilationResult.anyErrors, false);
      assert.ok(compState.tokens.length > 0);

      // Verify helpers
      assert.strictEqual(
        getCompilationResult(state),
        compState.compilationResult,
      );
      assert.strictEqual(getSemanticTokens(state), compState.tokens);
    });

    it("returns identical state instance when transaction does not change document", () => {
      const state = EditorState.create({
        doc: validTemplate,
        extensions: [typepromptStateField],
      });

      const initialCompState = state.field(typepromptStateField);

      // Selection change (doc unchanged)
      const tr = state.update({
        selection: { anchor: 10 },
      });

      const newCompState = tr.state.field(typepromptStateField);

      // Must be EXACT same object reference (immutability caching!)
      assert.strictEqual(
        newCompState,
        initialCompState,
        "StateField must return the identical cached state object when document is unchanged",
      );
      assert.strictEqual(
        newCompState.compilationResult,
        initialCompState.compilationResult,
        "CompilationResult reference must be preserved",
      );
    });

    it("incrementally compiles when document changes", () => {
      const state = EditorState.create({
        doc: validTemplate,
        extensions: [typepromptStateField],
      });

      const initialCompState = state.field(typepromptStateField);

      // Change document by inserting a comment
      const tr = state.update({
        changes: { from: 0, to: 0, insert: "<!-- comment -->\n" },
      });

      const newCompState = tr.state.field(typepromptStateField);
      assert.notStrictEqual(newCompState, initialCompState);
      assert.strictEqual(newCompState.compilationResult.anyErrors, false);
    });
  });

  describe("Syntactic Coloring (Highlighting)", () => {
    it("produces syntax highlighting decorations for tokens", () => {
      const state = EditorState.create({
        doc: validTemplate,
        extensions: [typepromptStateField, typepromptHighlighting],
      });

      const decorations = state.field(typepromptHighlightField);
      assert.ok(decorations);
      assert.ok(decorations.size > 0);

      // Verify semantic tokens contain expected kinds
      const tokens = getSemanticTokens(state)!;
      const kinds = new Set(tokens.map((t) => t.kind));
      assert.ok(kinds.has("xml-tag"), "Should contain xml-tag tokens");
      assert.ok(
        kinds.has("schema-keyword"),
        "Should contain schema-keyword tokens",
      );
      assert.ok(kinds.has("string"), "Should contain string tokens");
    });

    it("adapts syntax highlighting decorations to custom themes", () => {
      const state = EditorState.create({
        doc: validTemplate,
        extensions: [typepromptStateField, typepromptHighlighting, githubDark],
      });

      const decorations = state.field(typepromptHighlightField);
      assert.ok(decorations);
      assert.ok(decorations.size > 0);
    });

    it("produces theme decorations for both JSDoc and line comments", () => {
      const doc = `<template name="Test">
  <schema>
    // regular comment
    /** jsdoc comment */
    type Input = string;
  </schema>
</template>`;
      const state = EditorState.create({
        doc,
        extensions: [typepromptStateField, typepromptHighlighting],
      });

      const tokens = getSemanticTokens(state)!;
      const commentTokens = tokens.filter((t) => t.kind === "comment");
      assert.strictEqual(commentTokens.length, 2);

      const decorations = state.field(typepromptHighlightField);
      let foundComments = 0;

      decorations.between(0, doc.length, (from, to) => {
        if (
          commentTokens.some((t) => t.span.start === from && t.span.end === to)
        ) {
          foundComments++;
        }
      });

      assert.strictEqual(foundComments, 2);
    });
  });

  describe("Automatic Validation (Linter)", () => {
    it("reports zero diagnostics for valid template matching file path", () => {
      const state = EditorState.create({
        doc: validTemplate,
        extensions: [
          typepromptConfigFacet.of({ path: "Summarize.xml" }),
          typepromptStateField,
        ],
      });
      const mockView = { state } as unknown as EditorView;

      const diagnostics = typepromptLinter(mockView);
      assert.strictEqual(diagnostics.length, 0);
    });

    it("reports diagnostics with line positions for invalid template", () => {
      const state = EditorState.create({
        doc: invalidTemplate,
        extensions: [typepromptStateField],
      });
      const mockView = { state } as unknown as EditorView;

      const diagnostics = typepromptLinter(mockView);
      assert.ok(
        diagnostics.length > 0,
        "Should have diagnostics for unknownElement",
      );
      const err = diagnostics.find(
        (d) => d.message.includes("unknownElement") || d.severity === "error",
      );
      assert.ok(err);
      assert.strictEqual(err.severity, "error");
      assert.ok(err.from >= 0);
      assert.ok(err.to > err.from);
    });
  });

  describe("Auto-Completion", () => {
    it("suggests child elements when typing < in body", () => {
      const doc = [
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

      const pos = doc.indexOf("    <") + 5;
      const state = EditorState.create({
        doc,
        selection: { anchor: pos },
        extensions: [typepromptStateField],
      });

      const context = new CompletionContext(state, pos, true);
      const result = typepromptCompletionSource(context);

      assert.ok(result !== null);
      assert.ok(result.options.length > 0);
      const labels = result.options.map((o) => o.label);
      assert.ok(labels.includes("insert"));
      assert.ok(labels.includes("c"));
    });

    it("suggests YAML fields on an indented empty line inside examples", () => {
      const doc = [
        '<template name="Test">',
        "  <schema>",
        "    type Input = { subject: string; priority: string; };",
        "    type Output = { status: string; };",
        "  </schema>",
        "  <system>sys</system>",
        "  <user>usr</user>",
        "  <examples>",
        "    - input:",
        "        subject: Test",
        "        ",
        "      output:",
        "        status: ok",
        "  </examples>",
        "</template>",
      ].join("\n");

      const pos = doc.indexOf("        \n") + 8;
      const state = EditorState.create({
        doc,
        selection: { anchor: pos },
        extensions: [typepromptStateField],
      });

      const context = new CompletionContext(state, pos, true);
      const result = typepromptCompletionSource(context);

      assert.ok(result !== null);
      assert.strictEqual(result.from, pos);
      assert.strictEqual(result.to, pos);
      const labels = result.options.map((o) => o.label);
      assert.ok(labels.includes("priority"));
    });
  });

  describe("Indentation Rules", () => {
    describe("Regular Expressions", () => {
      it("correctly matches open tags", () => {
        assert.ok(OPEN_TAG_RE.test("<template>"));
        assert.ok(OPEN_TAG_RE.test('<template name="Summarize">'));
        assert.ok(OPEN_TAG_RE.test("  <system>"));
        assert.ok(OPEN_TAG_RE.test('  <custom:tag foo="bar">  '));

        // Must NOT match self-closing, closing, comments, or processing instructions
        assert.strictEqual(OPEN_TAG_RE.test('<insert val="x" />'), false);
        assert.strictEqual(OPEN_TAG_RE.test('  <val foo="bar"/>'), false);
        assert.strictEqual(OPEN_TAG_RE.test("</template>"), false);
        assert.strictEqual(OPEN_TAG_RE.test("  </system>"), false);
        assert.strictEqual(OPEN_TAG_RE.test("<!-- comment -->"), false);
        assert.strictEqual(OPEN_TAG_RE.test('<?xml version="1.0"?>'), false);
      });

      it("correctly matches open brackets and YAML colons", () => {
        assert.ok(OPEN_BRACKET_RE.test("{"));
        assert.ok(OPEN_BRACKET_RE.test("type Input = {"));
        assert.ok(OPEN_BRACKET_RE.test("items: ["));
        assert.ok(OPEN_BRACKET_RE.test("fn("));
        assert.ok(OPEN_BRACKET_RE.test("metadata:"));
        assert.ok(OPEN_BRACKET_RE.test("metadata:  "));
        assert.ok(OPEN_BRACKET_RE.test("if (x <"));

        assert.strictEqual(
          OPEN_BRACKET_RE.test("type Input = { text: string };"),
          false,
        );
        assert.strictEqual(OPEN_BRACKET_RE.test("normal text"), false);
        assert.strictEqual(OPEN_BRACKET_RE.test("foo: bar"), false);
      });

      it("correctly matches closing tags and closing brackets", () => {
        assert.ok(CLOSE_RE.test("</template>"));
        assert.ok(CLOSE_RE.test("  </system>"));
        assert.ok(CLOSE_RE.test("}"));
        assert.ok(CLOSE_RE.test("  }"));
        assert.ok(CLOSE_RE.test("]"));
        assert.ok(CLOSE_RE.test(")"));

        assert.strictEqual(CLOSE_RE.test("<template>"), false);
        assert.strictEqual(CLOSE_RE.test("text"), false);
      });
    });

    describe("Indentation Calculation via getIndentation", () => {
      it("indents line following an open tag by 2 spaces", () => {
        const doc = ['<template name="Test">', ""].join("\n");
        const state = EditorState.create({
          doc,
          extensions: [typepromptIndentation],
        });

        // Query indentation for line 2 (offset after newline)
        const line2Pos = doc.indexOf("\n") + 1;
        const indent = getIndentation(state, line2Pos);
        assert.strictEqual(indent, 2);
      });

      it("indents line following an open bracket or colon", () => {
        const doc1 = ["type Input = {", ""].join("\n");
        const state1 = EditorState.create({
          doc: doc1,
          extensions: [typepromptIndentation],
        });
        assert.strictEqual(getIndentation(state1, doc1.indexOf("\n") + 1), 2);

        const doc2 = ["params:", ""].join("\n");
        const state2 = EditorState.create({
          doc: doc2,
          extensions: [typepromptIndentation],
        });
        assert.strictEqual(getIndentation(state2, doc2.indexOf("\n") + 1), 2);
      });

      it("does not increase indent after a self-closing tag or comment", () => {
        const doc1 = ['  <insert val="x" />', ""].join("\n");
        const state1 = EditorState.create({
          doc: doc1,
          extensions: [typepromptIndentation],
        });
        assert.strictEqual(getIndentation(state1, doc1.indexOf("\n") + 1), 2);

        const doc2 = ["<!-- comment -->", ""].join("\n");
        const state2 = EditorState.create({
          doc: doc2,
          extensions: [typepromptIndentation],
        });
        assert.strictEqual(getIndentation(state2, doc2.indexOf("\n") + 1), 0);
      });

      it("outdents line starting with a closing tag", () => {
        const doc = [
          '<template name="Test">',
          "  <system>",
          "    Hello world",
          "  </system>",
          "</template>",
        ].join("\n");

        const state = EditorState.create({
          doc,
          extensions: [typepromptIndentation],
        });

        const lineSystemClosePos = doc.indexOf("  </system>");
        const indentSystem = getIndentation(state, lineSystemClosePos);
        assert.strictEqual(indentSystem, 2);

        const lineTemplateClosePos = doc.indexOf("</template>");
        const indentTemplate = getIndentation(state, lineTemplateClosePos);
        assert.strictEqual(indentTemplate, 0);
      });

      it("outdents line starting with a closing bracket", () => {
        const doc = ["type Input = {", "  text: string;", "}"].join("\n");

        const state = EditorState.create({
          doc,
          extensions: [typepromptIndentation],
        });

        const lineClosePos = doc.indexOf("}");
        const indent = getIndentation(state, lineClosePos);
        assert.strictEqual(indent, 0);
      });
    });

    describe("Enter Command & IndentOutdent Behavior", () => {
      const createMockView = (initialDoc: string, cursorOffset: number) => {
        let state = EditorState.create({
          doc: initialDoc,
          selection: { anchor: cursorOffset },
          extensions: [typepromptIndentation],
        });
        const view = {
          get state() {
            return state;
          },
          dispatch(tr: any) {
            if (tr.state) {
              state = tr.state;
            } else {
              state = state.update(tr).state;
            }
          },
        } as unknown as EditorView;
        return { view, getState: () => state };
      };

      it("splits between matching tags with indentOutdent when Enter is pressed", () => {
        const initialDoc = "<system></system>";
        const cursor = "<system>".length;
        const { view, getState } = createMockView(initialDoc, cursor);

        const handled = typepromptEnterCommand(view);
        assert.strictEqual(handled, true);

        const expected = ["<system>", "  ", "</system>"].join("\n");
        assert.strictEqual(getState().doc.toString(), expected);
        // Cursor should be at the indented middle line
        const middleLinePos = "<system>\n  ".length;
        assert.strictEqual(getState().selection.main.anchor, middleLinePos);
      });

      it("splits between matching tags with nested base indent", () => {
        const initialDoc = "  <system></system>";
        const cursor = "  <system>".length;
        const { view, getState } = createMockView(initialDoc, cursor);

        const handled = typepromptEnterCommand(view);
        assert.strictEqual(handled, true);

        const expected = ["  <system>", "    ", "  </system>"].join("\n");
        assert.strictEqual(getState().doc.toString(), expected);
        const middleLinePos = "  <system>\n    ".length;
        assert.strictEqual(getState().selection.main.anchor, middleLinePos);
      });

      it("splits between matching brackets {} with indentOutdent", () => {
        const initialDoc = "type Input = {}";
        const cursor = "type Input = {".length;
        const { view, getState } = createMockView(initialDoc, cursor);

        const handled = typepromptEnterCommand(view);
        assert.strictEqual(handled, true);

        const expected = ["type Input = {", "  ", "}"].join("\n");
        assert.strictEqual(getState().doc.toString(), expected);
        const middleLinePos = "type Input = {\n  ".length;
        assert.strictEqual(getState().selection.main.anchor, middleLinePos);
      });

      it("indents newly inserted line when pressing Enter at end of open tag", () => {
        const initialDoc = '<template name="Test">';
        const cursor = initialDoc.length;
        const { view, getState } = createMockView(initialDoc, cursor);

        const handled = typepromptEnterCommand(view);
        assert.strictEqual(handled, true);

        const expected = ['<template name="Test">', "  "].join("\n");
        assert.strictEqual(getState().doc.toString(), expected);
        assert.strictEqual(getState().selection.main.anchor, expected.length);
      });

      it("indents newly inserted line when pressing Enter at end of open bracket", () => {
        const initialDoc = "type Input = {";
        const cursor = initialDoc.length;
        const { view, getState } = createMockView(initialDoc, cursor);

        const handled = typepromptEnterCommand(view);
        assert.strictEqual(handled, true);

        const expected = ["type Input = {", "  "].join("\n");
        assert.strictEqual(getState().doc.toString(), expected);
        assert.strictEqual(getState().selection.main.anchor, expected.length);
      });

      it("attempts to accept completion before performing Enter indentation actions", () => {
        const { view, getState } = createMockView("<system></system>", 8);
        const handled = typepromptEnterCommand(view);
        assert.strictEqual(handled, true);
        const expected = ["<system>", "  ", "</system>"].join("\n");
        assert.strictEqual(getState().doc.toString(), expected);
      });
    });

    describe("Multiline Comment Editing", () => {
      const createFullMockView = (initialDoc: string, cursorOffset: number) => {
        let state = EditorState.create({
          doc: initialDoc,
          selection: { anchor: cursorOffset },
          extensions: [
            typeprompt({
              path: "template.xml",
              autoCloseComments: true,
              indent: true,
            }),
          ],
        });
        const view = {
          get state() {
            return state;
          },
          dispatch(tr: any) {
            if (tr.state) {
              state = tr.state;
            } else {
              state = state.update(tr).state;
            }
          },
        } as unknown as EditorView;
        const input = (text: string) => {
          const from = state.selection.main.from;
          const to = state.selection.main.to;
          const handlers = state.facet(EditorView.inputHandler);
          for (const handler of handlers) {
            if (
              handler(view, from, to, text, () =>
                view.state.update({ changes: { from, to, insert: text } }),
              )
            ) {
              return true;
            }
          }
          return false;
        };
        return { view, getState: () => state, input };
      };

      describe("autoCloseComments", () => {
        it("auto-closes '/*' with ' */' when typing '*' after '/'", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("/") + 1;
          const { getState, input } = createFullMockView(doc, cursor);

          const handled = input("*");
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    /* */",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          // Cursor must be placed right between "/*" and " */"
          const expectedCursor = expectedDoc.indexOf("/*") + 2;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("auto-closes '/*' with ' */' when entering '/*' directly", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    ",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("    ") + 4;
          const { getState, input } = createFullMockView(doc, cursor);

          const handled = input("/*");
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    /* */",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor = expectedDoc.indexOf("/*") + 2;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("does not auto-close when already followed by '*/'", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /*/",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("/*") + 1; // between / and /
          const { getState, input } = createFullMockView(doc, cursor);

          const handled = input("*");
          assert.strictEqual(handled, false);
          assert.strictEqual(getState().doc.toString(), doc);
        });

        it("auto-closes '<!--' with '-->' outside schema when typing '-' after '<!-'", () => {
          const doc = ['<template name="Test">', "  <!-", "</template>"].join(
            "\n",
          );
          const cursor = doc.indexOf("<!-") + 3;
          const { getState, input } = createFullMockView(doc, cursor);

          const handled = input("-");
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <!---->",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor = expectedDoc.indexOf("<!---->") + 4;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("does not auto-close '/*' with ' */' when outside schema", () => {
          const doc = [
            '<template name="Test">',
            "  <system>",
            "    /",
            "  </system>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("    /") + 5;
          const { getState, input } = createFullMockView(doc, cursor);

          const handled = input("*");
          assert.strictEqual(handled, false);
          assert.strictEqual(getState().doc.toString(), doc);
        });

        it("auto-closes '<!--' with '-->' regardless of context", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    <!-",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("<!-") + 3;
          const { getState, input } = createFullMockView(doc, cursor);

          const handled = input("-");
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    <!---->",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);
        });
      });

      describe("Enter in multiline comments", () => {
        it("splits between '/**' and ' */' with well-aligned '* ' on newline", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /** */",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("/**") + 3;
          const { view, getState } = createFullMockView(doc, cursor);

          const handled = typepromptEnterCommand(view);
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "     * ",
            "     */",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          // Cursor should be at the indented middle line right after "* "
          const expectedCursor =
            expectedDoc.indexOf("     * ") + "     * ".length;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("prepends '* ' well-aligned when hitting Enter on a continuation line", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "     * Description of type",
            "     */",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor =
            doc.indexOf("Description of type") + "Description of type".length;
          const { view, getState } = createFullMockView(doc, cursor);

          const handled = typepromptEnterCommand(view);
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "     * Description of type",
            "     * ",
            "     */",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor =
            expectedDoc.indexOf("     * \n") + "     * ".length;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("splits text and prepends '* ' when hitting Enter in the middle of a line", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "     * Hello world",
            "     */",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("Hello ") + "Hello ".length;
          const { view, getState } = createFullMockView(doc, cursor);

          const handled = typepromptEnterCommand(view);
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "     * Hello",
            "     * world",
            "     */",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor =
            expectedDoc.indexOf("     * world") + "     * ".length;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("prepends '* ' well-aligned when hitting Enter after '/**' without closing '*/'", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("/**") + 3;
          const { view, getState } = createFullMockView(doc, cursor);

          const handled = typepromptEnterCommand(view);
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "     * ",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor =
            expectedDoc.indexOf("     * \n") + "     * ".length;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("moves '*/' to newline well-aligned when hitting Enter before '*/' on a line with text", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "     * Some comment */",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("*/");
          const { view, getState } = createFullMockView(doc, cursor);

          const handled = typepromptEnterCommand(view);
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "     * Some comment",
            "     */",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor =
            expectedDoc.indexOf("     */") + "     ".length;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("outdents to base indent when hitting Enter right after '*/'", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "     * Comment",
            "     */",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("*/") + 2;
          const { view, getState } = createFullMockView(doc, cursor);

          const handled = typepromptEnterCommand(view);
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "     * Comment",
            "     */",
            "    ",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor =
            expectedDoc.indexOf("    \n  </schema>") + "    ".length;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("does not insert '*' when hitting Enter after a single-line comment", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /** A support ticket to be triaged. */",
            "    interface Input {}",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("*/") + 2;
          const { view, getState } = createFullMockView(doc, cursor);

          const handled = typepromptEnterCommand(view);
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    /** A support ticket to be triaged. */",
            "    ",
            "    interface Input {}",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor =
            expectedDoc.indexOf("    \n    interface") + "    ".length;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("ensures typepromptKeymap has higher precedence than defaultKeymap", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /** */",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("/**") + 3;
          let state = EditorState.create({
            doc,
            selection: { anchor: cursor },
            extensions: [
              keymap.of([...defaultKeymap, ...historyKeymap]),
              typeprompt(),
            ],
          });

          // Check that in the resolved keymap facet, the highest-priority Enter binding is typepromptEnterCommand
          const keymaps = state.facet(keymap);
          let firstEnterBinding: ((view: any) => boolean) | null = null;
          for (const km of keymaps) {
            for (const b of km) {
              if (b.key === "Enter" && b.run && !firstEnterBinding) {
                // Ignore autocompletion acceptCompletion
                if (b.run.name !== "acceptCompletion") {
                  firstEnterBinding = b.run;
                  break;
                }
              }
            }
            if (firstEnterBinding) break;
          }
          assert.strictEqual(firstEnterBinding, typepromptEnterCommand);
        });

        it("calculates indentation for lines starting with '*/' to align stars", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /**",
            "     * line 1",
            "*/",
            "  </schema>",
            "</template>",
          ].join("\n");
          const state = EditorState.create({
            doc,
            extensions: [typeprompt()],
          });
          const cx = new IndentContext(state);
          const lineWithClose = state.doc.line(5);
          const indent = typepromptIndentCalculation(cx, lineWithClose.from);
          // Opening /** is at 4 spaces (col 4). First star is at col 5.
          // Therefore, */ must indent to 5 spaces.
          assert.strictEqual(indent, 5);
        });

        it("splits between '<!--' and '-->' with indent and outdent outside schema", () => {
          const doc = [
            '<template name="Test">',
            "  <!---->",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("<!---->") + 4;
          const { view, getState } = createFullMockView(doc, cursor);

          const handled = typepromptEnterCommand(view);
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <!--",
            "    ",
            "  -->",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor =
            expectedDoc.indexOf("  <!--\n    ") + "  <!--\n    ".length;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });
      });

      describe("typepromptBackspaceCommand", () => {
        it("undoes auto-closing '/** */' on Backspace, leaving '/*'", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /** */",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("/**") + 3;
          const { view, getState } = createFullMockView(doc, cursor);

          const handled = typepromptBackspaceCommand(view);
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    /*",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor = expectedDoc.indexOf("/*") + 2;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("undoes auto-closing '/* */' on Backspace, leaving '/'", () => {
          const doc = [
            '<template name="Test">',
            "  <schema>",
            "    /* */",
            "  </schema>",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("/*") + 2;
          const { view, getState } = createFullMockView(doc, cursor);

          const handled = typepromptBackspaceCommand(view);
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <schema>",
            "    /",
            "  </schema>",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor = expectedDoc.indexOf("/") + 1;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });

        it("undoes auto-closing '<!---->' on Backspace outside schema, leaving '<!-'", () => {
          const doc = [
            '<template name="Test">',
            "  <!---->",
            "</template>",
          ].join("\n");
          const cursor = doc.indexOf("<!---->") + 4;
          const { view, getState } = createFullMockView(doc, cursor);

          const handled = typepromptBackspaceCommand(view);
          assert.strictEqual(handled, true);

          const expectedDoc = [
            '<template name="Test">',
            "  <!-",
            "</template>",
          ].join("\n");
          assert.strictEqual(getState().doc.toString(), expectedDoc);

          const expectedCursor = expectedDoc.indexOf("<!-") + 3;
          assert.strictEqual(getState().selection.main.anchor, expectedCursor);
        });
      });
    });
  });

  describe("Full typeprompt() extension bundle", () => {
    it("creates an editor state with all extensions enabled", () => {
      const state = EditorState.create({
        doc: validTemplate,
        extensions: [
          typeprompt({
            path: "prompts/Summarize.xml",
            lint: true,
            autocomplete: true,
            highlight: true,
            autoCloseTags: true,
            indent: true,
          }),
        ],
      });

      const compState = state.field(typepromptStateField);
      assert.ok(compState);
      assert.strictEqual(compState.path, "prompts/Summarize.xml");
      assert.strictEqual(compState.compilationResult.anyErrors, false);
    });

    it("can disable indentation via config.indent = false", () => {
      const state = EditorState.create({
        doc: validTemplate,
        extensions: [
          typeprompt({
            indent: false,
          }),
        ],
      });
      assert.ok(state);
    });
  });
});
