import {
  compile,
  parseConfigYaml,
  type CompilationResult,
  type Config,
  type InternalError,
} from "@typeprompt/core";
import { minimatch } from "minimatch";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  InitializeParams,
  InitializeResult,
  Position,
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
  if (uri === "typeprompt.yml" || uri.endsWith("/typeprompt.yml")) {
    return "typeprompt.yml";
  } else if (uri.endsWith(".xml")) {
    return "*.xml";
  } else {
    return null;
  }
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
  templateWorkspace?: TemplateWorkspace;
}

// Use LineFinder?
export function offsetToPosition(offset: number, content: string): Position {
  let line = 0;
  let character = 0;
  const max = Math.min(Math.max(0, offset), content.length);
  for (let i = 0; i < max; i++) {
    if (content[i] === "\n") {
      line++;
      character = 0;
    } else {
      character++;
    }
  }
  return { line, character };
}

export function internalErrorToDiagnostic(
  err: InternalError,
  severity: DiagnosticSeverity,
  doc: TextDocument | undefined,
  content?: string,
): Diagnostic {
  let start: Position;
  let end: Position;

  if (doc) {
    start = doc.positionAt(err.span.start);
    end = doc.positionAt(err.span.end);
  } else if (content !== undefined) {
    start = offsetToPosition(err.span.start, content);
    end = offsetToPosition(err.span.end, content);
  } else {
    start = { line: 0, character: 0 };
    end = { line: 0, character: 0 };
  }

  let message = err.message;
  if (err.hint) {
    message += ` (${err.hint})`;
  }
  if (err.suggestions && err.suggestions.length > 0) {
    message += ` Did you mean: ${err.suggestions.join(", ")}?`;
  }

  return {
    severity,
    range: { start, end },
    message,
    source: "typeprompt",
  };
}

export class Workspace {
  public readonly templates = new Map<string, TemplateBundle>();
  public compilationResult: CompilationResult | null = null;

  constructor(
    public readonly folderUri: string,
    public configBundle: TypePromptConfigBundle,
  ) { }

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

  public compile(): CompilationResult {
    const pathToContent: { [path: string]: string } = {};
    for (const [uri, template] of this.templates) {
      pathToContent[uri] = template.content.content;
    }
    this.compilationResult = compile(pathToContent, {
      cache: this.compilationResult,
    });
    return this.compilationResult;
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

  constructor(
    private readonly sendDiagnostics: (
      uri: string,
      diagnostics: Diagnostic[],
    ) => void,
    private readonly getDocument: (uri: string) => TextDocument | undefined,
  ) { }

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
            } else {
              const folderUri = uri.replace(/typeprompt\.(yml|yaml)$/, "");
              const workspace = new Workspace(folderUri, configBundle);
              this.workspaces.set(uri, workspace);
            }
            this.sendDiagnostics(uri, []);
            this.reassignTemplatesToWorkspaces();
          } else {
            const doc = this.getDocument(uri);
            const diagnostics = configResult.errors.map((err): Diagnostic => {
              const start = doc
                ? doc.positionAt(err.span.start)
                : offsetToPosition(err.span.start, content.content);
              const end = doc
                ? doc.positionAt(err.span.end)
                : offsetToPosition(err.span.end, content.content);
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

        if (content) {
          let templateBundle = this.templateBundles.get(uri);
          const oldWorkspace = templateBundle?.templateWorkspace?.workspace;

          if (templateBundle) {
            templateBundle.content = content;
          } else {
            templateBundle = { uri, content };
            this.templateBundles.set(uri, templateBundle);
          }

          const match = this.findTemplateWorkspace(templateBundle);
          if (match) {
            if (
              templateBundle.templateWorkspace?.workspace !== match.workspace
            ) {
              Workspace.removeTemplate(templateBundle);
              Workspace.addTemplate(
                templateBundle,
                match.workspace,
                match.relativePath,
              );
              if (oldWorkspace && oldWorkspace !== match.workspace) {
                this.compileAndSendDiagnosticsForWorkspace(oldWorkspace);
              }
            } else {
              templateBundle.templateWorkspace.relativePath =
                match.relativePath;
            }
            this.compileAndSendDiagnosticsForWorkspace(match.workspace);
          } else {
            if (oldWorkspace) {
              Workspace.removeTemplate(templateBundle);
              this.compileAndSendDiagnosticsForWorkspace(oldWorkspace);
            }
            this.sendDiagnostics(uri, []);
          }
        } else {
          const existingBundle = this.templateBundles.get(uri);
          if (existingBundle) {
            const oldWorkspace = existingBundle.templateWorkspace?.workspace;
            Workspace.removeTemplate(existingBundle);
            this.templateBundles.delete(uri);
            this.sendDiagnostics(uri, []);
            if (oldWorkspace) {
              this.compileAndSendDiagnosticsForWorkspace(oldWorkspace);
            }
          }
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

  public reassignTemplatesToWorkspaces(): void {
    const affectedWorkspaces = new Set<Workspace>();

    for (const templateBundle of this.templateBundles.values()) {
      const oldWorkspace = templateBundle.templateWorkspace?.workspace;
      const match = this.findTemplateWorkspace(templateBundle);

      if (match) {
        if (
          templateBundle.templateWorkspace?.workspace !== match.workspace ||
          templateBundle.templateWorkspace?.relativePath !== match.relativePath
        ) {
          Workspace.removeTemplate(templateBundle);
          Workspace.addTemplate(
            templateBundle,
            match.workspace,
            match.relativePath,
          );
          if (oldWorkspace) {
            affectedWorkspaces.add(oldWorkspace);
          }
          affectedWorkspaces.add(match.workspace);
        } else {
          affectedWorkspaces.add(match.workspace);
        }
      } else {
        if (oldWorkspace) {
          Workspace.removeTemplate(templateBundle);
          affectedWorkspaces.add(oldWorkspace);
        }
        this.sendDiagnostics(templateBundle.uri, []);
      }
    }

    for (const ws of affectedWorkspaces) {
      this.compileAndSendDiagnosticsForWorkspace(ws);
    }
  }

  public compileAndSendDiagnosticsForWorkspace(workspace: Workspace): void {
    const result = workspace.compile();
    for (const [uri, template] of workspace.templates) {
      const errors = result.finalErrors[uri] ?? [];
      const warnings = result.warnings[uri] ?? [];
      const doc = this.getDocument(uri);
      const diagnostics: Diagnostic[] = [
        ...errors.map((err) =>
          internalErrorToDiagnostic(
            err,
            DiagnosticSeverity.Error,
            doc,
            template.content.content,
          ),
        ),
        ...warnings.map((warn) =>
          internalErrorToDiagnostic(
            warn,
            DiagnosticSeverity.Warning,
            doc,
            template.content.content,
          ),
        ),
      ];
      this.sendDiagnostics(uri, diagnostics);
    }
  }
}

export function validateTypePromptDocument(
  textDocument: TextDocument,
): Diagnostic[] {
  const uri = textDocument.uri;
  const content = textDocument.getText();
  const compilationResult = compile({ [uri]: content }, { cache: null });
  const errors = compilationResult.finalErrors[uri] ?? [];
  const warnings = compilationResult.warnings[uri] ?? [];
  return [
    ...errors.map((err) =>
      internalErrorToDiagnostic(
        err,
        DiagnosticSeverity.Error,
        textDocument,
        content,
      ),
    ),
    ...warnings.map((warn) =>
      internalErrorToDiagnostic(
        warn,
        DiagnosticSeverity.Warning,
        textDocument,
        content,
      ),
    ),
  ];
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
