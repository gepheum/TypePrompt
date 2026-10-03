import { createLineFinder } from "@typeprompt/core";
import { expect } from "buckwheat";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  Diagnostic,
  SemanticTokens,
  TextEdit,
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
<template name="Translate">
  <schema output-format="text">
    /** schema comment */
    interface Input {
      text: string;
    }
    type Output = string;
  </schema>
  <system>You are a translator.</system>
  <user><insert val="input.text" /></user>
</template>`;
      const doc = TextDocument.create("file:///Translate.xml", "xml", 1, xml);
      const tokens = computeSemanticTokens(doc);
      const decoded = decodeSemanticTokens(tokens, doc);

      // Verify comment token
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
        decoded.some((t) => t.type === "string" && t.text === "text"),
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
    interface Input {}
  </schema>
</template>`;
      const doc = TextDocument.create("file:///Test.xml", "xml", 1, xml);
      const tokens = computeSemanticTokens(doc);
      const decoded = decodeSemanticTokens(tokens, doc);

      // Check multi-line XML comment
      const xmlCommentParts = decoded.filter(
        (t) => t.type === "comment" && (t.line === 0 || t.line === 1),
      );
      expect(xmlCommentParts.length).toBe(2);
      expect(xmlCommentParts[0]?.text).toBe("<!-- Multi-line");
      expect(xmlCommentParts[1]?.text).toBe("comment here -->");

      // Check multi-line schema block comment
      const schemaCommentParts = decoded.filter(
        (t) => t.type === "comment" && (t.line === 4 || t.line === 5),
      );
      expect(schemaCommentParts.length).toBe(2);
      expect(schemaCommentParts[0]?.text).toBe("/** Multi-line");
      expect(schemaCommentParts[1]?.text).toBe("        block comment */");
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
      const doc = TextDocument.create("file:///Test.xml", "xml", 1, xml);
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

    it("extension.getSemanticTokens returns tokens for open documents and bundle files in a workspace", async () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      // Configure workspace
      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include: prompts/**/*.xml\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const xml = '<template name="Test"><system>Hello</system></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.xml"));

      // Set via bundle
      extension.setFileContent(fileUri, {
        content: xml,
        lineFinder: createLineFinder(xml),
        lastModified: Date.now(),
      });

      const bundleTokens = extension.getSemanticTokens(fileUri);
      expect(bundleTokens.data.length > 0).toBe(true);

      // Now simulate document opened in editor
      const doc = TextDocument.create(fileUri, "xml", 1, xml);
      openDocs.set(fileUri, doc);

      const openDocTokens = extension.getSemanticTokens(fileUri);
      expect(openDocTokens.data.length > 0).toBe(true);
      expect(openDocTokens.data).toMatch(bundleTokens.data);
    });

    it("extension.getSemanticTokens returns empty data for files not in a workspace", () => {
      const openDocs = new Map<string, TextDocument>();
      const extension = new TypePromptLanguageExtension(
        () => {},
        (uri) => openDocs.get(uri),
      );

      const xml = '<template name="Test"><system>Hello</system></template>';
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "Test.xml"));
      const doc = TextDocument.create(fileUri, "xml", 1, xml);
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
      const extension = new TypePromptLanguageExtension(
        () => {},
        () => undefined,
      );

      // Non-XML
      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      expect(extension.getSemanticTokens(ymlUri).data.length).toBe(0);

      // Configure workspace
      const yml = "include: prompts/**/*.xml\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      // XML without root
      const noRootXml = "</root>";
      const fileUri = fsPathToUri(path.join(tempDir, "prompts", "NoRoot.xml"));
      extension.setFileContent(fileUri, {
        content: noRootXml,
        lineFinder: createLineFinder(noRootXml),
        lastModified: Date.now(),
      });
      expect(extension.getSemanticTokens(fileUri).data.length).toBe(0);
    });

    it("extension.getSemanticTokens leniently parses and provides tokens for unclosed XML while typing", () => {
      const extension = new TypePromptLanguageExtension(
        () => {},
        () => undefined,
      );

      // Configure workspace
      const ymlUri = fsPathToUri(path.join(tempDir, "typeprompt.yml"));
      const yml = "include: prompts/**/*.xml\n";
      extension.setFileContent(ymlUri, {
        content: yml,
        lineFinder: createLineFinder(yml),
        lastModified: Date.now(),
      });

      const unclosedXml = "<template><unclosed>";
      const fileUri = fsPathToUri(
        path.join(tempDir, "prompts", "Unclosed.xml"),
      );
      extension.setFileContent(fileUri, {
        content: unclosedXml,
        lineFinder: createLineFinder(unclosedXml),
        lastModified: Date.now(),
      });
      expect(extension.getSemanticTokens(fileUri).data.length > 0).toBe(true);
    });
  });
});
