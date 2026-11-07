import {
  compile,
  createLineFinder,
  type Lsp,
  makeTemplates,
  type ValidCompilationResult,
} from "@typeprompt/core";
import { expect } from "buckwheat";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  CompletionItemKind,
  type Diagnostic,
  type SemanticTokens,
  type TextEdit,
} from "vscode-languageserver/node.js";
import {
  computeEdits,
  computeSemanticTokens,
  fsPathToUri,
  SEMANTIC_TOKEN_TYPES,
  TypePromptLanguageExtension,
  uriToFsPath,
} from "./server.js";

describe("TypePrompt Language Server", () => {
  let tempDir: string;
  let tempDirUri: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "typeprompt-lsp-test-"));
    tempDirUri = fsPathToUri(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("converts URI to FS path and back", () => {
    const fsPath = path.resolve(tempDir, "prompts", "Translate.tp");
    const uri = fsPathToUri(fsPath);
    expect(uri.startsWith("file://")).toBe(true);
    expect(uriToFsPath(uri)).toBe(fsPath);
  });

  it("scans workspace directory, discovers config and templates, and produces diagnostics", async () => {
    const sentDiagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }> =
      [];
    const extension = new TypePromptLanguageExtension(
      (uri, diagnostics) => sentDiagnostics.push({ uri, diagnostics }),
      () => undefined,
    );

    // Write typeprompt.yml
    await fs.writeFile(
      path.join(tempDir, "typeprompt.yml"),
      "include:\n  - prompts/**/*.tp\n",
      "utf-8",
    );

    // Create prompts directory and template
    const promptsDir = path.join(tempDir, "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    await fs.writeFile(
      path.join(promptsDir, "Translate.tp"),
      `<template name="Translate">
  <schema>
    interface Input { text: string; }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user><insert val="input.text" /></user>
</template>`,
      "utf-8",
    );

    extension.setWorkspaceFolders([tempDirUri]);
    await extension.runScan();

    // Verify project discovered
    expect(extension.projects.size).toBe(1);
    const project = Array.from(extension.projects.values())[0];
    expect(project !== undefined).toBe(true);
    expect(project!.templateFiles.size).toBe(1);

    const templateFsPath = path.join(promptsDir, "Translate.tp");
    const templateUri = fsPathToUri(templateFsPath);
    const bundle = extension.getTemplateFile(templateUri);
    expect(bundle !== undefined).toBe(true);
    expect(bundle!.relativePath).toBe("prompts/Translate.tp");

    // Check diagnostics sent
    const diag = sentDiagnostics.find((d) => d.uri === templateUri);
    expect(diag !== undefined).toBe(true);
    expect(diag!.diagnostics.length).toBe(0); // valid template -> 0 errors
  });

  it("scans workspace directory with an array of include patterns", async () => {
    const sentDiagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }> =
      [];
    const extension = new TypePromptLanguageExtension(
      (uri, diagnostics) => sentDiagnostics.push({ uri, diagnostics }),
      () => undefined,
    );

    // Write typeprompt.yml with array include
    await fs.writeFile(
      path.join(tempDir, "typeprompt.yml"),
      "include:\n  - prompts/**/*.tp\n  - extra/**/*.tp\n",
      "utf-8",
    );

    const promptsDir = path.join(tempDir, "prompts");
    const extraDir = path.join(tempDir, "extra");
    await fs.mkdir(promptsDir, { recursive: true });
    await fs.mkdir(extraDir, { recursive: true });

    await fs.writeFile(
      path.join(promptsDir, "A.tp"),
      '<template name="A"><system>A</system><user>A</user></template>',
      "utf-8",
    );
    await fs.writeFile(
      path.join(extraDir, "B.tp"),
      '<template name="B"><system>B</system><user>B</user></template>',
      "utf-8",
    );

    extension.setWorkspaceFolders([tempDirUri]);
    await extension.runScan();

    expect(extension.projects.size).toBe(1);
    const project = Array.from(extension.projects.values())[0];
    expect(project?.templateFiles.size).toBe(2);
  });

  it("scans multi-namespace project files and resolves namespace references", async () => {
    const sentDiagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }> =
      [];
    const extension = new TypePromptLanguageExtension(
      (uri, diagnostics) => sentDiagnostics.push({ uri, diagnostics }),
      () => undefined,
    );

    await fs.writeFile(
      path.join(tempDir, "typeprompt.yml"),
      "include:\n  - prompts/**/*.tp\n",
      "utf-8",
    );

    const financeDir = path.join(tempDir, "prompts", "Finance");
    await fs.mkdir(financeDir, { recursive: true });

    // Namespace file
    await fs.writeFile(
      path.join(financeDir, "shared.tp"),
      `<namespace name="Finance">
  interface Item {
    id: string;
    amount: number;
  }
</namespace>`,
      "utf-8",
    );

    // Template referencing Finance namespace
    await fs.writeFile(
      path.join(financeDir, "Invoice.tp"),
      `<template name="Invoice" namespace="Finance">
  <schema>
    interface Input {
      item: shared.Item;
    }
    type Output = string;
  </schema>
  <system>You generate invoices.</system>
  <user>Invoice for <insert val="input.item.id" /></user>
</template>`,
      "utf-8",
    );

    extension.setWorkspaceFolders([tempDirUri]);
    await extension.runScan();

    expect(extension.projects.size).toBe(1);
    const project = Array.from(extension.projects.values())[0];
    expect(project?.templateFiles.size).toBe(2);

    const invoiceUri = fsPathToUri(path.join(financeDir, "Invoice.tp"));
    const diag = sentDiagnostics.find((d) => d.uri === invoiceUri);
    expect(diag !== undefined).toBe(true);
    expect(diag!.diagnostics.length).toBe(0);
  });

  it("gives precedence to open in-memory documents during scan", async () => {
    const openDocs = new Map<string, TextDocument>();
    const extension = new TypePromptLanguageExtension(
      () => {},
      (uri) => openDocs.get(uri),
    );

    await fs.writeFile(
      path.join(tempDir, "typeprompt.yml"),
      "include:\n  - prompts/**/*.tp\n",
      "utf-8",
    );

    const promptsDir = path.join(tempDir, "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    const templatePath = path.join(promptsDir, "Translate.tp");
    await fs.writeFile(templatePath, "on-disk content", "utf-8");

    const templateUri = fsPathToUri(templatePath);
    const inMemoryText = "in-memory unsaved content";
    const doc = TextDocument.create(templateUri, "typeprompt", 1, inMemoryText);
    openDocs.set(templateUri, doc);

    extension.setFileContent(templateUri, {
      content: inMemoryText,
      lineFinder: createLineFinder(inMemoryText),
      lastModified: Date.now() + 1000,
    });

    extension.setWorkspaceFolders([tempDirUri]);
    await extension.runScan();

    // Verify in-memory content was preserved and not replaced with on-disk content
    expect(extension.getFileContent(templateUri)?.content).toBe(inMemoryText);
  });

  it("garbage collects deleted files from workspace", async () => {
    const sentDiagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }> =
      [];
    const extension = new TypePromptLanguageExtension(
      (uri, diagnostics) => sentDiagnostics.push({ uri, diagnostics }),
      () => undefined,
    );

    await fs.writeFile(
      path.join(tempDir, "typeprompt.yml"),
      "include:\n  - prompts/**/*.tp\n",
      "utf-8",
    );

    const promptsDir = path.join(tempDir, "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    const templatePath = path.join(promptsDir, "Temp.tp");
    await fs.writeFile(
      templatePath,
      `<template name="Temp">
  <schema>
    interface Input {}
    type Output = string;
  </schema>
  <system>You are a helper.</system>
  <user>Hello</user>
</template>`,
      "utf-8",
    );

    extension.setWorkspaceFolders([tempDirUri]);
    await extension.runScan();

    const templateUri = fsPathToUri(templatePath);
    expect(extension.templateFiles.has(templateUri)).toBe(true);

    // Delete the file from disk
    await fs.unlink(templatePath);

    // Run garbage collection
    await extension.runGarbageCollection();

    // Verify file was removed from bundles and project
    expect(extension.templateFiles.has(templateUri)).toBe(false);
    const project = Array.from(extension.projects.values())[0];
    expect(project?.templateFiles.size).toBe(0);
    expect(project?.getTemplateFile(templateUri) === undefined).toBe(true);
  });

  it("schedules scan loop and disposes cleanly", () => {
    const extension = new TypePromptLanguageExtension(
      () => {},
      () => undefined,
    );
    extension.scheduleScanLoop(100);
    extension.dispose();
  });

  it("scans workspace directory, discovers patch-base.json, and produces validation diagnostics", async () => {
    const sentDiagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }> =
      [];
    const extension = new TypePromptLanguageExtension(
      (uri, diagnostics) => sentDiagnostics.push({ uri, diagnostics }),
      () => undefined,
    );

    // Create base templates
    const baseFiles = {
      "prompts/Translate.tp": `<template name="Translate">
  <schema>
    interface Input { text: string; }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user><insert val="input.text" /></user>
</template>`,
    };
    const baseResult = compile(baseFiles, {
      cache: null,
      patchBase: null,
    }) as ValidCompilationResult;
    const patchBaseJson = JSON.stringify(makeTemplates(baseResult), null, 2);

    // Write project files
    await fs.writeFile(
      path.join(tempDir, "typeprompt.yml"),
      "patch:\n  base: patch-base.json\n  overrides: overrides.json\ninclude:\n  - prompts/**/*.tp\n",
      "utf-8",
    );
    await fs.writeFile(
      path.join(tempDir, "patch-base.json"),
      patchBaseJson,
      "utf-8",
    );

    const promptsDir = path.join(tempDir, "prompts");
    await fs.mkdir(promptsDir, { recursive: true });

    // Write override with mismatched schema
    const translatePath = path.join(promptsDir, "Translate.tp");
    await fs.writeFile(
      translatePath,
      `<template name="Translate">
  <schema>
    interface Input { differentField: number; }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user>Hello</user>
</template>`,
      "utf-8",
    );

    extension.setWorkspaceFolders([tempDirUri]);
    await extension.runScan();

    expect(extension.projects.size).toBe(1);
    expect(extension.patchBases.size).toBe(1);
    const project = Array.from(extension.projects.values())[0]!;
    expect(project.patchBase !== null).toBe(true);

    const templateUri = fsPathToUri(translatePath);
    const diags = sentDiagnostics.filter((d) => d.uri === templateUri);
    const lastDiag = diags[diags.length - 1];
    expect(lastDiag !== undefined).toBe(true);
    expect(lastDiag!.diagnostics.length).toBe(1);
    expect(lastDiag!.diagnostics[0]!.message).toBe(
      "Schema does not match base",
    );
  });

  it("reacts to patch-base.json in-memory changes and updates diagnostics", async () => {
    const sentDiagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }> =
      [];
    const extension = new TypePromptLanguageExtension(
      (uri, diagnostics) => sentDiagnostics.push({ uri, diagnostics }),
      () => undefined,
    );

    const baseFiles = {
      "prompts/Translate.tp": `<template name="Translate">
  <schema>
    interface Input { text: string; }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user><insert val="input.text" /></user>
</template>`,
    };
    const baseResult = compile(baseFiles, {
      cache: null,
      patchBase: null,
    }) as ValidCompilationResult;
    const patchBaseJson = JSON.stringify(makeTemplates(baseResult), null, 2);

    await fs.writeFile(
      path.join(tempDir, "typeprompt.yml"),
      "patch:\n  base: patch-base.json\n  overrides: overrides.json\ninclude:\n  - prompts/**/*.tp\n",
      "utf-8",
    );
    await fs.writeFile(
      path.join(tempDir, "patch-base.json"),
      patchBaseJson,
      "utf-8",
    );

    const promptsDir = path.join(tempDir, "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    const translatePath = path.join(promptsDir, "Translate.tp");
    const translateContent = `<template name="Translate">
  <schema>
    interface Input { text: string; }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user><insert val="input.text" /></user>
</template>`;
    await fs.writeFile(translatePath, translateContent, "utf-8");

    extension.setWorkspaceFolders([tempDirUri]);
    await extension.runScan();

    const templateUri = fsPathToUri(translatePath);
    const diags1 = sentDiagnostics.filter((d) => d.uri === templateUri);
    expect(diags1[diags1.length - 1]!.diagnostics.length).toBe(0);

    // Update patch-base in memory to require count: number
    const updatedBaseFiles = {
      "prompts/Translate.tp": `<template name="Translate">
  <schema>
    interface Input { count: number; }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user>Count</user>
</template>`,
    };
    const updatedBaseResult = compile(updatedBaseFiles, {
      cache: null,
      patchBase: null,
    }) as ValidCompilationResult;
    const updatedPatchBaseJson = JSON.stringify(
      makeTemplates(updatedBaseResult),
      null,
      2,
    );

    const patchBaseUri = fsPathToUri(path.join(tempDir, "patch-base.json"));
    extension.setFileContent(patchBaseUri, {
      content: updatedPatchBaseJson,
      lineFinder: createLineFinder(updatedPatchBaseJson),
      lastModified: Date.now(),
    });

    const diags2 = sentDiagnostics.filter((d) => d.uri === templateUri);
    const lastDiag2 = diags2[diags2.length - 1]!;
    expect(lastDiag2.diagnostics.length).toBe(1);
    expect(lastDiag2.diagnostics[0]!.message).toBe(
      "Schema does not match base",
    );

    // Remove patch-base in memory (content undefined)
    extension.setFileContent(patchBaseUri, undefined);
    const diags3 = sentDiagnostics.filter((d) => d.uri === templateUri);
    const lastDiag3 = diags3[diags3.length - 1]!;
    expect(lastDiag3.diagnostics.length).toBe(0);
  });

  it("reassigns patch-base.json when project config is added dynamically", async () => {
    const sentDiagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }> =
      [];
    const extension = new TypePromptLanguageExtension(
      (uri, diagnostics) => sentDiagnostics.push({ uri, diagnostics }),
      () => undefined,
    );

    const baseFiles = {
      "prompts/Translate.tp": `<template name="Translate">
  <schema>
    interface Input { text: string; }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user><insert val="input.text" /></user>
</template>`,
    };
    const baseResult = compile(baseFiles, {
      cache: null,
      patchBase: null,
    }) as ValidCompilationResult;
    const patchBaseJson = JSON.stringify(makeTemplates(baseResult), null, 2);

    const patchBaseUri = fsPathToUri(path.join(tempDir, "patch-base.json"));
    const translateUri = fsPathToUri(
      path.join(tempDir, "prompts", "Translate.tp"),
    );
    const configUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));

    const translateContent = `<template name="Translate">
  <schema>
    interface Input { mismatch: string; }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user><insert val="input.mismatch" /></user>
</template>`;

    // Set patchBase and template file BEFORE config exists
    extension.setFileContent(patchBaseUri, {
      content: patchBaseJson,
      lineFinder: createLineFinder(patchBaseJson),
      lastModified: Date.now(),
    });
    extension.setFileContent(translateUri, {
      content: translateContent,
      lineFinder: createLineFinder(translateContent),
      lastModified: Date.now(),
    });

    expect(extension.projects.size).toBe(0);
    expect(extension.patchBases.size).toBe(1);

    // Now add typeprompt.yml
    const configContent =
      "patch:\n  base: patch-base.json\n  overrides: overrides.json\ninclude:\n  - prompts/**/*.tp\n";
    extension.setFileContent(configUri, {
      content: configContent,
      lineFinder: createLineFinder(configContent),
      lastModified: Date.now(),
    });

    expect(extension.projects.size).toBe(1);
    const project = Array.from(extension.projects.values())[0]!;
    expect(project.patchBase !== null).toBe(true);

    const diags = sentDiagnostics.filter((d) => d.uri === translateUri);
    const lastDiag = diags[diags.length - 1]!;
    expect(lastDiag.diagnostics.length).toBe(1);
    expect(lastDiag.diagnostics[0]!.message).toBe("Schema does not match base");
  });

  it("scans workspace directory and discovers typeprompt.yaml", async () => {
    const sentDiagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }> =
      [];
    const extension = new TypePromptLanguageExtension(
      (uri, diagnostics) => sentDiagnostics.push({ uri, diagnostics }),
      () => undefined,
    );

    // Write typeprompt.yaml
    await fs.writeFile(
      path.join(tempDir, "typeprompt.yaml"),
      "include:\n  - prompts/**/*.tp\n",
      "utf-8",
    );

    // Create prompts directory and template
    const promptsDir = path.join(tempDir, "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    await fs.writeFile(
      path.join(promptsDir, "Translate.tp"),
      `<template name="Translate">
  <schema>
    interface Input { text: string; }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user><insert val="input.text" /></user>
</template>`,
      "utf-8",
    );

    extension.setWorkspaceFolders([fsPathToUri(tempDir)]);
    await extension.runScan();

    expect(extension.projects.size).toBe(1);
    expect(extension.templateFiles.size).toBe(1);

    const translateUri = fsPathToUri(path.join(promptsDir, "Translate.tp"));
    const diags = sentDiagnostics.filter((d) => d.uri === translateUri);
    expect(diags.length >= 1).toBe(true);
    expect(diags[diags.length - 1]!.diagnostics.length).toBe(0);
  });

  it("prefers typeprompt.yaml over typeprompt.yml when both exist in the same directory", async () => {
    const extension = new TypePromptLanguageExtension(
      () => undefined,
      () => undefined,
    );

    // Write typeprompt.yml with include 'prompts-yml/**/*.tp'
    await fs.writeFile(
      path.join(tempDir, "typeprompt.yml"),
      "include:\n  - prompts-yml/**/*.tp\n",
      "utf-8",
    );

    // Write typeprompt.yaml with include 'prompts/**/*.tp'
    await fs.writeFile(
      path.join(tempDir, "typeprompt.yaml"),
      "include:\n  - prompts/**/*.tp\n",
      "utf-8",
    );

    // Create template inside prompts/
    const promptsDir = path.join(tempDir, "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    await fs.writeFile(
      path.join(promptsDir, "Test.tp"),
      `<template name="Test">
  <schema>
    interface Input { text: string; }
    type Output = string;
  </schema>
  <system>Test</system>
  <user><insert val="input.text" /></user>
</template>`,
      "utf-8",
    );

    extension.setWorkspaceFolders([fsPathToUri(tempDir)]);
    await extension.runScan();

    const templateUri = fsPathToUri(path.join(promptsDir, "Test.tp"));
    const match = extension.findProjectByUri(templateUri);
    expect(match !== undefined).toBe(true);
    expect(match!.project.configUri.endsWith("/typeprompt.yaml")).toBe(true);
  });

  describe("computeEdits", () => {
    function applyEdits(doc: TextDocument, edits: TextEdit[]): string {
      const sorted = [...edits].sort((a, b) => {
        const diffLine = b.range.start.line - a.range.start.line;
        if (diffLine !== 0) return diffLine;
        return b.range.start.character - a.range.start.character;
      });
      let text = doc.getText();
      for (const edit of sorted) {
        const startOffset = doc.offsetAt(edit.range.start);
        const endOffset = doc.offsetAt(edit.range.end);
        text =
          text.slice(0, startOffset) + edit.newText + text.slice(endOffset);
      }
      return text;
    }

    it("returns empty edits for identical strings", () => {
      const original = "<template>\n  <system>Hello</system>\n</template>";
      const doc = TextDocument.create(
        "file:///test.tp",
        "typeprompt",
        1,
        original,
      );
      const edits = computeEdits(doc, original);
      expect(edits.length).toBe(0);
    });

    it("computes insertion edits", () => {
      const original = "Hello World";
      const formatted = "Hello Beautiful World";
      const doc = TextDocument.create(
        "file:///test.tp",
        "typeprompt",
        1,
        original,
      );
      const edits = computeEdits(doc, formatted);
      expect(edits.length).toBe(1);
      expect(applyEdits(doc, edits)).toBe(formatted);
    });

    it("computes deletion edits", () => {
      const original = "Hello Beautiful World";
      const formatted = "Hello World";
      const doc = TextDocument.create(
        "file:///test.tp",
        "typeprompt",
        1,
        original,
      );
      const edits = computeEdits(doc, formatted);
      expect(edits.length).toBe(1);
      expect(applyEdits(doc, edits)).toBe(formatted);
    });

    it("computes replacement edits", () => {
      const original = "Hello Earth";
      const formatted = "Hello Moon";
      const doc = TextDocument.create(
        "file:///test.tp",
        "typeprompt",
        1,
        original,
      );
      const edits = computeEdits(doc, formatted);
      expect(edits.length).toBe(1);
      expect(applyEdits(doc, edits)).toBe(formatted);
    });

    it("computes complex multi-line formatting diffs cleanly", () => {
      const original =
        '<template name="Test"><schema>interface Input{text:string;}type Output=string;</schema><system>You are a helper.</system><user><insert val="input.text"/></user></template>';
      const formatted = `<template name="Test">
  <schema>
    interface Input {
      text: string;
    }
    type Output = string;
  </schema>
  <system>You are a helper.</system>
  <user><insert val="input.text" /></user>
</template>
`;
      const doc = TextDocument.create(
        "file:///test.tp",
        "typeprompt",
        1,
        original,
      );
      const edits = computeEdits(doc, formatted);
      expect(edits.length > 0).toBe(true);
      expect(applyEdits(doc, edits)).toBe(formatted);
    });
  });

  describe("formatDocument", () => {
    function applyEdits(doc: TextDocument, edits: TextEdit[]): string {
      const sorted = [...edits].sort((a, b) => {
        const diffLine = b.range.start.line - a.range.start.line;
        if (diffLine !== 0) return diffLine;
        return b.range.start.character - a.range.start.character;
      });
      let text = doc.getText();
      for (const edit of sorted) {
        const startOffset = doc.offsetAt(edit.range.start);
        const endOffset = doc.offsetAt(edit.range.end);
        text =
          text.slice(0, startOffset) + edit.newText + text.slice(endOffset);
      }
      return text;
    }

    it("formats an unformatted template file in a workspace", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      // Create workspace config
      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const ymlContent = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: ymlContent,
        lineFinder: createLineFinder(ymlContent),
        lastModified: Date.now(),
      });

      const unformattedXml = `<template name="Translate">
<schema>
interface Input{text:string;}
type Output=string;
</schema>
<system>You are a translator.</system>
<user><insert val="input.text"/></user>
</template>`;

      const promptsDir = path.join(tempDir, "prompts");
      await fs.mkdir(promptsDir, { recursive: true });
      const filePath = path.join(promptsDir, "Translate.tp");
      await fs.writeFile(filePath, unformattedXml, "utf-8");

      const fileUri = fsPathToUri(filePath);
      const doc = TextDocument.create(fileUri, "typeprompt", 1, unformattedXml);
      openDocs.set(fileUri, doc);
      extension.setFileContent(fileUri, {
        content: unformattedXml,
        lineFinder: createLineFinder(unformattedXml),
        lastModified: Date.now(),
      });

      const edits = await extension.formatDocument(fileUri);
      expect(edits.length > 0).toBe(true);

      const formattedResult = applyEdits(doc, edits);
      expect(formattedResult.includes("interface Input {\n")).toBe(true);

      // Formatting again should produce 0 edits
      const updatedDoc = TextDocument.create(
        fileUri,
        "typeprompt",
        2,
        formattedResult,
      );
      openDocs.set(fileUri, updatedDoc);
      extension.setFileContent(fileUri, {
        content: formattedResult,
        lineFinder: createLineFinder(formattedResult),
        lastModified: Date.now(),
      });
      const secondEdits = await extension.formatDocument(fileUri);
      expect(secondEdits.length).toBe(0);
    });

    it("formats open in-memory documents belonging to a workspace", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const ymlContent = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: ymlContent,
        lineFinder: createLineFinder(ymlContent),
        lastModified: Date.now(),
      });

      const unformattedXml =
        '<template name="Test"><schema>type Input = string;type Output=string;</schema><system>Hello</system><user>World</user></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.tp"));
      const doc = TextDocument.create(fileUri, "typeprompt", 1, unformattedXml);
      openDocs.set(fileUri, doc);
      extension.setFileContent(fileUri, {
        content: unformattedXml,
        lineFinder: createLineFinder(unformattedXml),
        lastModified: Date.now(),
      });

      const edits = await extension.formatDocument(fileUri);
      expect(edits).toMatch([
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
      ]);
      const formatted = applyEdits(doc, edits);
      expect(formatted).toBe(
        [
          '<template name="Test">',
          "  <schema>",
          "    type Input = string;",
          "    type Output = string;",
          "  </schema>",
          "  <system>",
          "    Hello",
          "  </system>",
          "  <user>",
          "    World",
          "  </user>",
          "</template>",
          "",
        ].join("\n"),
      );
    });

    it("returns empty edits for XML files not assigned to any workspace", async () => {
      const extension = new TypePromptLanguageExtension(
        () => {},
        () => undefined,
      );
      const unformattedXml =
        '<template name="Test"><system>Hello</system></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "other", "Unassigned.tp"));
      extension.setFileContent(fileUri, {
        content: unformattedXml,
        lineFinder: createLineFinder(unformattedXml),
        lastModified: Date.now(),
      });

      const edits = await extension.formatDocument(fileUri);
      expect(edits.length).toBe(0);
    });

    it("returns empty edits for non-XML documents", async () => {
      const extension = new TypePromptLanguageExtension(
        () => {},
        () => undefined,
      );
      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const edits = await extension.formatDocument(ymlUri);
      expect(edits.length).toBe(0);
    });

    it("returns empty edits gracefully for invalid XML documents", async () => {
      const extension = new TypePromptLanguageExtension(
        () => {},
        () => undefined,
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const ymlContent = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: ymlContent,
        lineFinder: createLineFinder(ymlContent),
        lastModified: Date.now(),
      });

      const invalidXml = "<template><unclosed>";
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Invalid.tp"));
      extension.setFileContent(fileUri, {
        content: invalidXml,
        lineFinder: createLineFinder(invalidXml),
        lastModified: Date.now(),
      });

      const edits = await extension.formatDocument(fileUri);
      expect(edits.length).toBe(0);
    });
  });

  describe("semanticTokens", () => {
    function decodeSemanticTokens(
      tokens: SemanticTokens,
      doc: TextDocument,
    ): Array<{
      text: string;
      type: string;
      line: number;
      character: number;
      length: number;
    }> {
      const result = [];
      let currentLine = 0;
      let currentChar = 0;
      for (let i = 0; i < tokens.data.length; i += 5) {
        const deltaLine = tokens.data[i]!;
        const deltaChar = tokens.data[i + 1]!;
        const length = tokens.data[i + 2]!;
        const tokenTypeIndex = tokens.data[i + 3]!;

        currentLine += deltaLine;
        if (deltaLine > 0) {
          currentChar = deltaChar;
        } else {
          currentChar += deltaChar;
        }

        const text = doc.getText({
          start: { line: currentLine, character: currentChar },
          end: { line: currentLine, character: currentChar + length },
        });

        result.push({
          text,
          type: SEMANTIC_TOKEN_TYPES[tokenTypeIndex]!,
          line: currentLine,
          character: currentChar,
          length,
        });
      }
      return result;
    }

    it("computes semantic tokens for XML tags, attributes, comments, and schemas", () => {
      const xml = `<!-- Header comment -->
<template name="Translate" namespace="Translation">
  <schema>
    /** schema comment */
    interface Input {
      text: string;
    }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user><insert val="input.text" /></user>
</template>`;
      const doc = TextDocument.create(
        "file:///Translate.tp",
        "typeprompt",
        1,
        xml,
      );
      const tokens = computeSemanticTokens(doc);
      const decoded = decodeSemanticTokens(tokens, doc);

      // Verify comment tokens
      expect(
        decoded.some(
          (t) => t.type === "comment" && t.text === "<!-- Header comment -->",
        ),
      ).toBe(true);
      expect(
        decoded.some(
          (t) => t.type === "comment" && t.text === "/** schema comment */",
        ),
      ).toBe(true);

      // Verify xml tags
      expect(
        decoded.some((t) => t.type === "type" && t.text === "template"),
      ).toBe(true);
      expect(
        decoded.some((t) => t.type === "type" && t.text === "schema"),
      ).toBe(true);
      expect(
        decoded.some((t) => t.type === "type" && t.text === "system"),
      ).toBe(true);
      expect(decoded.some((t) => t.type === "type" && t.text === "user")).toBe(
        true,
      );
      expect(
        decoded.some((t) => t.type === "type" && t.text === "insert"),
      ).toBe(true);

      // Verify attribute value strings
      expect(
        decoded.some((t) => t.type === "string" && t.text === "Translate"),
      ).toBe(true);
      expect(
        decoded.some((t) => t.type === "string" && t.text === "Translation"),
      ).toBe(true);
      expect(
        decoded.some((t) => t.type === "string" && t.text === "input.text"),
      ).toBe(true);

      // Verify schema keywords
      expect(
        decoded.some((t) => t.type === "keyword" && t.text === "interface"),
      ).toBe(true);
      expect(
        decoded.some((t) => t.type === "keyword" && t.text === "type"),
      ).toBe(true);
    });

    it("splits multi-line comments and multi-line tokens into per-line tokens", () => {
      const xml = `<!-- Multi-line
comment here -->
<template name="Test">
  <schema>
    /** Multi-line
        block comment */
    // non-jsdoc comment
    interface Input {}
  </schema>
</template>`;
      const doc = TextDocument.create("file:///Test.tp", "typeprompt", 1, xml);
      const tokens = computeSemanticTokens(doc);
      const decoded = decodeSemanticTokens(tokens, doc);

      // Check multi-line XML comment
      const xmlCommentParts = decoded.filter(
        (t) => t.type === "comment" && (t.line === 0 || t.line === 1),
      );
      expect(xmlCommentParts.length).toBe(2);
      expect(xmlCommentParts[0]?.text).toBe("<!-- Multi-line");
      expect(xmlCommentParts[1]?.text).toBe("comment here -->");

      // Check multi-line schema JSDoc comment
      const schemaCommentParts = decoded.filter(
        (t) => t.type === "comment" && (t.line === 4 || t.line === 5),
      );
      expect(schemaCommentParts.length).toBe(2);
      expect(schemaCommentParts[0]?.text).toBe("/** Multi-line");
      expect(schemaCommentParts[1]?.text).toBe("        block comment */");

      // Check non-jsdoc comment
      expect(
        decoded.some(
          (t) => t.type === "comment" && t.text === "// non-jsdoc comment",
        ),
      ).toBe(true);
    });

    it("computes semantic tokens for embedded YAML in template meta and examples", () => {
      const xml = `<template name="Test">
  <meta>
    # Model parameters
    temperature: 0.7
    stream: true
    model: "gpt-4"
  </meta>
  <examples>
    - input: "hello"
      output: 42
  </examples>
</template>`;
      const doc = TextDocument.create("file:///Test.tp", "typeprompt", 1, xml);
      const tokens = computeSemanticTokens(doc);
      const decoded = decodeSemanticTokens(tokens, doc);

      // Verify YAML comment
      expect(
        decoded.some(
          (t) => t.type === "comment" && t.text === "# Model parameters",
        ),
      ).toBe(true);

      // Verify YAML boolean keyword
      expect(
        decoded.some((t) => t.type === "keyword" && t.text === "true"),
      ).toBe(true);

      // Verify YAML numbers
      expect(decoded.some((t) => t.type === "number" && t.text === "0.7")).toBe(
        true,
      );
      expect(decoded.some((t) => t.type === "number" && t.text === "42")).toBe(
        true,
      );

      // Verify YAML strings
      expect(
        decoded.some((t) => t.type === "string" && t.text === '"gpt-4"'),
      ).toBe(true);
      expect(
        decoded.some((t) => t.type === "string" && t.text === '"hello"'),
      ).toBe(true);
    });

    it("extension.getSemanticTokens returns tokens for open documents in a workspace", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      // Configure workspace
      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const xml = '<template name="Test"><system>Hello</system></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.tp"));

      // Set via bundle without opening in editor -> returns empty
      extension.setFileContent(fileUri, {
        content: xml,
        lineFinder: createLineFinder(xml),
        lastModified: Date.now(),
      });
      expect(extension.getSemanticTokens(fileUri).data.length).toBe(0);

      // Now simulate document opened in editor
      const doc = TextDocument.create(fileUri, "typeprompt", 1, xml);
      openDocs.set(fileUri, doc);

      const openDocTokens = extension.getSemanticTokens(fileUri);
      expect(openDocTokens.data.length > 0).toBe(true);
    });

    it("extension.getSemanticTokens returns empty data for files not in a workspace", () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const xml = '<template name="Test"><system>Hello</system></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.tp"));
      const doc = TextDocument.create(fileUri, "typeprompt", 1, xml);
      openDocs.set(fileUri, doc);

      // No workspace configured, returns empty data
      expect(extension.getSemanticTokens(fileUri).data.length).toBe(0);

      // Even when set via setFileContent without workspace
      extension.setFileContent(fileUri, {
        content: xml,
        lineFinder: createLineFinder(xml),
        lastModified: Date.now(),
      });
      expect(extension.getSemanticTokens(fileUri).data.length).toBe(0);
    });

    it("extension.getSemanticTokens returns empty data for non-XML and documents without root", () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      // Non-XML
      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      expect(extension.getSemanticTokens(ymlUri).data.length).toBe(0);

      // Configure workspace
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      // XML without root
      const noRootXml = "</root>";
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "NoRoot.tp"));
      const doc = TextDocument.create(fileUri, "typeprompt", 1, noRootXml);
      openDocs.set(fileUri, doc);
      extension.setFileContent(fileUri, {
        content: noRootXml,
        lineFinder: createLineFinder(noRootXml),
        lastModified: Date.now(),
      });
      expect(extension.getSemanticTokens(fileUri).data.length).toBe(0);
    });

    it("extension.getSemanticTokens leniently parses and provides tokens for unclosed XML while typing", () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      // Configure workspace
      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const unclosedXml = "<template><unclosed>";
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Unclosed.tp"));
      const doc = TextDocument.create(fileUri, "typeprompt", 1, unclosedXml);
      openDocs.set(fileUri, doc);
      extension.setFileContent(fileUri, {
        content: unclosedXml,
        lineFinder: createLineFinder(unclosedXml),
        lastModified: Date.now(),
      });
      expect(extension.getSemanticTokens(fileUri).data.length > 0).toBe(true);
    });
  });

  describe("getCompletionItems", () => {
    it("returns completion items for child elements in a workspace template", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const xml = [
        '<template name="Test">',
        "  <schema>",
        "    type Input = {};",
        "    type Output = {};",
        "  </schema>",
        "  <system>",
        "    <",
        "  </system>",
        "  <user></user>",
        "</template>",
      ].join("\n");

      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.tp"));
      const doc = TextDocument.create(fileUri, "typeprompt", 1, xml);
      openDocs.set(fileUri, doc);
      extension.setFileContent(fileUri, {
        content: xml,
        lineFinder: createLineFinder(xml),
        lastModified: Date.now(),
      });

      const items = extension.getCompletionItems(fileUri, {
        line: 6,
        character: 5,
      });

      expect(items.length > 0).toBe(true);
      const labels = items.map((i) => i.label);
      expect(labels).toMatch(["c", "enclosed", "insert"]);
    });

    it("returns empty completions for files not in a workspace", () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const xml = '<template name="Test"><system><</system></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.tp"));
      const doc = TextDocument.create(fileUri, "typeprompt", 1, xml);
      openDocs.set(fileUri, doc);

      const items = extension.getCompletionItems(fileUri, {
        line: 0,
        character: 31,
      });
      expect(items).toMatch([]);
    });

    it("returns completion items for typeprompt.yaml when editing config", () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const yaml = "include:\n  - prompts/**/*.tp\ngen:\n  ";
      const yamlUri = fsPathToUri(path.join(tempDir, "typeprompt.yaml"));
      const doc = TextDocument.create(yamlUri, "yaml", 1, yaml);
      openDocs.set(yamlUri, doc);

      const items = extension.getCompletionItems(yamlUri, {
        line: 3,
        character: 2,
      });

      expect(items.length > 0).toBe(true);
      const labels = items.map((i) => i.label);
      expect(labels).toMatch([
        "cpp",
        "csharp",
        "dart",
        "kotlin",
        "python",
        "rust",
        "swift",
        "typescript",
      ]);
      expect(items[0]?.kind).toBe(CompletionItemKind.Property);
    });

    it("returns completion items for .typeprompt.secrets.yaml when editing secrets", () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const yaml = "apiKeys:\n  ";
      const secretsUri = fsPathToUri(
        path.join(tempDir, ".typeprompt.secrets.yaml"),
      );
      const doc = TextDocument.create(secretsUri, "yaml", 1, yaml);
      openDocs.set(secretsUri, doc);

      const items = extension.getCompletionItems(secretsUri, {
        line: 1,
        character: 2,
      });

      expect(items.length > 0).toBe(true);
      const labels = items.map((i) => i.label);
      expect(labels).toMatch([
        "openai",
        "anthropic",
        "google",
        "xai",
        "mistral",
        "vercelGateway",
      ]);
      expect(items[0]?.kind).toBe(CompletionItemKind.Property);
    });

    it("returns empty completions for unsupported files", () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const txtUri = fsPathToUri(path.join(tempDir, "notes.txt"));
      const doc = TextDocument.create(txtUri, "plaintext", 1, "hello");
      openDocs.set(txtUri, doc);

      const items = extension.getCompletionItems(txtUri, {
        line: 0,
        character: 0,
      });
      expect(items).toMatch([]);
    });

    it("returns empty completions when document is not open", () => {
      const extension = new TypePromptLanguageExtension(
        () => {},
        () => undefined,
      );

      const yamlUri = fsPathToUri(path.join(tempDir, "typeprompt.yaml"));
      const items = extension.getCompletionItems(yamlUri, {
        line: 0,
        character: 0,
      });
      expect(items).toMatch([]);
    });
  });

  describe("getDefinition", () => {
    it("jumps from shared type reference in template to definition in namespace shared.tp", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const sharedXml = `<namespace name="Main">
  type UserProfile = {
    name: string;
  };
</namespace>`;
      const sharedUri = fsPathToUri(path.join(tempDir, "prompts", "shared.tp"));
      const sharedDoc = TextDocument.create(
        sharedUri,
        "typeprompt",
        1,
        sharedXml,
      );
      openDocs.set(sharedUri, sharedDoc);
      extension.setFileContent(sharedUri, {
        content: sharedXml,
        lineFinder: createLineFinder(sharedXml),
        lastModified: Date.now(),
      });

      const templateXml = `<template name="Greet">
  <schema>
    type Input = {
      user: shared.UserProfile;
    };
    type Output = string;
  </schema>
  <system>Greeter</system>
  <user>Hello <insert val="input.user.name"/></user>
</template>`;
      const templateUri = fsPathToUri(
        path.join(tempDir, "prompts", "Greet.tp"),
      );
      const templateDoc = TextDocument.create(
        templateUri,
        "typeprompt",
        1,
        templateXml,
      );
      openDocs.set(templateUri, templateDoc);
      extension.setFileContent(templateUri, {
        content: templateXml,
        lineFinder: createLineFinder(templateXml),
        lastModified: Date.now(),
      });

      // Cursor on "UserProfile" in `shared.UserProfile` (line 3, char 22)
      const userProfileOffset = templateXml.indexOf("UserProfile");
      const pos = templateDoc.positionAt(userProfileOffset + 2);
      const definition = extension.getDefinition(templateUri, pos);

      expect(definition !== null).toBe(true);
      expect(definition!.uri).toBe(sharedUri);
      const targetText = sharedXml.slice(
        sharedDoc.offsetAt(definition!.range.start),
        sharedDoc.offsetAt(definition!.range.end),
      );
      expect(targetText).toBe("UserProfile");
    });

    it("jumps from insert val property expression to field definition", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const templateXml = `<template name="Greet">
  <schema>
    type Input = {
      text: string;
    };
    type Output = string;
  </schema>
  <system>Greeter</system>
  <user>Hello <insert val="input.text"/></user>
</template>`;
      const templateUri = fsPathToUri(
        path.join(tempDir, "prompts", "Greet.tp"),
      );
      const templateDoc = TextDocument.create(
        templateUri,
        "typeprompt",
        1,
        templateXml,
      );
      openDocs.set(templateUri, templateDoc);
      extension.setFileContent(templateUri, {
        content: templateXml,
        lineFinder: createLineFinder(templateXml),
        lastModified: Date.now(),
      });

      // Cursor on "text" in `input.text`
      const textOffset = templateXml.lastIndexOf("text");
      const pos = templateDoc.positionAt(textOffset + 1);
      const definition = extension.getDefinition(templateUri, pos);

      expect(definition !== null).toBe(true);
      expect(definition!.uri).toBe(templateUri);
      const targetText = templateXml.slice(
        templateDoc.offsetAt(definition!.range.start),
        templateDoc.offsetAt(definition!.range.end),
      );
      expect(targetText).toBe("text");
      // The target definition should be the field name declaration in schema
      expect(templateDoc.offsetAt(definition!.range.start)).toBe(
        templateXml.indexOf("text: string"),
      );
    });

    it("returns definition location when cursor is on the definition itself", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const templateXml = `<template name="Greet">
  <schema>
    type Status = "active" | "inactive";
    type Input = { status: Status; };
    type Output = string;
  </schema>
  <system>Greeter</system>
  <user>Status: <insert val="input.status"/></user>
</template>`;
      const templateUri = fsPathToUri(
        path.join(tempDir, "prompts", "Greet.tp"),
      );
      const templateDoc = TextDocument.create(
        templateUri,
        "typeprompt",
        1,
        templateXml,
      );
      openDocs.set(templateUri, templateDoc);
      extension.setFileContent(templateUri, {
        content: templateXml,
        lineFinder: createLineFinder(templateXml),
        lastModified: Date.now(),
      });

      // Cursor on definition of `Status` in `type Status = ...`
      const statusDefOffset = templateXml.indexOf("Status");
      const pos = templateDoc.positionAt(statusDefOffset + 1);
      const definition = extension.getDefinition(templateUri, pos);

      expect(definition !== null).toBe(true);
      expect(definition!.uri).toBe(templateUri);
      expect(templateDoc.offsetAt(definition!.range.start)).toBe(
        statusDefOffset,
      );
    });

    it("jumps from variant case attribute to schema union literal definition", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const templateXml = `<template name="Support">
  <schema>
    type Input = {
      variant: "quick" | "full";
      summary: string;
    };
    type Output = string;
  </schema>
  <user>Ticket: <insert val="input.summary"/></user>
  <variant case="quick">
    <system>Quick</system>
  </variant>
  <variant case="full">
    <system>Full</system>
  </variant>
</template>`;
      const templateUri = fsPathToUri(
        path.join(tempDir, "prompts", "Support.tp"),
      );
      const templateDoc = TextDocument.create(
        templateUri,
        "typeprompt",
        1,
        templateXml,
      );
      openDocs.set(templateUri, templateDoc);
      extension.setFileContent(templateUri, {
        content: templateXml,
        lineFinder: createLineFinder(templateXml),
        lastModified: Date.now(),
      });

      // Cursor on "quick" inside `<variant case="quick">`
      const caseOffset = templateXml.indexOf('case="quick"') + 6;
      const pos = templateDoc.positionAt(caseOffset);
      const definition = extension.getDefinition(templateUri, pos);

      expect(definition !== null).toBe(true);
      expect(definition!.uri).toBe(templateUri);
      // Definition should be `"quick"` in schema (without quotes)
      const schemaQuickOffset = templateXml.indexOf('"quick"') + 1;
      expect(templateDoc.offsetAt(definition!.range.start)).toBe(
        schemaQuickOffset,
      );
    });

    it("jumps from switch on case attribute to schema definition", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const templateXml = `<template name="Doc">
  <schema>
    type Tone = "formal" | "casual";
    type Input = {
      tone: Tone;
    };
    type Output = string;
  </schema>
  <snippet name="style" switch="input.tone">
    <on case="formal">Formal</on>
    <on case="casual">Casual</on>
  </snippet>
  <system>Doc</system>
  <user><insert snippet="style"/></user>
</template>`;
      const templateUri = fsPathToUri(path.join(tempDir, "prompts", "Doc.tp"));
      const templateDoc = TextDocument.create(
        templateUri,
        "typeprompt",
        1,
        templateXml,
      );
      openDocs.set(templateUri, templateDoc);
      extension.setFileContent(templateUri, {
        content: templateXml,
        lineFinder: createLineFinder(templateXml),
        lastModified: Date.now(),
      });

      // Cursor on "formal" in `<on case="formal">`
      const caseOffset = templateXml.indexOf('case="formal"') + 6;
      const pos = templateDoc.positionAt(caseOffset);
      const definition = extension.getDefinition(templateUri, pos);

      expect(definition !== null).toBe(true);
      expect(definition!.uri).toBe(templateUri);
      const schemaFormalOffset = templateXml.indexOf('"formal"') + 1;
      expect(templateDoc.offsetAt(definition!.range.start)).toBe(
        schemaFormalOffset,
      );
    });

    it("returns null for non-symbol positions or files not in workspace", () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const xml = '<template name="Test"><system>Hello</system></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.tp"));
      const doc = TextDocument.create(fileUri, "typeprompt", 1, xml);
      openDocs.set(fileUri, doc);

      const def = extension.getDefinition(fileUri, { line: 0, character: 0 });
      expect(def).toBe(null);
    });
  });

  describe("getReferences", () => {
    it("finds all references to a type across files including declaration", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const sharedXml = `<namespace name="Main">
  type User = {
    name: string;
  };
</namespace>`;
      const sharedUri = fsPathToUri(path.join(tempDir, "prompts", "shared.tp"));
      const sharedDoc = TextDocument.create(
        sharedUri,
        "typeprompt",
        1,
        sharedXml,
      );
      openDocs.set(sharedUri, sharedDoc);
      extension.setFileContent(sharedUri, {
        content: sharedXml,
        lineFinder: createLineFinder(sharedXml),
        lastModified: Date.now(),
      });

      const templateXml = `<template name="Greet">
  <schema>
    type Input = {
      user: shared.User;
    };
    type Output = string;
  </schema>
  <system>Greeter</system>
  <user>Hello <insert val="input.user.name"/></user>
</template>`;
      const templateUri = fsPathToUri(
        path.join(tempDir, "prompts", "Greet.tp"),
      );
      const templateDoc = TextDocument.create(
        templateUri,
        "typeprompt",
        1,
        templateXml,
      );
      openDocs.set(templateUri, templateDoc);
      extension.setFileContent(templateUri, {
        content: templateXml,
        lineFinder: createLineFinder(templateXml),
        lastModified: Date.now(),
      });

      // Find references from `User` declaration in shared.tp
      const userDefOffset = sharedXml.indexOf("User");
      const pos = sharedDoc.positionAt(userDefOffset + 1);
      const refs = extension.getReferences(sharedUri, pos, {
        includeDeclaration: true,
      });

      expect(refs !== null).toBe(true);
      expect(refs!.length).toBe(2);
      expect(refs!.some((r) => r.uri === sharedUri)).toBe(true);
      expect(refs!.some((r) => r.uri === templateUri)).toBe(true);
    });

    it("finds all references excluding declaration when includeDeclaration is false", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const sharedXml = `<namespace name="Main">
  type User = {
    name: string;
  };
</namespace>`;
      const sharedUri = fsPathToUri(path.join(tempDir, "prompts", "shared.tp"));
      const sharedDoc = TextDocument.create(
        sharedUri,
        "typeprompt",
        1,
        sharedXml,
      );
      openDocs.set(sharedUri, sharedDoc);
      extension.setFileContent(sharedUri, {
        content: sharedXml,
        lineFinder: createLineFinder(sharedXml),
        lastModified: Date.now(),
      });

      const templateXml = `<template name="Greet">
  <schema>
    type Input = {
      user: shared.User;
    };
    type Output = string;
  </schema>
  <system>Greeter</system>
  <user>Hello</user>
</template>`;
      const templateUri = fsPathToUri(
        path.join(tempDir, "prompts", "Greet.tp"),
      );
      const templateDoc = TextDocument.create(
        templateUri,
        "typeprompt",
        1,
        templateXml,
      );
      openDocs.set(templateUri, templateDoc);
      extension.setFileContent(templateUri, {
        content: templateXml,
        lineFinder: createLineFinder(templateXml),
        lastModified: Date.now(),
      });

      // Find references from `shared.User` reference in Greet.tp with includeDeclaration: false
      const userRefOffset = templateXml.indexOf("User");
      const pos = templateDoc.positionAt(userRefOffset + 1);
      const refs = extension.getReferences(templateUri, pos, {
        includeDeclaration: false,
      });

      expect(refs !== null).toBe(true);
      expect(refs!.length).toBe(1);
      expect(refs![0]!.uri).toBe(templateUri);
    });

    it("finds references to a field when invoked from insert val expression", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const templateXml = `<template name="Greet">
  <schema>
    type Input = {
      title: string;
    };
    type Output = string;
  </schema>
  <system>Greeter: <insert val="input.title"/></system>
  <user>Hello: <insert val="input.title"/></user>
</template>`;
      const templateUri = fsPathToUri(
        path.join(tempDir, "prompts", "Greet.tp"),
      );
      const templateDoc = TextDocument.create(
        templateUri,
        "typeprompt",
        1,
        templateXml,
      );
      openDocs.set(templateUri, templateDoc);
      extension.setFileContent(templateUri, {
        content: templateXml,
        lineFinder: createLineFinder(templateXml),
        lastModified: Date.now(),
      });

      // Cursor on first insert val "title"
      const titleOffset = templateXml.indexOf("input.title") + "input.".length;
      const pos = templateDoc.positionAt(titleOffset);
      const refs = extension.getReferences(templateUri, pos, {
        includeDeclaration: true,
      });

      expect(refs !== null).toBe(true);
      // Declaration + 2 references = 3 locations
      expect(refs!.length).toBe(3);
    });

    it("returns empty array for unknown symbol position in workspace", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const xml = '<template name="Test"><system>Hello</system></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.tp"));
      const doc = TextDocument.create(fileUri, "typeprompt", 1, xml);
      openDocs.set(fileUri, doc);
      extension.setFileContent(fileUri, {
        content: xml,
        lineFinder: createLineFinder(xml),
        lastModified: Date.now(),
      });

      const refs = extension.getReferences(fileUri, {
        line: 0,
        character: 0,
      });
      expect(refs).toMatch([]);
    });

    it("returns null for files not in workspace", () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const xml = '<template name="Test"><system>Hello</system></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.tp"));
      const doc = TextDocument.create(fileUri, "typeprompt", 1, xml);
      openDocs.set(fileUri, doc);

      const refs = extension.getReferences(fileUri, {
        line: 0,
        character: 0,
      });
      expect(refs).toBe(null);
    });
  });

  describe("renameSymbol", () => {
    it("renames a shared type across namespace and template files", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const sharedXml = `<namespace name="Main">
  type OldType = {
    field: string;
  };
</namespace>`;
      const sharedUri = fsPathToUri(path.join(tempDir, "prompts", "shared.tp"));
      const sharedDoc = TextDocument.create(
        sharedUri,
        "typeprompt",
        1,
        sharedXml,
      );
      openDocs.set(sharedUri, sharedDoc);
      extension.setFileContent(sharedUri, {
        content: sharedXml,
        lineFinder: createLineFinder(sharedXml),
        lastModified: Date.now(),
      });

      const templateXml = `<template name="Greet">
  <schema>
    type Input = {
      data: shared.OldType;
    };
    type Output = string;
  </schema>
  <system>Greeter</system>
  <user>Hello</user>
</template>`;
      const templateUri = fsPathToUri(
        path.join(tempDir, "prompts", "Greet.tp"),
      );
      const templateDoc = TextDocument.create(
        templateUri,
        "typeprompt",
        1,
        templateXml,
      );
      openDocs.set(templateUri, templateDoc);
      extension.setFileContent(templateUri, {
        content: templateXml,
        lineFinder: createLineFinder(templateXml),
        lastModified: Date.now(),
      });

      // Trigger rename on `OldType` in shared.tp
      const oldTypeOffset = sharedXml.indexOf("OldType");
      const pos = sharedDoc.positionAt(oldTypeOffset + 1);
      const edit = extension.renameSymbol(sharedUri, pos, "NewType");

      expect(edit !== null).toBe(true);
      expect(edit!.changes !== undefined).toBe(true);
      const changes = edit!.changes!;

      expect(changes[sharedUri] !== undefined).toBe(true);
      expect(changes[sharedUri]!.length).toBe(1);
      expect(changes[sharedUri]![0]!.newText).toBe("NewType");

      expect(changes[templateUri] !== undefined).toBe(true);
      expect(changes[templateUri]!.length).toBe(1);
      expect(changes[templateUri]![0]!.newText).toBe("NewType");

      // Verify that applying the edits produces the expected text
      const newSharedContent = TextDocument.applyEdits(
        sharedDoc,
        changes[sharedUri]!,
      );
      expect(newSharedContent.includes("type NewType = {")).toBe(true);

      const newTemplateContent = TextDocument.applyEdits(
        templateDoc,
        changes[templateUri]!,
      );
      expect(newTemplateContent.includes("data: shared.NewType;")).toBe(true);
    });

    it("renames a field in an interface across schema and body insert expressions", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const templateXml = `<template name="Greet">
  <schema>
    type Input = {
      greeting: string;
    };
    type Output = string;
  </schema>
  <system>Greeting: <insert val="input.greeting"/></system>
  <user>Message: <insert val="input.greeting"/></user>
</template>`;
      const templateUri = fsPathToUri(
        path.join(tempDir, "prompts", "Greet.tp"),
      );
      const templateDoc = TextDocument.create(
        templateUri,
        "typeprompt",
        1,
        templateXml,
      );
      openDocs.set(templateUri, templateDoc);
      extension.setFileContent(templateUri, {
        content: templateXml,
        lineFinder: createLineFinder(templateXml),
        lastModified: Date.now(),
      });

      // Trigger rename on `greeting` field in schema
      const greetingOffset = templateXml.indexOf("greeting: string;");
      const pos = templateDoc.positionAt(greetingOffset + 1);
      const edit = extension.renameSymbol(templateUri, pos, "welcomeMsg");

      expect(edit !== null).toBe(true);
      const changes = edit!.changes!;
      expect(changes[templateUri] !== undefined).toBe(true);
      // Field definition + 2 insert val references = 3 edits
      expect(changes[templateUri]!.length).toBe(3);

      const newContent = TextDocument.applyEdits(
        templateDoc,
        changes[templateUri]!,
      );
      expect(newContent.includes("welcomeMsg: string;")).toBe(true);
      expect(
        newContent.includes('Greeting: <insert val="input.welcomeMsg"/>'),
      ).toBe(true);
      expect(
        newContent.includes('Message: <insert val="input.welcomeMsg"/>'),
      ).toBe(true);
    });

    it("returns null for non-symbol position", () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const xml = '<template name="Test"><system>Hello</system></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.tp"));
      const doc = TextDocument.create(fileUri, "typeprompt", 1, xml);
      openDocs.set(fileUri, doc);

      const edit = extension.renameSymbol(
        fileUri,
        { line: 0, character: 0 },
        "NewName",
      );
      expect(edit).toBe(null);
    });
  });

  describe("WireCompilationResult notification and query", () => {
    it("notifies listener with WireCompilationResult when project compiles", async () => {
      const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "typeprompt-wire-test-"),
      );
      const tempDirUri = fsPathToUri(tempDir);

      const receivedNotifications: Lsp.WireProjects[] = [];

      const extension = new TypePromptLanguageExtension(
        () => {},
        () => undefined,
        (results) => {
          receivedNotifications.push(results);
        },
      );

      await fs.writeFile(
        path.join(tempDir, "typeprompt.yml"),
        "include:\n  - prompts/**/*.tp\n",
        "utf-8",
      );

      const promptsDir = path.join(tempDir, "prompts");
      await fs.mkdir(promptsDir, { recursive: true });
      await fs.writeFile(
        path.join(promptsDir, "Translate.tp"),
        `<template name="Translate">
  <schema>
    interface Input { text: string; }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user><insert val="input.text" /></user>
</template>`,
        "utf-8",
      );

      await fs.writeFile(
        path.join(promptsDir, "TranslatePlay.tp"),
        `<playground for="Translate">
  <model>
    model: "openai/gpt-4o"
  </model>
  <samples>
    - input:
        text: "hello"
  </samples>
</playground>`,
        "utf-8",
      );

      extension.addWorkspaceFolder(tempDirUri);
      await extension.runScan();

      expect(receivedNotifications.length > 0).toBe(true);
      const last = receivedNotifications[receivedNotifications.length - 1]!;
      const projectPaths = Object.keys(last.projects);
      expect(projectPaths.length).toBe(1);
      const project = last.projects[projectPaths[0]!];
      expect(project !== null).toBe(true);
      expect(project?.folderUri).toBe(projectPaths[0]);
      expect(project?.compilationResult.anyErrors).toBe(false);
      expect(project?.secrets.kind).toBe("success");
      if (project?.secrets.kind === "success") {
        expect(project.secrets.secrets).toMatch({});
      }

      const playFile =
        project?.compilationResult.sourceFiles["prompts/TranslatePlay.tp"];
      expect(playFile?.entity?.kind).toBe("playground");

      const templateKeys = Object.keys(
        project?.compilationResult.templates ?? {},
      );
      expect(templateKeys.length).toBe(1);
      const template = project?.compilationResult.templates[templateKeys[0]!];
      expect(template !== undefined).toBe(true);
      expect(template?.name).toBe("Translate");
      expect(template?.isValid).toBe(true);
    });

    it("scans workspace directory, discovers .typeprompt.secrets.yaml, and stores secrets in Project", async () => {
      const sentDiagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }> =
        [];
      const extension = new TypePromptLanguageExtension(
        (uri, diagnostics) => sentDiagnostics.push({ uri, diagnostics }),
        () => undefined,
      );

      await fs.writeFile(
        path.join(tempDir, "typeprompt.yaml"),
        "include:\n  - prompts/**/*.tp\n",
        "utf-8",
      );

      await fs.writeFile(
        path.join(tempDir, ".typeprompt.secrets.yaml"),
        "apiKeys:\n  openai: sk-test-12345\n  anthropic: sk-ant-67890\n",
        "utf-8",
      );

      extension.addWorkspaceFolder(tempDirUri);
      await extension.runScan();

      expect(extension.projects.size).toBe(1);
      const project = Array.from(extension.projects.values())[0]!;
      expect(project.secrets.apiKeys?.openai).toBe("sk-test-12345");
      expect(project.secrets.apiKeys?.anthropic).toBe("sk-ant-67890");

      // Now update secrets in-memory
      const secretsUri = fsPathToUri(
        path.join(tempDir, ".typeprompt.secrets.yaml"),
      );
      const updatedSecrets = "apiKeys:\n  openai: sk-new-key\n";
      extension.setFileContent(secretsUri, {
        content: updatedSecrets,
        lineFinder: createLineFinder(updatedSecrets),
        lastModified: Date.now(),
      });

      expect(project.secrets.apiKeys?.openai).toBe("sk-new-key");
      expect(project.secrets.apiKeys?.anthropic).toBe(undefined);

      // Now delete secrets
      extension.setFileContent(secretsUri, undefined);
      expect(project.secrets.apiKeys).toBe(undefined);
    });

    it("produces diagnostics for invalid .typeprompt.secrets.yaml and clears project.secrets", async () => {
      const sentDiagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }> =
        [];
      const extension = new TypePromptLanguageExtension(
        (uri, diagnostics) => sentDiagnostics.push({ uri, diagnostics }),
        () => undefined,
      );

      const configUri = fsPathToUri(path.join(tempDir, "typeprompt.yaml"));
      const configContent = "include:\n  - prompts/**/*.tp\n";
      extension.setFileContent(configUri, {
        content: configContent,
        lineFinder: createLineFinder(configContent),
        lastModified: Date.now(),
      });

      const secretsUri = fsPathToUri(
        path.join(tempDir, ".typeprompt.secrets.yaml"),
      );
      const invalidSecrets = "apiKeys:\n  openai:\n    nested: bad\n";
      extension.setFileContent(secretsUri, {
        content: invalidSecrets,
        lineFinder: createLineFinder(invalidSecrets),
        lastModified: Date.now(),
      });

      const project = extension.projects.get(configUri)!;
      expect(project.secrets.apiKeys).toBe(undefined);

      const secretsDiags = sentDiagnostics.filter((d) => d.uri === secretsUri);
      expect(secretsDiags.length > 0).toBe(true);
      const lastDiag = secretsDiags[secretsDiags.length - 1]!;
      expect(lastDiag.diagnostics.length > 0).toBe(true);
    });
  });
});
