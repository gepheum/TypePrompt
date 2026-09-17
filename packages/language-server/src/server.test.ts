import { strictEqual } from "node:assert";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DiagnosticSeverity } from "vscode-languageserver/node.js";
import { validateTypePromptDocument } from "./server.js";

describe("Language Server Document Validation", () => {
  it("validates valid prompt templates without errors", () => {
    const doc = TextDocument.create(
      "file:///test.prompt.xml",
      "xml",
      1,
      `<prompt id="testPrompt">
  <template id="Translate">
    <system>You are a translator.</system>
    <user>Hello</user>
  </template>
</prompt>`,
    );

    const diagnostics = validateTypePromptDocument(doc);
    strictEqual(diagnostics.length, 0);
  });

  it("reports XML syntax errors as diagnostics", () => {
    const doc = TextDocument.create(
      "file:///test_invalid.prompt.xml",
      "xml",
      1,
      `<prompt id="test">
  <template id="Translate">
    <system>Unclosed system tag
  </template>
</prompt>`,
    );

    const diagnostics = validateTypePromptDocument(doc);
    strictEqual(diagnostics.length > 0, true);
    strictEqual(diagnostics[0]?.severity, DiagnosticSeverity.Error);
  });

  it("reports unknown top-level tags as warnings", () => {
    const doc = TextDocument.create(
      "file:///test_unknown.prompt.xml",
      "xml",
      1,
      `<invalidTag id="foo">
</invalidTag>`,
    );

    const diagnostics = validateTypePromptDocument(doc);
    strictEqual(diagnostics.length, 1);
    strictEqual(diagnostics[0]?.severity, DiagnosticSeverity.Warning);
    strictEqual(
      diagnostics[0]?.message.includes("Unknown top-level tag"),
      true,
    );
  });
});
