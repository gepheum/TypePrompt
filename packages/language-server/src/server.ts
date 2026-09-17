import {
  parseConfigYaml,
  parseXmlDocument,
  type Config,
  type ElementNode,
  type XmlDocument,
} from "@typeprompt/core";
import { minimatch } from "minimatch";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type _Connection,
} from "vscode-languageserver/node.js";

export type FileType = "typeprompt.yml" | "*.xml" | null;

export interface FileContent {
  content: string;
  lastModified: number;
}

export function getFileType(uri: string): FileType {
  if (
    uri.endsWith("typeprompt.yml") ||
    uri.endsWith("typeprompt.yaml") ||
    uri.endsWith("/typeprompt.yml") ||
    uri.endsWith("/typeprompt.yaml")
  ) {
    return "typeprompt.yml";
  }
  if (
    uri.endsWith(".xml") ||
    uri.endsWith(".prompt") ||
    uri.endsWith(".prompt.xml")
  ) {
    return "*.xml";
  }
  return null;
}

export interface TypePromptConfigBundle {
  config: Config;
  yamlContent: FileContent;
}

export interface TemplateWorkspace {
  workspace: Workspace;
  relativePath: string;
}

export interface TemplateBundle {
  uri: string;
  content: FileContent;
  parsed?: XmlDocument;
  templateWorkspace?: TemplateWorkspace;
}

export class Workspace {
  public readonly templates = new Map<string, TemplateBundle>();

  constructor(
    public readonly folderUri: string,
    public configBundle: TypePromptConfigBundle,
  ) {}

  public get config(): Config {
    return this.configBundle.config;
  }

  public matchesInclude(relativePath: string): boolean {
    const pattern = this.config.include || "prompts/*.xml";
    return minimatch(relativePath, pattern);
  }

  public getRelativePath(fileUri: string): string | null {
    if (!fileUri.startsWith(this.folderUri)) {
      return null;
    }
    const rel = fileUri.slice(this.folderUri.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }

  public static addTemplate(
    template: TemplateBundle,
    workspace: Workspace,
    relativePath: string,
  ): void {
    template.templateWorkspace = { workspace, relativePath };
    workspace.templates.set(template.uri, template);
  }

  public static removeTemplate(template: TemplateBundle): void {
    if (template.templateWorkspace) {
      template.templateWorkspace.workspace.templates.delete(template.uri);
      template.templateWorkspace = undefined;
    }
  }
}

export class TypePromptLanguageExtension {
  public readonly workspaces = new Map<string, Workspace>();
  public readonly templateBundles = new Map<string, TemplateBundle>();
  private readonly uriToTimeout = new Map<string, NodeJS.Timeout>();
  private reassignTemplatesTimeout: NodeJS.Timeout | undefined;

  constructor(
    private readonly sendDiagnostics: (
      uri: string,
      diagnostics: Diagnostic[],
    ) => void,
    private readonly getDocument: (uri: string) => TextDocument | undefined,
  ) {}

  public setFileContent(uri: string, content: FileContent | undefined): void {
    const fileType = getFileType(uri);
    if (fileType && !content) {
      this.sendDiagnostics(uri, []);
    }

    switch (fileType) {
      case "typeprompt.yml": {
        if (content) {
          const configResult = parseConfigYaml(content.content);
          if (configResult.kind === "success") {
            const configBundle: TypePromptConfigBundle = {
              config: configResult.config,
              yamlContent: content,
            };
            const oldWorkspace = this.workspaces.get(uri);
            if (oldWorkspace) {
              oldWorkspace.configBundle = configBundle;
              this.reassignTemplatesToWorkspaces();
            } else {
              const folderUri = uri.replace(/typeprompt\.(yml|yaml)$/, "");
              const workspace = new Workspace(folderUri, configBundle);
              this.workspaces.set(uri, workspace);
              this.reassignTemplatesToWorkspaces();
            }
            this.sendDiagnostics(uri, []);
          } else {
            const doc = this.getDocument(uri);
            const diagnostics = configResult.errors.map((err): Diagnostic => {
              const start = doc
                ? doc.positionAt(err.span.start)
                : { line: 0, character: 0 };
              const end = doc
                ? doc.positionAt(err.span.end)
                : { line: 0, character: 0 };
              return {
                severity: DiagnosticSeverity.Error,
                range: { start, end },
                message: err.message,
                source: "typeprompt",
              };
            });
            this.sendDiagnostics(uri, diagnostics);
          }
        } else {
          if (this.workspaces.delete(uri)) {
            this.reassignTemplatesToWorkspaces();
          }
        }
        break;
      }
      case "*.xml": {
        const timeout = this.uriToTimeout.get(uri);
        if (timeout) {
          clearTimeout(timeout);
          this.uriToTimeout.delete(uri);
        }
        const existingBundle = this.templateBundles.get(uri);
        if (existingBundle) {
          Workspace.removeTemplate(existingBundle);
          this.templateBundles.delete(uri);
        }
        if (content) {
          const templateBundle: TemplateBundle = {
            uri,
            content,
          };
          const templateWorkspace = this.findTemplateWorkspace(templateBundle);
          this.templateBundles.set(uri, templateBundle);
          if (templateWorkspace) {
            Workspace.addTemplate(
              templateBundle,
              templateWorkspace.workspace,
              templateWorkspace.relativePath,
            );
          }
          const diagnostics = this.validateTemplate(templateBundle);
          this.sendDiagnostics(uri, diagnostics);
        }
        break;
      }
      default: {
        const _: null = fileType;
        break;
      }
    }
  }

