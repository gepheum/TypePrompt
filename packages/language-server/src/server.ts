import {
  compile,
  createLineFinder,
  findLine,
  parseConfigYaml,
  type CompilationResult,
  type Config,
  type InternalError,
  type LineFinderData,
} from "@typeprompt/core";
import { glob } from "glob";
import { minimatch } from "minimatch";
import * as fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
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

const DEBUG = false;

export type FileType = "typeprompt.yml" | "*.xml" | null;

export interface FileContent {
  readonly content: string;
  readonly lineFinder: LineFinderData;
  readonly lastModified: number;
}

export interface Logger {
  readonly log: (message: string) => void;
  readonly error: (message: string, ...args: unknown[]) => void;
}

const noopLogger: Logger = {
  log: () => {},
  error: () => {},
};

export function getFileType(uri: string): FileType {
  if (uri === "typeprompt.yml" || uri.endsWith("/typeprompt.yml")) {
    return "typeprompt.yml";
  } else if (uri.endsWith(".xml")) {
    return "*.xml";
  } else {
    return null;
  }
}

export function uriToFsPath(uri: string): string | null {
  try {
    if (uri.startsWith("file://")) {
      return fileURLToPath(uri);
    }
    return null;
  } catch {
    return null;
  }
}

export function fsPathToUri(fsPath: string): string {
  return pathToFileURL(fsPath).toString();
}

export interface TypePromptConfigBundle {
  readonly config: Config;
  readonly yamlContent: FileContent;
}

export interface XmlBundle {
  readonly uri: string;
  content: FileContent;
  workspace?: Workspace;
  relativePath?: string;
}

export function internalErrorToDiagnostic(
  err: InternalError,
  severity: DiagnosticSeverity,
  doc: TextDocument | undefined,
  lineFinder?: LineFinderData,
): Diagnostic {
  let start: Position;
  let end: Position;

  if (doc) {
    start = doc.positionAt(err.span.start);
    end = doc.positionAt(err.span.end);
  } else if (lineFinder !== undefined) {
    const startMatch = findLine(err.span.start, lineFinder);
    const endMatch = findLine(err.span.end, lineFinder);
    start = {
      line: startMatch.line.zeroBasedLineNumber,
      character: startMatch.zeroBasedColNumber,
    };
    end = {
      line: endMatch.line.zeroBasedLineNumber,
      character: endMatch.zeroBasedColNumber,
    };
  } else {
    start = { line: 0, character: 0 };
    end = { line: 0, character: 0 };
  }

  let message = err.message;
  if (err.hint) {
    message += `\n(${err.hint})`;
  }
  if (err.suggestions && err.suggestions.length > 0) {
    message += `\nDid you mean: ${err.suggestions.join(", ")}?`;
  }

  return {
    severity,
    range: { start, end },
    message,
    source: "typeprompt",
  };
}

export class Workspace {
  public readonly xmls = new Map<string, XmlBundle>();
  public compilationResult: CompilationResult | null = null;

  constructor(
    public readonly folderUri: string,
    public configBundle: TypePromptConfigBundle,
    public readonly logger: Logger = noopLogger,
  ) {}

  public get config(): Config {
    return this.configBundle.config;
  }

  public matchesInclude(relativePath: string): boolean {
    const pattern = this.config.include;
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
    this.logger.log(
      `[TypePrompt LSP] [Workspace: ${this.folderUri}] Compiling ${this.xmls.size} XML file(s) (cache=${Boolean(this.compilationResult)})...`,
    );
    const pathToContent: { [path: string]: string } = {};
    for (const [uri, xml] of this.xmls) {
      pathToContent[uri] = xml.content.content;
    }
    this.compilationResult = compile(pathToContent, {
      cache: this.compilationResult,
    });
    this.logger.log(
      `[TypePrompt LSP] [Workspace: ${this.folderUri}] Compilation complete. anyErrors=${this.compilationResult.anyErrors}`,
    );
    return this.compilationResult;
  }

  public static addXml(
    xml: XmlBundle,
    workspace: Workspace,
    relativePath: string,
  ): void {
    workspace.logger.log(
      `[TypePrompt LSP] Adding XML ${xml.uri} to workspace ${workspace.folderUri} as '${relativePath}'`,
    );
    xml.workspace = workspace;
    xml.relativePath = relativePath;
    workspace.xmls.set(xml.uri, xml);
  }

