import { createLineFinder } from "@typeprompt/core";
import { strictEqual } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic } from "vscode-languageserver/node.js";
import {
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
    strictEqual(uri.startsWith("file://"), true);
    strictEqual(uriToFsPath(uri), fsPath);
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
    strictEqual(extension.workspaces.size, 1);
    const workspace = Array.from(extension.workspaces.values())[0];
    strictEqual(workspace !== undefined, true);
    strictEqual(workspace!.xmls.size, 1);

    const templateFsPath = path.join(promptsDir, "Translate.xml");
    const templateUri = fsPathToUri(templateFsPath);
    const bundle = extension.getXmlBundle(templateUri);
    strictEqual(bundle !== undefined, true);
    strictEqual(bundle!.relativePath, "prompts/Translate.xml");

    // Check diagnostics sent
    const diag = sentDiagnostics.find((d) => d.uri === templateUri);
    strictEqual(diag !== undefined, true);
    strictEqual(diag!.diagnostics.length, 0); // valid template -> 0 errors
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

    strictEqual(extension.workspaces.size, 1);
    const workspace = Array.from(extension.workspaces.values())[0];
    strictEqual(workspace?.xmls.size, 2);

    const invoiceUri = fsPathToUri(path.join(financeDir, "Invoice.xml"));
    const diag = sentDiagnostics.find((d) => d.uri === invoiceUri);
    strictEqual(diag !== undefined, true);
    strictEqual(diag!.diagnostics.length, 0);
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
    strictEqual(extension.getFileContent(templateUri)?.content, inMemoryText);
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
    strictEqual(extension.xmlBundles.has(templateUri), true);

    // Delete the file from disk
    await fs.unlink(templatePath);

    // Run garbage collection
    await extension.runGarbageCollection();

    // Verify file was removed from bundles and workspace
    strictEqual(extension.xmlBundles.has(templateUri), false);
    const workspace = Array.from(extension.workspaces.values())[0];
    strictEqual(workspace?.xmls.has(templateUri), false);
  });

  it("schedules scan loop and disposes cleanly", () => {
    const extension = new TypePromptLanguageExtension(
      () => {},
      () => undefined,
    );
    extension.scheduleScanLoop(100);
    extension.dispose();
  });
});
