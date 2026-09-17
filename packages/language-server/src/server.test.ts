import { strictEqual } from "node:assert";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node.js";
import {
  TypePromptLanguageExtension,
  validateTypePromptDocument,
} from "./server.js";

describe("TypePrompt Language Extension & Workspaces", () => {
  it("registers workspaces from typeprompt.yml and assigns templates", () => {
    const sentDiagnostics: { uri: string; diagnostics: Diagnostic[] }[] = [];
    const docMap = new Map<string, TextDocument>();

    const extension = new TypePromptLanguageExtension(
      (uri, diagnostics) => {
        sentDiagnostics.push({ uri, diagnostics });
      },
      (uri) => docMap.get(uri),
    );

    const configUri = "file:///project/typeprompt.yml";
    const configContent = `
include: prompts/*.xml
gen:
  typescript:
    file: src/gen/prompts.ts
`;

    extension.setFileContent(configUri, {
      content: configContent,
      lastModified: Date.now(),
    });

    strictEqual(extension.workspaces.size, 1);
    const workspace = extension.workspaces.get(configUri);
    strictEqual(workspace !== undefined, true);
    strictEqual(workspace?.config.include, "prompts/*.xml");

    // Add matching template
    const templateUri = "file:///project/prompts/Translate.xml";
    const templateContent = `<prompt id="test">
  <template id="Translate">
    <system>You are a translator.</system>
    <user>Hello</user>
  </template>
</prompt>`;

    extension.setFileContent(templateUri, {
      content: templateContent,
      lastModified: Date.now(),
    });

    strictEqual(extension.templateBundles.size, 1);
    const bundle = extension.templateBundles.get(templateUri);
    strictEqual(bundle !== undefined, true);
    strictEqual(bundle?.templateWorkspace?.workspace, workspace);
    strictEqual(
      bundle?.templateWorkspace?.relativePath,
      "prompts/Translate.xml",
    );
    strictEqual(workspace?.templates.has(templateUri), true);
  });

  it("reports syntax error diagnostics for invalid typeprompt.yml", () => {
    const sentDiagnostics: { uri: string; diagnostics: Diagnostic[] }[] = [];
    const extension = new TypePromptLanguageExtension(
      (uri, diagnostics) => {
        sentDiagnostics.push({ uri, diagnostics });
      },
      () => undefined,
    );

    const configUri = "file:///project/typeprompt.yml";
    const invalidConfig = `
include: prompts/*.xml
gen:
  typescript:
    file: invalid_ext.txt
`;

    extension.setFileContent(configUri, {
      content: invalidConfig,
      lastModified: Date.now(),
    });

    strictEqual(extension.workspaces.size, 0);
    const lastDiag = sentDiagnostics.find((d) => d.uri === configUri);
    strictEqual(lastDiag !== undefined, true);
    strictEqual(lastDiag!.diagnostics.length > 0, true);
    strictEqual(lastDiag!.diagnostics[0]?.severity, DiagnosticSeverity.Error);
  });

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
});