  public static removeXml(xml: XmlBundle): void {
    if (xml.workspace) {
      xml.workspace.logger.log(
        `[TypePrompt LSP] Removing XML ${xml.uri} from workspace ${xml.workspace.folderUri}`,
      );
      xml.workspace.xmls.delete(xml.uri);
      xml.workspace = undefined;
      xml.relativePath = undefined;
    }
  }
}

export class TypePromptLanguageExtension {
  public readonly workspaces = new Map<string, Workspace>();
  public readonly xmlBundles = new Map<string, XmlBundle>();
  private readonly workspaceFolders = new Set<string>();
  private readonly uriToTimeout = new Map<string, NodeJS.Timeout>();
  private scanLoopTimeout?: NodeJS.Timeout;
  private disposed = false;
  public readonly logger: Logger;

  constructor(
    private readonly sendDiagnostics: (
      uri: string,
      diagnostics: Diagnostic[],
    ) => void,
    private readonly getDocument: (uri: string) => TextDocument | undefined,
    logger: Logger = noopLogger,
  ) {
    this.logger = logger;
  }

  public setWorkspaceFolders(uris: string[]): void {
    this.workspaceFolders.clear();
    for (const uri of uris) {
      this.workspaceFolders.add(uri);
    }
  }

  public addWorkspaceFolder(uri: string): void {
    this.workspaceFolders.add(uri);
  }

  public removeWorkspaceFolder(uri: string): void {
    this.workspaceFolders.delete(uri);
  }

  public async runScan(): Promise<void> {
    if (this.disposed) return;
    this.logger.log(
      `[TypePrompt LSP] Running scan across ${this.workspaceFolders.size} workspace folder(s)...`,
    );

    for (const folderUri of this.workspaceFolders) {
      const folderPath = uriToFsPath(folderUri);
      if (!folderPath) {
        continue;
      }

      let files: string[];
      try {
        files = await glob("**/{typeprompt.yml,typeprompt.yaml,*.xml}", {
          cwd: folderPath,
          nodir: true,
          absolute: true,
        });
      } catch (error) {
        this.logger.error(
          `[TypePrompt LSP] Glob scan failed in ${folderPath}:`,
          error,
        );
        continue;
      }

      // Prioritize config files first so workspaces are created before XMLs.
      const uriToTier = (u: string): number => {
        if (
          u.endsWith("/typeprompt.yml") ||
          u.endsWith("/typeprompt.yaml") ||
          u === "typeprompt.yml"
        ) {
          return 1;
        }
        return 2;
      };

      files.sort((a, b) => uriToTier(a) - uriToTier(b));

      for (const filePath of files) {
        const fileUri = fsPathToUri(filePath);
        // If document is open in editor, let open document take precedence
        if (this.getDocument(fileUri)) {
          continue;
        }

        let mtime: number;
        try {
          const stat = await fs.stat(filePath);
          mtime = stat.mtimeMs;
        } catch (error) {
          this.logger.error(
            `[TypePrompt LSP] Failed to stat file ${filePath}:`,
            error,
          );
          continue;
        }

        const oldContent = this.getFileContent(fileUri);
        if (oldContent && oldContent.lastModified >= mtime) {
          continue;
        }

        let contentText: string;
        try {
          contentText = await fs.readFile(filePath, "utf-8");
        } catch (error) {
          this.logger.error(
            `[TypePrompt LSP] Failed to read file ${filePath}:`,
            error,
          );
          continue;
        }

        if (oldContent && oldContent.content === contentText) {
          continue;
        }

        this.setFileContent(fileUri, {
          content: contentText,
          lineFinder: createLineFinder(contentText),
          lastModified: mtime,
        });
      }
    }
  }