  public getFileContent(uri: string): FileContent | undefined {
    const fileType = getFileType(uri);
    switch (fileType) {
      case "*.xml":
        return this.templateBundles.get(uri)?.content;
      case "typeprompt.yml":
        return this.workspaces.get(uri)?.configBundle.yamlContent;
      case null:
        return undefined;
      default: {
        const _: never = fileType;
        return undefined;
      }
    }
  }

  public scheduleSetFileContent(uri: string, document: TextDocument): void {
    const oldTimeout = this.uriToTimeout.get(uri);
    if (oldTimeout) {
      clearTimeout(oldTimeout);
    }
    const delayMilliseconds = 100;
    const timeout = setTimeout(() => {
      this.uriToTimeout.delete(uri);
      try {
        this.setFileContent(uri, {
          content: document.getText(),
          lastModified: Date.now(),
        });
      } catch (error) {
        console.error(`Error setting file content for ${uri}:`, error);
      }
    }, delayMilliseconds);
    this.uriToTimeout.set(uri, timeout);
  }

  public findTemplateWorkspace(
    template: TemplateBundle,
  ): { workspace: Workspace; relativePath: string } | undefined {
    let bestMatch: { workspace: Workspace; relativePath: string } | undefined;
    for (const workspace of this.workspaces.values()) {
      const relPath = workspace.getRelativePath(template.uri);
      if (relPath !== null && workspace.matchesInclude(relPath)) {
        if (
          !bestMatch ||
          workspace.folderUri.length > bestMatch.workspace.folderUri.length
        ) {
          bestMatch = { workspace, relativePath: relPath };
        }
      }
    }
    return bestMatch;
  }

  public getTemplateBundle(uri: string): TemplateBundle | undefined {
    return this.templateBundles.get(uri);
  }

  private reassignTemplatesToWorkspaces(): void {
    if (this.reassignTemplatesTimeout) {
      return;
    }
    this.reassignTemplatesTimeout = setTimeout(() => {
      this.reassignTemplatesTimeout = undefined;
      for (const templateBundle of this.templateBundles.values()) {
        Workspace.removeTemplate(templateBundle);
        const match = this.findTemplateWorkspace(templateBundle);
        if (match) {
          Workspace.addTemplate(
            templateBundle,
            match.workspace,
            match.relativePath,
          );
        }
      }
    }, 100);
  }

  public validateTemplate(template: TemplateBundle): Diagnostic[] {
    const text = template.content.content;
    const doc = this.getDocument(template.uri);
    const diagnostics: Diagnostic[] = [];

    const parsed = parseXmlDocument(text);
    if (parsed.kind === "error") {
      for (const err of parsed.errors) {
        const start = doc
          ? doc.positionAt(err.span.start)
          : { line: 0, character: 0 };
        const end = doc
          ? doc.positionAt(err.span.end)
          : { line: 0, character: 0 };
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start, end },
          message: err.message,
          source: "typeprompt",
        });
      }
      return diagnostics;
    }

    template.parsed = parsed;
    validateXmlDocument(parsed, doc, diagnostics);
    return diagnostics;
  }
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

  validateXmlDocument(parsed, textDocument, diagnostics);

  return diagnostics;
}

function validateXmlDocument(
  doc: XmlDocument,
  textDocument: TextDocument | undefined,
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
    const start = textDocument
      ? textDocument.positionAt(root.tag.start)
      : { line: 0, character: 0 };
    const end = textDocument
      ? textDocument.positionAt(root.tag.end)
      : { line: 0, character: 0 };
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: { start, end },
      message: `Unknown top-level tag '<${root.tag.text}>'. Expected one of: ${Array.from(validRootTags).join(", ")}.`,
      source: "typeprompt",
    });
  }

  for (const child of root.children) {
    if (child.kind === "element") {
      validateChildElement(child, textDocument, diagnostics);
    }
  }
}

function validateChildElement(
  element: ElementNode,
  textDocument: TextDocument | undefined,
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
    const start = textDocument
      ? textDocument.positionAt(element.tag.start)
      : { line: 0, character: 0 };
    const end = textDocument
      ? textDocument.positionAt(element.tag.end)
      : { line: 0, character: 0 };
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: { start, end },
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

export interface ServerOptions {
  connection?: _Connection;
}

export interface LanguageServerInstance {
  connection: _Connection;
  documents: TextDocuments<TextDocument>;
  extension: TypePromptLanguageExtension;
  listen: () => void;
}

export function createLanguageServer(
  options: ServerOptions = {},
): LanguageServerInstance {
  const connection =
    options.connection ?? createConnection(ProposedFeatures.all);
  const documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument,
  );

  const extension = new TypePromptLanguageExtension(
    (uri, diagnostics) => connection.sendDiagnostics({ uri, diagnostics }),
    (uri) => documents.get(uri),
  );

  connection.onInitialize((_params: InitializeParams): InitializeResult => {
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
      },
      serverInfo: {
        name: "typeprompt-language-server",
        version: "0.1.0",
      },
    };
  });

  documents.onDidChangeContent((change) => {
    extension.setFileContent(change.document.uri, {
      content: change.document.getText(),
      lastModified: Date.now(),
    });
  });

  documents.onDidClose((event) => {
    extension.setFileContent(event.document.uri, undefined);
  });

  documents.listen(connection);

  return {
    connection,
    documents,
    extension,
    listen: (): void => {
      connection.listen();
    },
  };
}
