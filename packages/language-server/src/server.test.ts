import { strictEqual } from "node:assert";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node.js";
import {
  TypePromptLanguageExtension,
  validateTypePromptDocument,
} from "./server.js";

describe("TypePrompt Language Extension & Workspaces", () => {
  it("registers workspaces from typeprompt.yml, assigns templates, and caches compilation", () => {
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
    const templateContent = `<template name="Translate">
  <schema>
    interface Input {
      text: string;
    }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user>Hello</user>
</template>`;

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
    strictEqual(workspace?.compilationResult !== null, true);
    strictEqual(workspace?.compilationResult?.anyErrors, false);

    const lastDiag = sentDiagnostics.find((d) => d.uri === templateUri);
    strictEqual(lastDiag !== undefined, true);
    strictEqual(lastDiag!.diagnostics.length, 0);

    // Verify cache is preserved and reused on recompile
    const firstResult = workspace?.compilationResult;
    workspace?.compile();
    strictEqual(workspace?.compilationResult !== null, true);
    strictEqual(
      workspace?.compilationResult?.sourceFiles[templateUri] ===
        firstResult?.sourceFiles[templateUri],
      true,
    );
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

  it("reports compiler errors across files in a workspace and clears when resolved", () => {
    const sentDiagnostics: { uri: string; diagnostics: Diagnostic[] }[] = [];
    const docMap = new Map<string, TextDocument>();

    const extension = new TypePromptLanguageExtension(
      (uri, diagnostics) => {
        sentDiagnostics.push({ uri, diagnostics });
      },
      (uri) => docMap.get(uri),
    );

    const configUri = "file:///project/typeprompt.yml";
    extension.setFileContent(configUri, {
      content: `include: prompts/*.xml\ngen:\n  typescript:\n    file: src/prompts.ts`,
      lastModified: Date.now(),
    });

    const templateUri = "file:///project/prompts/Invoice.xml";
    // Template references nonexistent namespace "Finance"
    extension.setFileContent(templateUri, {
      content: `<template name="Invoice" namespace="Finance">
  <schema>
    interface Input {
      orderId: string;
    }
    type Output = string;
  </schema>
  <system>Generate invoice</system>
  <user>Order 123</user>
</template>`,
      lastModified: Date.now(),
    });

    const diag1 = sentDiagnostics.filter((d) => d.uri === templateUri).pop();
    strictEqual(diag1 !== undefined, true);
    strictEqual(diag1!.diagnostics.length > 0, true);
    strictEqual(diag1!.diagnostics[0]?.severity, DiagnosticSeverity.Error);
    strictEqual(
      diag1!.diagnostics.some((d) =>
        d.message.includes("Namespace 'Finance' not found"),
      ),
      true,
    );

    // Now add Finance namespace file to workspace
    const namespaceUri = "file:///project/prompts/Finance.xml";
    extension.setFileContent(namespaceUri, {
      content: `<namespace name="Finance">
  interface Item { id: string; }
</namespace>`,
      lastModified: Date.now(),
    });

    const diag2 = sentDiagnostics.filter((d) => d.uri === templateUri).pop();
    strictEqual(diag2 !== undefined, true);
    strictEqual(diag2!.diagnostics.length, 0);
  });

  it("validates valid prompt templates without errors", () => {
    const doc = TextDocument.create(
      "file:///test.prompt.xml",
      "xml",
      1,
      `<template name="Translate">
  <schema>
    interface Input {
      text: string;
    }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user>Hello</user>
</template>`,
    );

    const diagnostics = validateTypePromptDocument(doc);
    strictEqual(diagnostics.length, 0);
  });

  it("reports XML syntax errors as diagnostics", () => {
    const doc = TextDocument.create(
      "file:///test_invalid.prompt.xml",
      "xml",
      1,
      `<template name="Translate">
  <system>Unclosed system tag
</template>`,
    );

    const diagnostics = validateTypePromptDocument(doc);
    strictEqual(diagnostics.length > 0, true);
    strictEqual(diagnostics[0]?.severity, DiagnosticSeverity.Error);
  });
});