  public async runGarbageCollection(): Promise<void> {
    if (this.disposed) return;
    const uris = new Set<string>();
    for (const uri of this.xmlBundles.keys()) {
      uris.add(uri);
    }
    for (const uri of this.workspaces.keys()) {
      uris.add(uri);
    }

    for (const uri of uris) {
      if (this.getDocument(uri)) {
        continue;
      }

      const fsPath = uriToFsPath(uri);
      if (!fsPath) {
        continue;
      }

      let exists: boolean;
      try {
        const stat = await fs.stat(fsPath);
        exists = stat.isFile();
      } catch {
        exists = false;
      }

      if (!exists) {
        this.logger.log(
          `[TypePrompt LSP] File no longer exists on disk, removing: ${uri}`,
        );
        this.setFileContent(uri, undefined);
      }
    }
  }

  public scheduleScanLoop(delayMilliseconds = 5000): void {
    if (this.disposed) return;
    if (this.scanLoopTimeout) {
      clearTimeout(this.scanLoopTimeout);
    }
    this.scanLoopTimeout = setTimeout(
      () => void this.runScanLoopIteration(delayMilliseconds),
      delayMilliseconds,
    );
  }

  private async runScanLoopIteration(delayMilliseconds: number): Promise<void> {
    if (this.disposed) return;
    try {
      await this.runGarbageCollection();
      await this.runScan();
    } catch (error) {
      this.logger.error("[TypePrompt LSP] Error during scheduled scan:", error);
    }
    this.scheduleScanLoop(delayMilliseconds);
  }

  public dispose(): void {
    this.disposed = true;
    if (this.scanLoopTimeout) {
      clearTimeout(this.scanLoopTimeout);
      this.scanLoopTimeout = undefined;
    }
    for (const timeout of this.uriToTimeout.values()) {
      clearTimeout(timeout);
    }
    this.uriToTimeout.clear();
  }

