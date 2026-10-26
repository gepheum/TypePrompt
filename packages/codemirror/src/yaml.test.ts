import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { CONFIG } from "@typeprompt/core";
import { describe, it } from "mocha";
import assert from "node:assert";
import {
  yaml,
  yamlAutocomplete,
  yamlCompletionSource,
  yamlLinter,
  yamlLinting,
} from "./index.js";

describe("YAML CodeMirror Extension", () => {
  describe("yamlCompletionSource", () => {
    it("suggests missing top-level config fields", () => {
      const doc = "include:\n  - prompts/*.tp\n";
      const pos = doc.length;
      const state = EditorState.create({
        doc,
        selection: { anchor: pos },
      });

      const context = new CompletionContext(state, pos, true);
      const source = yamlCompletionSource(CONFIG);
      const result = source(context);

      assert.ok(result && !("then" in result));
      assert.strictEqual(result.from, pos);
      assert.strictEqual(result.to, pos);
      const labels = result.options.map((o) => o.label);
      assert.ok(labels.includes("gen"));
      assert.ok(labels.includes("patch"));
    });

    it("suggests generators under gen:", () => {
      const doc = "include:\n  - prompts/*.tp\ngen:\n  ";
      const pos = doc.length;
      const state = EditorState.create({
        doc,
        selection: { anchor: pos },
      });

      const context = new CompletionContext(state, pos, true);
      const source = yamlCompletionSource(CONFIG);
      const result = source(context);

      assert.ok(result && !("then" in result));
      const labels = result.options.map((o) => o.label);
      assert.ok(labels.includes("typescript"));
      assert.ok(labels.includes("python"));
      assert.ok(labels.includes("rust"));
    });

    it("suggests matching fields when partially typed with colon", () => {
      const doc = "include:\n  - prompts/*.tp\ngen:\n  typ:";
      const pos = doc.indexOf("typ") + 2;
      const state = EditorState.create({
        doc,
        selection: { anchor: pos },
      });

      const context = new CompletionContext(state, pos, true);
      const source = yamlCompletionSource(CONFIG);
      const result = source(context);

      assert.ok(result && !("then" in result));
      assert.strictEqual(result.from, doc.indexOf("typ"));
      assert.strictEqual(result.to, doc.indexOf("typ") + 3);
      const labels = result.options.map((o) => o.label);
      assert.ok(labels.includes("typescript"));
    });

    it("returns null when no suggestions exist at cursor", () => {
      const doc = "include:\n  - prompts/*.tp\n";
      const pos = doc.indexOf("prompts") + 2;
      const state = EditorState.create({
        doc,
        selection: { anchor: pos },
      });

      const context = new CompletionContext(state, pos, true);
      const source = yamlCompletionSource(CONFIG);
      const result = source(context);

      assert.strictEqual(result, null);
    });
  });

  describe("yamlLinter", () => {
    it("reports no errors for valid YAML config", () => {
      const doc =
        "include:\n  - prompts/*.tp\ngen:\n  typescript:\n    file: generated.ts\n";
      const state = EditorState.create({ doc });
      const mockView = { state } as unknown as EditorView;

      const linterFn = yamlLinter(CONFIG);
      const diagnostics = linterFn(mockView);

      assert.strictEqual(diagnostics.length, 0);
    });

    it("reports error for unknown property without action suggestions", () => {
      const doc = "unknownField: 123\n";
      const state = EditorState.create({ doc });
      const mockView = { state } as unknown as EditorView;

      const linterFn = yamlLinter(CONFIG);
      const diagnostics = linterFn(mockView);

      assert.ok(diagnostics.length > 0);
      const diag = diagnostics[0];
      assert.strictEqual(diag.severity, "error");
      assert.strictEqual(diag.source, "YAML");
      assert.ok(diag.message.includes("unknownField"));
      assert.strictEqual(diag.actions, undefined);
    });

    it("reports error for YAML syntax error", () => {
      const doc = "include: [\nunclosed bracket";
      const state = EditorState.create({ doc });
      const mockView = { state } as unknown as EditorView;

      const linterFn = yamlLinter(CONFIG);
      const diagnostics = linterFn(mockView);

      assert.ok(diagnostics.length > 0);
      assert.strictEqual(diagnostics[0].severity, "error");
    });
  });

  describe("yaml extension bundle", () => {
    it("supports individual yamlAutocomplete and yamlLinting extensions", () => {
      const state = EditorState.create({
        doc: "include:\n  - prompts/*.tp\n",
        extensions: [yamlAutocomplete(CONFIG), yamlLinting(CONFIG)],
      });
      assert.ok(state);
    });

    it("creates state and editor view with yaml(CONFIG)", () => {
      const doc = "include:\n  - prompts/*.tp\n";
      const extensions = yaml(CONFIG, { path: "typeprompt.yaml" });
      const state = EditorState.create({
        doc,
        extensions,
      });

      assert.ok(state);
      assert.strictEqual(state.doc.toString(), doc);
    });
  });
});
