import {
  parseXmlDocument,
  type ElementNode,
  type XmlDocument,
} from "@typeprompt/core";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  Hover,
  InitializeParams,
  InitializeResult,
  MarkupKind,
  ProposedFeatures,
  TextDocumentPositionParams,
  TextDocuments,
  TextDocumentSyncKind,
  type _Connection,
} from "vscode-languageserver/node.js";

export interface ServerOptions {
  connection?: _Connection;
}

export interface LanguageServerInstance {
  connection: _Connection;
  documents: TextDocuments<TextDocument>;
  listen: () => void;
}

export function validateTypePromptDocument(
  textDocument: TextDocument,
): Diagnostic[] {
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  const parsed = parseXmlDocument(text);

  if (parsed.kind === "error") {
    for (const err of parsed.errors) {
      const start = textDocument.positionAt(err.span.start);
      const end = textDocument.positionAt(err.span.end);
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: { start, end },
        message: err.message,
        source: "typeprompt",
      });
    }
    return diagnostics;
  }

  // If XML parsed cleanly, perform basic structure checks
  validateXmlDocument(parsed, textDocument, diagnostics);

  return diagnostics;
}

function validateXmlDocument(
  doc: XmlDocument,
  textDocument: TextDocument,
  diagnostics: Diagnostic[],
): void {
  const root = doc.root;
  const validRootTags = new Set([
    "prompt",
    "template",
    "tool",
    "namespace",
    "meta",
    "schema",
  ]);

  if (!validRootTags.has(root.tag.text)) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: {
        start: textDocument.positionAt(root.tag.start),
        end: textDocument.positionAt(root.tag.end),
      },
      message: `Unknown top-level tag '<${root.tag.text}>'. Expected one of: ${Array.from(validRootTags).join(", ")}.`,
      source: "typeprompt",
    });
  }

  // Validate children
  for (const child of root.children) {
    if (child.kind === "element") {
      validateChildElement(child, textDocument, diagnostics);
    }
  }
}

function validateChildElement(
  element: ElementNode,
  textDocument: TextDocument,
  diagnostics: Diagnostic[],
): void {
  const validChildTags = new Set([
    "template",
    "tool",
    "namespace",
    "meta",
    "schema",
    "system",
    "user",
    "assistant",
    "c:if",
    "c:switch",
    "c:case",
    "c:default",
  ]);

  if (
    !validChildTags.has(element.tag.text) &&
    !element.tag.text.startsWith("c:")
  ) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: {
        start: textDocument.positionAt(element.tag.start),
        end: textDocument.positionAt(element.tag.end),
      },
      message: `Unrecognized element '<${element.tag.text}>'.`,
      source: "typeprompt",
    });
  }

  for (const child of element.children) {
    if (child.kind === "element") {
      validateChildElement(child, textDocument, diagnostics);
    }
  }
}

export function createLanguageServer(
  options: ServerOptions = {},
): LanguageServerInstance {
  const connection =
    options.connection ?? createConnection(ProposedFeatures.all);
  const documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument,
  );

  connection.onInitialize((_params: InitializeParams): InitializeResult => {
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: ["<", " ", '"', "{", "$", "."],
        },
        hoverProvider: true,
      },
      serverInfo: {
        name: "typeprompt-language-server",
        version: "0.1.0",
      },
    };
  });

  documents.onDidChangeContent((change) => {
    const diagnostics = validateTypePromptDocument(change.document);
    connection.sendDiagnostics({
      uri: change.document.uri,
      diagnostics,
    });
  });

  connection.onCompletion((_params) => {
    return [
      { label: "prompt", detail: "TypePrompt root tag" },
      { label: "template", detail: "TypePrompt template definition" },
      { label: "tool", detail: "TypePrompt tool definition" },
      { label: "namespace", detail: "TypePrompt namespace definition" },
      { label: "schema", detail: "TypePrompt schema definition" },
      { label: "c:if", detail: "Conditional rendering block" },
      { label: "c:switch", detail: "Pattern matching block" },
      { label: "c:case", detail: "Switch case branch" },
      { label: "c:default", detail: "Switch default branch" },
    ];
  });

  connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const offset = doc.offsetAt(params.position);
    const text = doc.getText();
    const wordMatch = text
      .slice(Math.max(0, offset - 20), offset + 20)
      .match(/[a-zA-Z0-9_:-]+/);

    if (wordMatch) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**TypePrompt**: \`${wordMatch[0]}\``,
        },
      };
    }
    return null;
  });

  documents.listen(connection);

  return {
    connection,
    documents,
    listen: (): void => {
      connection.listen();
    },
  };
}
