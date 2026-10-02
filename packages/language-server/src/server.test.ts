import { createLineFinder } from "@typeprompt/core";
import { expect } from "buckwheat";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, TextEdit } from "vscode-languageserver/node.js";
import {
  computeEdits,
  fsPathToUri,
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
    const fsPath = path.resolve(tempDir, "prompts", "Translate.xml");
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
      "include: prompts/**/*.xml\n",
      "utf-8",
    );

    // Create prompts directory and template
    const promptsDir = path.join(tempDir, "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    await fs.writeFile(
      path.join(promptsDir, "Translate.xml"),
      `<template name="Translate">
  <schema output-format="text">
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

    // Verify workspace discovered
    expect(extension.workspaces.size).toBe(1);
    const workspace = Array.from(extension.workspaces.values())[0];
    expect(workspace !== undefined).toBe(true);
    expect(workspace!.xmls.size).toBe(1);

    const templateFsPath = path.join(promptsDir, "Translate.xml");
    const templateUri = fsPathToUri(templateFsPath);
    const bundle = extension.getXmlBundle(templateUri);
    expect(bundle !== undefined).toBe(true);
    expect(bundle!.relativePath).toBe("prompts/Translate.xml");

    // Check diagnostics sent
    const diag = sentDiagnostics.find((d) => d.uri === templateUri);
    expect(diag !== undefined).toBe(true);
    expect(diag!.diagnostics.length).toBe(0); // valid template -> 0 errors
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
      "include: prompts/**/*.xml\n",
      "utf-8",
    );

    const financeDir = path.join(tempDir, "prompts", "Finance");
    await fs.mkdir(financeDir, { recursive: true });

    // Namespace file
    await fs.writeFile(
      path.join(financeDir, "shared.xml"),
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
      path.join(financeDir, "Invoice.xml"),
      `<template name="Invoice" namespace="Finance">
  <schema output-format="text">
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

    expect(extension.workspaces.size).toBe(1);
    const workspace = Array.from(extension.workspaces.values())[0];
    expect(workspace?.xmls.size).toBe(2);

    const invoiceUri = fsPathToUri(path.join(financeDir, "Invoice.xml"));
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
      "include: prompts/**/*.xml\n",
      "utf-8",
    );

    const promptsDir = path.join(tempDir, "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    const templatePath = path.join(promptsDir, "Translate.xml");
    await fs.writeFile(templatePath, "on-disk content", "utf-8");

    const templateUri = fsPathToUri(templatePath);
    const inMemoryText = "in-memory unsaved content";
    const doc = TextDocument.create(templateUri, "xml", 1, inMemoryText);
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
      "include: prompts/**/*.xml\n",
      "utf-8",
    );

    const promptsDir = path.join(tempDir, "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    const templatePath = path.join(promptsDir, "Temp.xml");
    await fs.writeFile(
      templatePath,
      `<template name="Temp">
  <schema output-format="text">
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
    expect(extension.xmlBundles.has(templateUri)).toBe(true);

    // Delete the file from disk
    await fs.unlink(templatePath);

    // Run garbage collection
    await extension.runGarbageCollection();

    // Verify file was removed from bundles and workspace
    expect(extension.xmlBundles.has(templateUri)).toBe(false);
    const workspace = Array.from(extension.workspaces.values())[0];
    expect(workspace?.xmls.has(templateUri)).toBe(false);
  });

  it("schedules scan loop and disposes cleanly", () => {
    const extension = new TypePromptLanguageExtension(
      () => {},
      () => undefined,
    );
    extension.scheduleScanLoop(100);
    extension.dispose();
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
      const doc = TextDocument.create("file:///test.xml", "xml", 1, original);
      const edits = computeEdits(doc, original);
      expect(edits.length).toBe(0);
    });

    it("computes insertion edits", () => {
      const original = "Hello World";
      const formatted = "Hello Beautiful World";
      const doc = TextDocument.create("file:///test.xml", "xml", 1, original);
      const edits = computeEdits(doc, formatted);
      expect(edits.length).toBe(1);
      expect(applyEdits(doc, edits)).toBe(formatted);
    });

    it("computes deletion edits", () => {
      const original = "Hello Beautiful World";
      const formatted = "Hello World";
      const doc = TextDocument.create("file:///test.xml", "xml", 1, original);
      const edits = computeEdits(doc, formatted);
      expect(edits.length).toBe(1);
      expect(applyEdits(doc, edits)).toBe(formatted);
    });

    it("computes replacement edits", () => {
      const original = "Hello Earth";
      const formatted = "Hello Moon";
      const doc = TextDocument.create("file:///test.xml", "xml", 1, original);
      const edits = computeEdits(doc, formatted);
      expect(edits.length).toBe(1);
      expect(applyEdits(doc, edits)).toBe(formatted);
    });

    it("computes complex multi-line formatting diffs cleanly", () => {
      const original =
        '<template name="Test"><schema output-format="text">interface Input{text:string;}type Output=string;</schema><system>You are a helper.</system><user><insert val="input.text"/></user></template>';
      const formatted = `<template name="Test">
  <schema output-format="text">
    interface Input {
      text: string;
    }
    type Output = string;
  </schema>
  <system>You are a helper.</system>
  <user><insert val="input.text" /></user>
</template>
`;
      const doc = TextDocument.create("file:///test.xml", "xml", 1, original);
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
      const extension = new TypePromptLanguageExtension(
        () => {},
        () => undefined,
      );

      // Create workspace config
      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const ymlContent = "include: prompts/**/*.xml\n";
      extension.setFileContent(ymlUri, {
        content: ymlContent,
        lineFinder: createLineFinder(ymlContent),
        lastModified: Date.now(),
      });

      const unformattedXml = `<template name="Translate">
<schema output-format="text">
interface Input{text:string;}
type Output=string;
</schema>
<system>You are a translator.</system>
<user><insert val="input.text"/></user>
</template>`;

      const promptsDir = path.join(tempDir, "prompts");
      await fs.mkdir(promptsDir, { recursive: true });
      const filePath = path.join(promptsDir, "Translate.xml");
      await fs.writeFile(filePath, unformattedXml, "utf-8");

      const fileUri = fsPathToUri(filePath);
      extension.setFileContent(fileUri, {
        content: unformattedXml,
        lineFinder: createLineFinder(unformattedXml),
        lastModified: Date.now(),
      });

      const edits = await extension.formatDocument(fileUri);
      expect(edits.length > 0).toBe(true);

      const doc = TextDocument.create(fileUri, "xml", 1, unformattedXml);
      const formattedResult = applyEdits(doc, edits);
      expect(formattedResult.includes("interface Input {\n")).toBe(true);

      // Formatting again should produce 0 edits
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
      const ymlContent = "include: prompts/**/*.xml\n";
      extension.setFileContent(ymlUri, {
        content: ymlContent,
        lineFinder: createLineFinder(ymlContent),
        lastModified: Date.now(),
      });

      const unformattedXml =
        '<template name="Test"><system>Hello</system></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.xml"));
      const doc = TextDocument.create(fileUri, "xml", 1, unformattedXml);
      openDocs.set(fileUri, doc);
      extension.setFileContent(fileUri, {
        content: unformattedXml,
        lineFinder: createLineFinder(unformattedXml),
        lastModified: Date.now(),
      });

      const edits = await extension.formatDocument(fileUri);
      expect(edits.length > 0).toBe(true);
      const formatted = applyEdits(doc, edits);
      expect(formatted.includes('<template name="Test">')).toBe(true);
      expect(formatted.includes("<system>")).toBe(true);
      expect(formatted.includes("Hello")).toBe(true);
    });

    it("returns empty edits for XML files not assigned to any workspace", async () => {
      const extension = new TypePromptLanguageExtension(
        () => {},
        () => undefined,
      );
      const unformattedXml =
        '<template name="Test"><system>Hello</system></template>';
      const fileUri = fsPathToUri(
        path.join(tempDir, "other", "Unassigned.xml"),
      );
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
      const ymlContent = "include: prompts/**/*.xml\n";
      extension.setFileContent(ymlUri, {
        content: ymlContent,
        lineFinder: createLineFinder(ymlContent),
        lastModified: Date.now(),
      });

      const invalidXml = "<template><unclosed>";
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Invalid.xml"));
      extension.setFileContent(fileUri, {
        content: invalidXml,
        lineFinder: createLineFinder(invalidXml),
        lastModified: Date.now(),
      });

      const edits = await extension.formatDocument(fileUri);
      expect(edits.length).toBe(0);
    });
  });
});
