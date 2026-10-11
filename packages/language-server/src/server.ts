import type {
  CompilationResultParseError,
  ValidCompilationResult,
} from "@typeprompt/core";
import {
  compile,
  createLineFinder,
  findLine,
  getCompletionItems,
  parseCompilationResult,
  parseConfigYaml,
  tokenize,
  type CompilationResult,
  type Config,
  type DefinitionLink,
  type InternalError,
  type LineFinderData,
  type SemanticToken,
  type Span,
  type TextSpan,
} from "@typeprompt/core";
import fastDiff from "fast-diff";
import { glob } from "glob";
import { minimatch } from "minimatch";
import * as fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { formatTemplateFile } from "typeprompt/formatter";
import { TextDocument } from "vscode-languageserver-textdocument";
import type {
  CompletionItem,
  CompletionParams,
  DefinitionParams,
  Diagnostic,
  DocumentFormattingParams,
  InitializeParams,
  InitializeResult,
  Location,
  Position,
  Range,
  ReferenceContext,
  ReferenceParams,
  RenameParams,
  SemanticTokens,
  SemanticTokensLegend,
  SemanticTokensParams,
  WorkspaceEdit,
} from "vscode-languageserver/node.js";
import {
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  ProposedFeatures,
  SemanticTokensBuilder,
  TextDocuments,
  TextDocumentSyncKind,
  TextEdit,
  type _Connection,
} from "vscode-languageserver/node.js";

type FileType = "typeprompt.yml" | "*.xml" | "patch-base.json" | null;

interface FileContent {
  readonly content: string;
  readonly lineFinder: LineFinderData;
  readonly lastModified: number;
}