  public setFileContent(uri: string, content: FileContent | undefined): void {
    const fileType = getFileType(uri);
    this.logger.log(
      `[TypePrompt LSP] setFileContent: uri=${uri}, fileType=${fileType}, hasContent=${Boolean(content)}`,
    );

    if (fileType && !content) {
      this.sendDiagnostics(uri, []);
    }

    switch (fileType) {
      case "typeprompt.yml": {
        if (content) {
          this.logger.log(`[TypePrompt LSP] Parsing config for ${uri}...`);
          const configResult = parseConfigYaml(content.content);
          if (configResult.kind === "success") {
            const configBundle: TypePromptConfigBundle = {
              config: configResult.config,
              yamlContent: content,
            };
            const oldWorkspace = this.workspaces.get(uri);
            if (oldWorkspace) {
              this.logger.log(
                `[TypePrompt LSP] Updating config for existing workspace ${uri}`,
              );
              oldWorkspace.configBundle = configBundle;
            } else {
              const folderUri = uri.replace(/typeprompt\.(yml|yaml)$/, "");
              this.logger.log(
                `[TypePrompt LSP] Creating new workspace for ${folderUri}`,
              );
              const workspace = new Workspace(
                folderUri,
                configBundle,
                this.logger,
              );
              this.workspaces.set(uri, workspace);
            }
            this.sendDiagnostics(uri, []);
            this.reassignXmlsToWorkspaces();
          } else {
            this.logger.error(
              `[TypePrompt LSP] Config errors in ${uri}:`,
              configResult.errors,
            );
            const doc = this.getDocument(uri);
            const diagnostics = configResult.errors.map((err): Diagnostic =>
              internalErrorToDiagnostic(
                err,
                DiagnosticSeverity.Error,
                doc,
                content.lineFinder,
              ),
            );
            this.sendDiagnostics(uri, diagnostics);
          }
        } else {
          this.logger.log(
            `[TypePrompt LSP] Workspace config deleted at ${uri}`,
          );
          if (this.workspaces.delete(uri)) {
            this.reassignXmlsToWorkspaces();
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
          let xmlBundle = this.xmlBundles.get(uri);
          const oldWorkspace = xmlBundle?.workspace;

          if (xmlBundle) {
            xmlBundle.content = content;
          } else {
            xmlBundle = {
              uri,
              content,
            };
            this.xmlBundles.set(uri, xmlBundle);
          }

          const match = this.findWorkspace(xmlBundle);
          if (match) {
            if (xmlBundle.workspace !== match.workspace) {
              Workspace.removeXml(xmlBundle);
              Workspace.addXml(xmlBundle, match.workspace, match.relativePath);
              if (oldWorkspace && oldWorkspace !== match.workspace) {
                this.compileAndSendDiagnosticsForWorkspace(oldWorkspace);
              }
            } else {
              xmlBundle.relativePath = match.relativePath;
            }
            this.compileAndSendDiagnosticsForWorkspace(match.workspace);
          } else {
            this.logger.log(
              `[TypePrompt LSP] XML file ${uri} does not belong to any workspace.`,
            );
            if (oldWorkspace) {
              Workspace.removeXml(xmlBundle);
              this.compileAndSendDiagnosticsForWorkspace(oldWorkspace);
            }
            this.sendDiagnostics(uri, []);
          }
        } else {
          const existingBundle = this.xmlBundles.get(uri);
          if (existingBundle) {
            const oldWorkspace = existingBundle.workspace;
            Workspace.removeXml(existingBundle);
            this.xmlBundles.delete(uri);
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
        return this.xmlBundles.get(uri)?.content;
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
        const text = document.getText();
        this.setFileContent(uri, {
          content: text,
          lineFinder: createLineFinder(text),
          lastModified: Date.now(),
        });
      } catch (error) {
        this.logger.error(
          `[TypePrompt LSP] Error setting file content for ${uri}:`,
          error,
        );
      }
    }, delayMilliseconds);
    this.uriToTimeout.set(uri, timeout);
  }

  public findWorkspace(
    xml: XmlBundle,
  ): { workspace: Workspace; relativePath: string } | undefined {
    let bestMatch: { workspace: Workspace; relativePath: string } | undefined;
    for (const workspace of this.workspaces.values()) {
      const relPath = workspace.getRelativePath(xml.uri);
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

  public getXmlBundle(uri: string): XmlBundle | undefined {
    return this.xmlBundles.get(uri);
  }

  public reassignXmlsToWorkspaces(): void {
    this.logger.log(
      `[TypePrompt LSP] Reassigning XMLs (workspaces=${this.workspaces.size}, xmls=${this.xmlBundles.size})...`,
    );
    const affectedWorkspaces = new Set<Workspace>();

    for (const xmlBundle of this.xmlBundles.values()) {
      const oldWorkspace = xmlBundle.workspace;
      const match = this.findWorkspace(xmlBundle);

      if (match) {
        if (
          xmlBundle.workspace !== match.workspace ||
          xmlBundle.relativePath !== match.relativePath
        ) {
          Workspace.removeXml(xmlBundle);
          Workspace.addXml(xmlBundle, match.workspace, match.relativePath);
          if (oldWorkspace) {
            affectedWorkspaces.add(oldWorkspace);
          }
          affectedWorkspaces.add(match.workspace);
        } else {
          affectedWorkspaces.add(match.workspace);
        }
      } else {
        if (oldWorkspace) {
          Workspace.removeXml(xmlBundle);
          affectedWorkspaces.add(oldWorkspace);
        }
        this.sendDiagnostics(xmlBundle.uri, []);
      }
    }

    for (const ws of affectedWorkspaces) {
      this.compileAndSendDiagnosticsForWorkspace(ws);
    }
  }

  public compileAndSendDiagnosticsForWorkspace(workspace: Workspace): void {
    const result = workspace.compile();
    for (const [uri, xml] of workspace.xmls) {
      const errors = result.finalErrors[uri] ?? [];
      const warnings = result.warnings[uri] ?? [];
      const doc = this.getDocument(uri);
      const diagnostics: Diagnostic[] = [
        ...errors.map((err) =>
          internalErrorToDiagnostic(
            err,
            DiagnosticSeverity.Error,
            doc,
            xml.content.lineFinder,
          ),
        ),
        ...warnings.map((warn) =>
          internalErrorToDiagnostic(
            warn,
            DiagnosticSeverity.Warning,
            doc,
            xml.content.lineFinder,
          ),
        ),
      ];
      this.logger.log(
        `[TypePrompt LSP] Diagnostics for ${uri}: ${diagnostics.length} item(s) (${errors.length} error(s), ${warnings.length} warning(s))`,
      );
      this.sendDiagnostics(uri, diagnostics);
    }
  }
}

export function validateTypePromptDocument(
  textDocument: TextDocument,
): Diagnostic[] {
  const uri = textDocument.uri;
  const content = textDocument.getText();
  const lineFinder = createLineFinder(content);
  const compilationResult = compile({ [uri]: content }, { cache: null });
  const errors = compilationResult.finalErrors[uri] ?? [];
  const warnings = compilationResult.warnings[uri] ?? [];
  return [
    ...errors.map((err) =>
      internalErrorToDiagnostic(
        err,
        DiagnosticSeverity.Error,
        textDocument,
        lineFinder,
      ),
    ),
    ...warnings.map((warn) =>
      internalErrorToDiagnostic(
        warn,
        DiagnosticSeverity.Warning,
        textDocument,
        lineFinder,
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

  const logger: Logger = {
    log: (msg) => connection.console.log(msg),
    error: (msg, ...args) => {
      const extra = args.length > 0 ? " " + JSON.stringify(args) : "";
      connection.console.error(`${msg}${extra}`);
    },
  };

  const extension = new TypePromptLanguageExtension(
    (uri, diagnostics) => connection.sendDiagnostics({ uri, diagnostics }),
    (uri) => documents.get(uri),
    DEBUG ? logger : noopLogger,
  );

  let hasWorkspaceFolderCapability = false;

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    const capabilities = params.capabilities;
    hasWorkspaceFolderCapability = !!capabilities.workspace?.workspaceFolders;

    const folders = params.workspaceFolders?.map((f) => f.uri) ?? [];
    if (folders.length > 0) {
      extension.setWorkspaceFolders(folders);
    }
    logger.log(
      `[TypePrompt LSP] connection.onInitialize: workspaceFolders=${folders.join(", ") || "none"}`,
    );
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
        workspace: {
          workspaceFolders: {
            supported: true,
            changeNotifications: true,
          },
        },
      },
      serverInfo: {
        name: "typeprompt-language-server",
        version: "0.1.0",
      },
    };
  });

  connection.onInitialized(async () => {
    if (hasWorkspaceFolderCapability) {
      connection.workspace.onDidChangeWorkspaceFolders((event) => {
        logger.log(
          `[TypePrompt LSP] onDidChangeWorkspaceFolders: added=${event.added.length}, removed=${event.removed.length}`,
        );
        for (const folder of event.added) {
          extension.addWorkspaceFolder(folder.uri);
        }
        for (const folder of event.removed) {
          extension.removeWorkspaceFolder(folder.uri);
        }
        void extension.runScan();
      });
    }

    logger.log(
      "[TypePrompt LSP] connection.onInitialized: starting initial scan and loop.",
    );
    try {
      await extension.runScan();
    } catch (err) {
      logger.error("[TypePrompt LSP] Error during initial scan:", err);
    }
    extension.scheduleScanLoop();
  });

  connection.onDidChangeWatchedFiles(async (params) => {
    logger.log(
      `[TypePrompt LSP] onDidChangeWatchedFiles: ${params.changes.length} change(s)`,
    );
    await extension.runGarbageCollection();
    await extension.runScan();
  });

  documents.onDidChangeContent((change) => {
    logger.log(`[TypePrompt LSP] onDidChangeContent: ${change.document.uri}`);
    const text = change.document.getText();
    extension.setFileContent(change.document.uri, {
      content: text,
      lineFinder: createLineFinder(text),
      lastModified: Date.now(),
    });
  });

  documents.onDidClose(async (event) => {
    logger.log(`[TypePrompt LSP] onDidClose: ${event.document.uri}`);
    const uri = event.document.uri;
    const fsPath = uriToFsPath(uri);
    if (fsPath) {
      try {
        const stat = await fs.stat(fsPath);
        if (stat.isFile()) {
          const content = await fs.readFile(fsPath, "utf-8");
          extension.setFileContent(uri, {
            content,
            lineFinder: createLineFinder(content),
            lastModified: stat.mtimeMs,
          });
          return;
        }
      } catch {
        // File does not exist on disk
      }
    }
    extension.setFileContent(uri, undefined);
  });

  connection.onShutdown(() => {
    logger.log("[TypePrompt LSP] connection.onShutdown: disposing extension.");
    extension.dispose();
  });

  documents.listen(connection);

  return {
    connection,
    documents,
    extension,
    listen: (): void => {
      logger.log("[TypePrompt LSP] Language server connection listening.");
      connection.listen();
    },
  };
}