function getFileType(uri: string): FileType {
  if (uri.endsWith("/typeprompt.yml")) {
    return "typeprompt.yml";
  } else if (uri.endsWith(".xml")) {
    return "*.xml";
  } else if (uri.endsWith("/patch-base.json")) {
    return "patch-base.json";
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

interface TypePromptConfigBundle {
  readonly config: Config;
  readonly yamlContent: FileContent;
}

interface TemplateFile {
  /** The absolute file URI (e.g. "file:///path/to/project/prompts/hello.xml"). */
  readonly uri: string;
  /** Cached file content, line offsets finder, and last modified timestamp. */
  content: FileContent;
  /** The project this template file belongs to, or undefined if outside any project. */
  project?: Project;
  /** Project-relative path within the project. */
  relativePath?: string;
}

interface PatchBase {
  /** The absolute file URI (e.g. "file:///path/to/project/patch-base.json"). */
  readonly uri: string;
  content: FileContent;
  compilationResult: ValidCompilationResult | CompilationResultParseError;
  /** The project this patch base belongs to, or undefined if outside any project. */
  project?: Project;
}

function internalErrorToDiagnostic(
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

  const { message } = err;

  return {
    severity,
    range: { start, end },
    message,
    source: "typeprompt",
  };
}

export function computeEdits(
  doc: TextDocument,
  formattedText: string,
): TextEdit[] {
  const originalText = doc.getText();
  if (originalText === formattedText) {
    return [];
  }

  const diffs = fastDiff(originalText, formattedText);
  const edits: TextEdit[] = [];
  let currentOffset = 0;

  for (let i = 0; i < diffs.length; i++) {
    const [op, text] = diffs[i]!;

    if (op === fastDiff.EQUAL) {
      currentOffset += text.length;
    } else {
      const editStart = currentOffset;
      let deleteLength = 0;
      let newText = "";

      while (i < diffs.length && diffs[i]![0] !== fastDiff.EQUAL) {
        const [currentOp, chunkText] = diffs[i]!;
        if (currentOp === fastDiff.DELETE) {
          deleteLength += chunkText.length;
        } else if (currentOp === fastDiff.INSERT) {
          newText += chunkText;
        }
        i++;
      }
      i--;

      const editEnd = editStart + deleteLength;
      currentOffset = editEnd;

      edits.push({
        range: {
          start: doc.positionAt(editStart),
          end: doc.positionAt(editEnd),
        },
        newText,
      });
    }
  }

  return edits;
}

export const SEMANTIC_TOKEN_TYPES = [
  "comment",
  "string",
  "keyword",
  "number",
  "type",
  "property",
] as const;

const SEMANTIC_TOKEN_MODIFIERS: string[] = [];

const semanticTokensLegend: SemanticTokensLegend = {
  tokenTypes: [...SEMANTIC_TOKEN_TYPES],
  tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
};

function tokenKindToType(
  kind: SemanticToken["kind"],
): (typeof SEMANTIC_TOKEN_TYPES)[number] {
  switch (kind) {
    case "comment":
      return "comment";
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
    case "schema-keyword":
      return "keyword";
    case "xml-tag":
      return "type";
    case "xml-attribute":
      return "property";
    default: {
      const _: never = kind;
      return "keyword";
    }
  }
}

function pushSemanticToken(
  builder: SemanticTokensBuilder,
  doc: TextDocument,
  span: Span,
  typeIndex: number,
  modifiers = 0,
): void {
  const startPos = doc.positionAt(span.start);
  const endPos = doc.positionAt(span.end);

  if (startPos.line === endPos.line) {
    const length = endPos.character - startPos.character;
    if (length > 0) {
      builder.push(
        startPos.line,
        startPos.character,
        length,
        typeIndex,
        modifiers,
      );
    }
    return;
  }

  for (let line = startPos.line; line <= endPos.line; line++) {
    const lineText = doc.getText({
      start: { line, character: 0 },
      end: { line: line + 1, character: 0 },
    });
    const trimmedLineLength = lineText.replace(/[\r\n]+$/, "").length;

    let charStart = 0;
    let charEnd = trimmedLineLength;

    if (line === startPos.line) {
      charStart = startPos.character;
    }
    if (line === endPos.line) {
      charEnd = Math.min(trimmedLineLength, endPos.character);
    }

    const length = charEnd - charStart;
    if (length > 0) {
      builder.push(line, charStart, length, typeIndex, modifiers);
    }
  }
}

export function computeSemanticTokens(doc: TextDocument): SemanticTokens {
  const text = doc.getText();
  const tokens = tokenize(text, doc.uri);
  const builder = new SemanticTokensBuilder();

  for (const token of tokens) {
    const tokenType = tokenKindToType(token.kind);
    const typeIndex = SEMANTIC_TOKEN_TYPES.indexOf(tokenType);
    if (typeIndex >= 0) {
      pushSemanticToken(builder, doc, token.span, typeIndex);
    }
  }

  return builder.build();
}

/**
 * A TypePrompt project corresponding to a `typeprompt.yml` file.
 */
class Project {
  /** Template files in this project. Key: relative path. */
  public readonly templateFiles = new Map<string, TemplateFile>();

  public patchBase:
    ValidCompilationResult | CompilationResultParseError | null = null;

  get patchBaseOrNull(): ValidCompilationResult | null {
    const { patchBase } = this;
    if (patchBase && patchBase.anyErrors) return null;
    return patchBase;
  }

  /** Cached compilation result for this project. */
  public compilationResult: CompilationResult | null = null;

  constructor(
    /**
     * The absolute file URI of the directory containing `typeprompt.yml`
     * (e.g. "file:///path/to/project").
     */
    public readonly folderUri: string,
    /** The loaded configuration bundle for this project. */
    public configBundle: TypePromptConfigBundle,
  ) {}

  public get config(): Config {
    return this.configBundle.config;
  }

  public matchesInclude(relativePath: string): boolean {
    let { include } = this.config;
    if (typeof include === "string") {
      include = [include];
    }
    return include.some((p) => minimatch(relativePath, p));
  }

  /**
   * Computes the project-relative path of a file given its URI, or returns null if not
   * inside this project folder.
   */
  public getRelativePath(fileUri: string): string | null {
    if (!fileUri.startsWith(this.folderUri)) {
      return null;
    }
    const rel = fileUri.slice(this.folderUri.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }

  /**
   * Finds a template file belonging to this project by its project-relative path
   * (e.g. "prompts/hello-world.xml") or by its full URI (e.g. "file:///path/to/project/prompts/hello-world.xml").
   */
  public getTemplateFile(pathOrUri: string): TemplateFile | undefined {
    const direct = this.templateFiles.get(pathOrUri);
    if (direct) {
      return direct;
    }
    const rel = this.getRelativePath(pathOrUri);
    if (rel) {
      return this.templateFiles.get(rel);
    }
    return undefined;
  }

  /** Converts a compiler span into an LSP Range. */
  public spanToRange(
    span: Span,
    getDocument: (uri: string) => TextDocument | undefined,
  ): Range | null {
    const templateFile = this.getTemplateFile(span.path);
    if (!templateFile) {
      return null;
    }
    const doc = getDocument(templateFile.uri);
    if (doc) {
      return {
        start: doc.positionAt(span.start),
        end: doc.positionAt(span.end),
      };
    }
    const startMatch = findLine(span.start, templateFile.content.lineFinder);
    const endMatch = findLine(span.end, templateFile.content.lineFinder);
    return {
      start: {
        line: startMatch.line.zeroBasedLineNumber,
        character: startMatch.zeroBasedColNumber,
      },
      end: {
        line: endMatch.line.zeroBasedLineNumber,
        character: endMatch.zeroBasedColNumber,
      },
    };
  }

  /** Compiles all template files in this project into a `CompilationResult`. */
  public compile(): CompilationResult {
    const pathToContent: { [path: string]: string } = {};
    for (const [relPath, templateFile] of this.templateFiles) {
      pathToContent[relPath] = templateFile.content.content;
    }
    this.compilationResult = compile(pathToContent, {
      cache: this.compilationResult,
      patchBase: this.patchBaseOrNull,
    });
    return this.compilationResult;
  }

  /** Registers a template file with a project under its project-relative path. */
  public static addTemplateFile(
    templateFile: TemplateFile,
    project: Project,
    relativePath: string,
  ): void {
    templateFile.project = project;
    templateFile.relativePath = relativePath;
    project.templateFiles.set(relativePath, templateFile);
  }

  /** Registers a patch base with a project. */
  public static addPatchBase(patchBase: PatchBase, project: Project): void {
    patchBase.project = project;
    project.patchBase = patchBase.compilationResult;
  }

  /** Unregisters a template file from its project. */
  public static removeTemplateFile(templateFile: TemplateFile): void {
    if (!templateFile.project) return;
    if (templateFile.relativePath) {
      templateFile.project.templateFiles.delete(templateFile.relativePath);
    }
    templateFile.project = undefined;
    templateFile.relativePath = undefined;
  }

  /** Unregisters a patch base from its project. */
  public static removePatchBase(patchBase: PatchBase): void {
    if (!patchBase.project) return;
    patchBase.project.patchBase = null;
    patchBase.project = undefined;
  }
}

export class TypePromptLanguageExtension {
  /** Map of projects indexed by their project folder URI. */
  public readonly projects = new Map<string, Project>();
  /** Map of all discovered or open template files indexed by their absolute file URI. */
  public readonly templateFiles = new Map<string, TemplateFile>();
  /** Map of all discovered or open patch bases indexed by their absolute file URI. */
  public readonly patchBases = new Map<string, PatchBase>();
  /** Set of workspace root folder URIs configured in the client. */
  private readonly workspaceFolders = new Set<string>();
  /**
   * Active debounce timeouts per document URI before compiling and sending
   * diagnostics.
   */
  private readonly uriToTimeout = new Map<string, NodeJS.Timeout>();
  private scanLoopTimeout?: NodeJS.Timeout;
  private disposed = false;

  constructor(
    private readonly sendDiagnostics: (
      uri: string,
      diagnostics: Diagnostic[],
    ) => void,
    private readonly getDocument: (uri: string) => TextDocument | undefined,
  ) {}

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

    for (const folderUri of this.workspaceFolders) {
      const folderPath = uriToFsPath(folderUri);
      if (!folderPath) {
        continue;
      }

      let files: string[];
      try {
        files = await glob("**/{typeprompt.yml,patch-base.json,*.xml}", {
          cwd: folderPath,
          nodir: true,
          absolute: true,
          ignore: [
            "**/node_modules/**",
            "**/.git/**",
            "**/dist/**",
            "**/build/**",
            "**/bin/**",
            "**/obj/**",
            "**/.gradle/**",
            "**/target/**",
          ],
        });
      } catch {
        continue;
      }

      // Prioritize config files first so projects are created before template files.
      const uriToTier = (u: string): number => {
        const fileType = getFileType(u);
        switch (fileType) {
          case "typeprompt.yml":
            return 1;
          case "patch-base.json":
            return 2;
          case "*.xml":
            return 3;
          case null:
            return 4;
          default: {
            const _: never = fileType;
            return 4;
          }
        }
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
        } catch {
          continue;
        }

        const oldContent = this.getFileContent(fileUri);
        if (oldContent && oldContent.lastModified >= mtime) {
          continue;
        }

        let contentText: string;
        try {
          contentText = await fs.readFile(filePath, "utf-8");
        } catch {
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
    for (const uri of this.templateFiles.keys()) {
      uris.add(uri);
    }
    for (const uri of this.projects.keys()) {
      uris.add(uri);
    }
    for (const uri of this.patchBases.keys()) {
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
    } catch {
      // Ignored
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

    if (fileType && !content) {
      this.sendDiagnostics(uri, []);
    }

    switch (fileType) {
      case "typeprompt.yml": {
        if (content) {
          const configResult = parseConfigYaml(content.content, uri);
          if (configResult.kind === "success") {
            const configBundle: TypePromptConfigBundle = {
              config: configResult.config,
              yamlContent: content,
            };
            const oldProject = this.projects.get(uri);
            if (oldProject) {
              oldProject.configBundle = configBundle;
            } else {
              const folderUri = uri.replace(/typeprompt\.(yml|yaml)$/, "");
              const project = new Project(folderUri, configBundle);
              this.projects.set(uri, project);
            }
            this.sendDiagnostics(uri, []);
            this.reassignTemplateFilesToProjects();
          } else {
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
          if (this.projects.delete(uri)) {
            this.reassignTemplateFilesToProjects();
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
          let templateFile = this.templateFiles.get(uri);
          const oldProject = templateFile?.project;

          if (templateFile) {
            templateFile.content = content;
          } else {
            templateFile = {
              uri,
              content,
            };
            this.templateFiles.set(uri, templateFile);
          }

          const match = this.findProjectByUri(uri);
          if (match) {
            if (templateFile.project !== match.project) {
              Project.removeTemplateFile(templateFile);
              Project.addTemplateFile(
                templateFile,
                match.project,
                match.relativePath,
              );
              if (oldProject && oldProject !== match.project) {
                this.compileAndSendDiagnosticsForProject(oldProject);
              }
            } else {
              templateFile.relativePath = match.relativePath;
            }
            this.compileAndSendDiagnosticsForProject(match.project);
          } else {
            if (oldProject) {
              Project.removeTemplateFile(templateFile);
              this.compileAndSendDiagnosticsForProject(oldProject);
            }
            this.sendDiagnostics(uri, []);
          }
        } else {
          const existingTemplateFile = this.templateFiles.get(uri);
          if (existingTemplateFile) {
            const oldProject = existingTemplateFile.project;
            Project.removeTemplateFile(existingTemplateFile);
            this.templateFiles.delete(uri);
            this.sendDiagnostics(uri, []);
            if (oldProject) {
              this.compileAndSendDiagnosticsForProject(oldProject);
            }
          }
        }
        break;
      }
      case "patch-base.json": {
        const timeout = this.uriToTimeout.get(uri);
        if (timeout) {
          clearTimeout(timeout);
          this.uriToTimeout.delete(uri);
        }

        if (content) {
          let patchBase = this.patchBases.get(uri);
          const oldProject = patchBase?.project;

          const compilationResult = parseCompilationResult(
            content.content,
            uri,
          );

          if (patchBase) {
            patchBase.content = content;
            patchBase.compilationResult = compilationResult;
          } else {
            patchBase = { uri, content, compilationResult };
            this.patchBases.set(uri, patchBase);
          }

          const match = this.findProjectByUri(uri);
          if (match) {
            if (patchBase.project !== match.project) {
              Project.removePatchBase(patchBase);
              Project.addPatchBase(patchBase, match.project);
              if (oldProject && oldProject !== match.project) {
                this.compileAndSendDiagnosticsForProject(oldProject);
              }
            } else {
              match.project.patchBase = patchBase.compilationResult;
            }
            this.compileAndSendDiagnosticsForProject(match.project);
          } else {
            if (oldProject) {
              Project.removePatchBase(patchBase);
              this.compileAndSendDiagnosticsForProject(oldProject);
            }
            this.sendDiagnostics(uri, []);
          }
        } else {
          const existingPatchBase = this.patchBases.get(uri);
          if (existingPatchBase) {
            const oldProject = existingPatchBase.project;
            Project.removePatchBase(existingPatchBase);
            this.patchBases.delete(uri);
            this.sendDiagnostics(uri, []);
            if (oldProject) {
              this.compileAndSendDiagnosticsForProject(oldProject);
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
        return this.templateFiles.get(uri)?.content;
      case "patch-base.json":
        return this.patchBases.get(uri)?.content;
      case "typeprompt.yml":
        return this.projects.get(uri)?.configBundle.yamlContent;
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
      } catch {
        // Ignored
      }
    }, delayMilliseconds);
    this.uriToTimeout.set(uri, timeout);
  }

  public findProjectByUri(
    uri: string,
  ): { project: Project; relativePath: string } | undefined {
    const fileType = getFileType(uri);
    let bestMatch: { project: Project; relativePath: string } | undefined;
    for (const project of this.projects.values()) {
      const relPath = project.getRelativePath(uri);
      if (relPath === null) {
        continue;
      }
      const matches =
        fileType === "patch-base.json"
          ? relPath === "patch-base.json"
          : project.matchesInclude(relPath);
      if (matches) {
        if (
          !bestMatch ||
          project.folderUri.length > bestMatch.project.folderUri.length
        ) {
          bestMatch = { project, relativePath: relPath };
        }
      }
    }
    return bestMatch;
  }

  public getTemplateFile(uri: string): TemplateFile | undefined {
    return this.templateFiles.get(uri);
  }

  public reassignTemplateFilesToProjects(): void {
    const affectedProjects = new Set<Project>();

    for (const patchBase of this.patchBases.values()) {
      const oldProject = patchBase.project;
      const match = this.findProjectByUri(patchBase.uri);

      if (match) {
        if (patchBase.project !== match.project) {
          Project.removePatchBase(patchBase);
          Project.addPatchBase(patchBase, match.project);
          if (oldProject) {
            affectedProjects.add(oldProject);
          }
          affectedProjects.add(match.project);
        } else {
          match.project.patchBase = patchBase.compilationResult;
          affectedProjects.add(match.project);
        }
      } else {
        if (oldProject) {
          Project.removePatchBase(patchBase);
          affectedProjects.add(oldProject);
        }
      }
    }

    for (const templateFile of this.templateFiles.values()) {
      const oldProject = templateFile.project;
      const match = this.findProjectByUri(templateFile.uri);

      if (match) {
        if (
          templateFile.project !== match.project ||
          templateFile.relativePath !== match.relativePath
        ) {
          Project.removeTemplateFile(templateFile);
          Project.addTemplateFile(
            templateFile,
            match.project,
            match.relativePath,
          );
          if (oldProject) {
            affectedProjects.add(oldProject);
          }
          affectedProjects.add(match.project);
        } else {
          affectedProjects.add(match.project);
        }
      } else {
        if (oldProject) {
          Project.removeTemplateFile(templateFile);
          affectedProjects.add(oldProject);
        }
        this.sendDiagnostics(templateFile.uri, []);
      }
    }

    for (const proj of affectedProjects) {
      this.compileAndSendDiagnosticsForProject(proj);
    }
  }

  public compileAndSendDiagnosticsForProject(project: Project): void {
    const result = project.compile();
    for (const [relPath, templateFile] of project.templateFiles) {
      const errors = result.finalErrors[relPath] ?? [];
      const warnings = result.warnings[relPath] ?? [];
      const doc = this.getDocument(templateFile.uri);
      const diagnostics: Diagnostic[] = [
        ...errors.map((err) =>
          internalErrorToDiagnostic(
            err,
            DiagnosticSeverity.Error,
            doc,
            templateFile.content.lineFinder,
          ),
        ),
        ...warnings.map((warn) =>
          internalErrorToDiagnostic(
            warn,
            DiagnosticSeverity.Warning,
            doc,
            templateFile.content.lineFinder,
          ),
        ),
      ];
      this.sendDiagnostics(templateFile.uri, diagnostics);
    }
  }

  public async formatDocument(uri: string): Promise<TextEdit[]> {
    if (this.disposed) return [];
    const fileType = getFileType(uri);
    if (fileType !== "*.xml") {
      return [];
    }

    const templateFile = this.templateFiles.get(uri);
    if (!templateFile?.project) {
      return [];
    }

    const doc = this.getDocument(uri);
    if (!doc) {
      return [];
    }

    const text = doc.getText();
    try {
      const formatted = await formatTemplateFile(text);
      return computeEdits(doc, formatted);
    } catch {
      return [];
    }
  }

  public getSemanticTokens(uri: string): SemanticTokens {
    if (this.disposed) {
      return { data: [] };
    }
    const fileType = getFileType(uri);
    if (fileType !== "*.xml") {
      return { data: [] };
    }

    const templateFile = this.templateFiles.get(uri);
    if (!templateFile?.project) {
      return { data: [] };
    }

    const doc = this.getDocument(uri);
    if (!doc) {
      return { data: [] };
    }
    return computeSemanticTokens(doc);
  }

  public getCompletionItems(uri: string, position: Position): CompletionItem[] {
    if (this.disposed) {
      return [];
    }
    const fileType = getFileType(uri);
    if (fileType !== "*.xml") {
      return [];
    }

    const templateFile = this.templateFiles.get(uri);
    if (!templateFile?.project) {
      return [];
    }

    const doc = this.getDocument(uri);
    if (!doc) {
      return [];
    }

    const offset = doc.offsetAt(position);
    const project = templateFile.project;

    const pathToOldContent: { [path: string]: string } = {};
    for (const [relPath, file] of project.templateFiles) {
      pathToOldContent[relPath] = file.content.content;
    }

    const relPath = templateFile.relativePath ?? project.getRelativePath(uri);
    if (!relPath) {
      return [];
    }

    const result = getCompletionItems({
      newContent: doc.getText(),
      path: relPath,
      pathToOldContent,
      position: offset,
      cache: project.compilationResult,
      patchBase: project.patchBaseOrNull,
    });

    if (!result || result.suggestions.length === 0) {
      return [];
    }

    const startPos = doc.positionAt(result.span.start);
    const endPos = doc.positionAt(result.span.end);
    const range = { start: startPos, end: endPos };

    return result.suggestions.map((suggestion, index) => ({
      label: suggestion,
      kind: CompletionItemKind.Property,
      textEdit: TextEdit.replace(range, suggestion),
      sortText: String(index).padStart(5, "0"),
    }));
  }

  private findTargetDefinition(
    project: Project,
    uri: string,
    offset: number,
  ): { targetDef: TextSpan; allLinks: readonly DefinitionLink[] } | null {
    let compilationResult = project.compilationResult;
    if (!compilationResult) {
      compilationResult = project.compile();
    }

    const allLinks: DefinitionLink[] = [];
    for (const links of Object.values(
      compilationResult.pathToDefinitionLinks,
    )) {
      allLinks.push(...links);
    }

    const templateFile = project.getTemplateFile(uri);
    const relPath = templateFile?.relativePath ?? project.getRelativePath(uri);
    if (!relPath) {
      return null;
    }

    // 1. Check if the offset falls within any reference in pathToDefinitionLinks
    const fileLinks = compilationResult.pathToDefinitionLinks[relPath] ?? [];
    for (const link of fileLinks) {
      if (
        link.reference.path === relPath &&
        link.reference.start <= offset &&
        offset <= link.reference.end
      ) {
        return { targetDef: link.definition, allLinks };
      }
    }

    // 2. Check if the offset falls within any definition declared in this file
    for (const link of allLinks) {
      if (
        link.definition.path === relPath &&
        link.definition.start <= offset &&
        offset <= link.definition.end
      ) {
        return { targetDef: link.definition, allLinks };
      }
    }

    return null;
  }

  public getDefinition(uri: string, position: Position): Location | null {
    if (this.disposed) {
      return null;
    }
    const fileType = getFileType(uri);
    if (fileType !== "*.xml") {
      return null;
    }

    const templateFile = this.templateFiles.get(uri);
    if (!templateFile?.project) {
      return null;
    }

    const doc = this.getDocument(uri);
    if (!doc) {
      return null;
    }

    const offset = doc.offsetAt(position);
    const project = templateFile.project;
    const match = this.findTargetDefinition(project, uri, offset);
    if (!match) {
      return null;
    }

    const range = project.spanToRange(match.targetDef, this.getDocument);
    if (!range) {
      return null;
    }

    const targetTemplateFile = project.getTemplateFile(match.targetDef.path);
    const targetUri = targetTemplateFile?.uri ?? match.targetDef.path;

    return {
      uri: targetUri,
      range,
    };
  }

  public getReferences(
    uri: string,
    position: Position,
    context?: ReferenceContext,
  ): Location[] | null {
    if (this.disposed) {
      return null;
    }
    const fileType = getFileType(uri);
    if (fileType !== "*.xml") {
      return null;
    }

    const templateFile = this.templateFiles.get(uri);
    if (!templateFile?.project) {
      return null;
    }

    const doc = this.getDocument(uri);
    if (!doc) {
      return null;
    }

    const offset = doc.offsetAt(position);
    const project = templateFile.project;
    const match = this.findTargetDefinition(project, uri, offset);
    if (!match) {
      return [];
    }

    const { targetDef, allLinks } = match;
    const locations: Location[] = [];
    const seenSpans = new Set<string>();

    const addSpanLocation = (span: Span): void => {
      const key = `${span.path}:${span.start}:${span.end}`;
      if (seenSpans.has(key)) return;
      seenSpans.add(key);

      const range = project.spanToRange(span, this.getDocument);
      if (range) {
        const targetTemplateFile = project.getTemplateFile(span.path);
        locations.push({
          uri: targetTemplateFile?.uri ?? span.path,
          range,
        });
      }
    };

    if (context?.includeDeclaration !== false) {
      addSpanLocation(targetDef);
    }

    for (const link of allLinks) {
      if (
        link.definition.path === targetDef.path &&
        link.definition.start === targetDef.start &&
        link.definition.end === targetDef.end
      ) {
        addSpanLocation(link.reference);
      }
    }

    return locations;
  }

  public renameSymbol(
    uri: string,
    position: Position,
    newName: string,
  ): WorkspaceEdit | null {
    if (this.disposed) {
      return null;
    }
    const fileType = getFileType(uri);
    if (fileType !== "*.xml") {
      return null;
    }

    const templateFile = this.templateFiles.get(uri);
    if (!templateFile?.project) {
      return null;
    }

    const doc = this.getDocument(uri);
    if (!doc) {
      return null;
    }

    const offset = doc.offsetAt(position);
    const project = templateFile.project;
    const match = this.findTargetDefinition(project, uri, offset);
    if (!match) {
      return null;
    }

    const { targetDef, allLinks } = match;
    const spansToRename: Span[] = [targetDef];

    for (const link of allLinks) {
      if (
        link.definition.path === targetDef.path &&
        link.definition.start === targetDef.start &&
        link.definition.end === targetDef.end
      ) {
        spansToRename.push(link.reference);
      }
    }

    const spansByPath = new Map<string, Span[]>();
    for (const span of spansToRename) {
      let list = spansByPath.get(span.path);
      if (!list) {
        list = [];
        spansByPath.set(span.path, list);
      }
      list.push(span);
    }

    const changes: { [uri: string]: TextEdit[] } = {};

    for (const [filePath, spans] of spansByPath) {
      const seen = new Set<string>();
      const edits: TextEdit[] = [];

      for (const span of spans) {
        const key = `${span.start}:${span.end}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const range = project.spanToRange(span, this.getDocument);
        if (range) {
          edits.push(TextEdit.replace(range, newName));
        }
      }

      if (edits.length > 0) {
        const targetTemplateFile = project.getTemplateFile(filePath);
        const targetUri = targetTemplateFile?.uri ?? filePath;
        changes[targetUri] = edits;
      }
    }

    return { changes };
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
    options.connection ??
    (process.argv
      .slice(2)
      .some(
        (arg) =>
          arg === "--node-ipc" ||
          arg === "--stdio" ||
          arg.startsWith("--socket") ||
          arg.startsWith("--pipe"),
      )
      ? createConnection(ProposedFeatures.all)
      : createConnection(ProposedFeatures.all, process.stdin, process.stdout));
  const documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument,
  );

  const extension = new TypePromptLanguageExtension(
    (uri, diagnostics) => connection.sendDiagnostics({ uri, diagnostics }),
    (uri) => documents.get(uri),
  );

  let hasWorkspaceFolderCapability = false;

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    const capabilities = params.capabilities;
    hasWorkspaceFolderCapability = !!capabilities.workspace?.workspaceFolders;

    const folders = params.workspaceFolders?.map((f) => f.uri) ?? [];
    if (folders.length > 0) {
      extension.setWorkspaceFolders(folders);
    }
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
        documentFormattingProvider: true,
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: ["<", " ", '"', ":", "/", ".", ">"],
        },
        semanticTokensProvider: {
          legend: semanticTokensLegend,
          full: true,
        },
        definitionProvider: true,
        referencesProvider: true,
        renameProvider: true,
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
        for (const folder of event.added) {
          extension.addWorkspaceFolder(folder.uri);
        }
        for (const folder of event.removed) {
          extension.removeWorkspaceFolder(folder.uri);
        }
        void extension.runScan();
      });
    }

    try {
      await extension.runScan();
    } catch {
      // Ignored
    }
    extension.scheduleScanLoop();
  });

  connection.onDidChangeWatchedFiles(async () => {
    await extension.runGarbageCollection();
    await extension.runScan();
  });

  documents.onDidChangeContent((change) => {
    const text = change.document.getText();
    extension.setFileContent(change.document.uri, {
      content: text,
      lineFinder: createLineFinder(text),
      lastModified: Date.now(),
    });
  });

  documents.onDidClose(async (event) => {
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

  connection.onDocumentFormatting(
    async (params: DocumentFormattingParams): Promise<TextEdit[]> => {
      return extension.formatDocument(params.textDocument.uri);
    },
  );

  connection.languages.semanticTokens.on(
    (params: SemanticTokensParams): SemanticTokens => {
      return extension.getSemanticTokens(params.textDocument.uri);
    },
  );

  connection.onCompletion((params: CompletionParams): CompletionItem[] => {
    return extension.getCompletionItems(
      params.textDocument.uri,
      params.position,
    );
  });

  connection.onDefinition((params: DefinitionParams): Location | null => {
    return extension.getDefinition(params.textDocument.uri, params.position);
  });

  connection.onReferences((params: ReferenceParams): Location[] | null => {
    return extension.getReferences(
      params.textDocument.uri,
      params.position,
      params.context,
    );
  });

  connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
    return extension.renameSymbol(
      params.textDocument.uri,
      params.position,
      params.newName,
    );
  });

  connection.onShutdown(() => {
    extension.dispose();
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
