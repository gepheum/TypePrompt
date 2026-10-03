import { EMPTY_SCHEMA } from "../schema/empty-schema.js";
import { checkNameConflicts } from "../util/casing.js";
import { createLineFinder, LineFinderData } from "../util/line-finder.js";
import type { HasPath, InternalError, TextSpan } from "../util/shared-types.js";
import { checkAllAreElements } from "../xml/xml-node-checker.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type {
  CompilationResult,
  Meta,
  Namespace,
  NamespaceResult,
  SchemaOrError,
  SourceFileParseResult,
  Template,
  TemplateValidationResult,
  Tool,
  ToolValidationResult,
} from "./compiler-types.js";
import { DEFAULT_NAMESPACE } from "./default-namespace.js";
import { parseMeta } from "./meta-parser.js";
import { parseNamespace } from "./namespace-parser.js";
import { parseTemplate } from "./template-parser.js";
import { validateTemplate } from "./template-validator.js";
import { parseTool } from "./tool-parser.js";
import { validateTool } from "./tool-validator.js";

export function compile(
  pathToContent: { readonly [path: string]: string },
  options: { readonly cache: CompilationResult | null },
): CompilationResult {
  const result = new CompilationResultImpl();

  for (const [path, content] of Object.entries(pathToContent)) {
    const cachedFile = options.cache?.sourceFiles[path];
    let outSourceFile: SourceFileParseResult;
    if (cachedFile && cachedFile.content === content) {
      outSourceFile = cachedFile;
    } else {
      outSourceFile = parseSourceFile(path, content);
    }
    result.sourceFiles[path] = outSourceFile;
  }

  result.validate(options.cache);

  return result;
}

function parseSourceFile(path: string, content: string): SourceFileParseResult {
  const result = new SourceFileParseResultImpl(path, content);

  const xmlDocument = parseXmlDocument(content);
  if (xmlDocument.kind === "error") {
    result.parseErrors.push(...xmlDocument.errors);
    if (
      xmlDocument.root === null ||
      (xmlDocument.root.closingTag === undefined &&
        !xmlDocument.root.isSelfClosing)
    ) {
      return result;
    }
  }
  const root = xmlDocument.root;
  if (root === null) {
    return result;
  }
  const topLevelNodes = checkAllAreElements(
    [root],
    ["template", "tool", "namespace", "meta"] as const,
    " at the top level",
    result.parseErrors,
  );
  if (topLevelNodes.length <= 0) {
    return result;
  }
  const [tag, topLevelNode] = topLevelNodes[0]!;
  switch (tag) {
    case "template": {
      const template = parseTemplate(topLevelNode, path);
      if (template.kind === "error") {
        result.parseErrors.push(...template.errors);
      } else {
        result.templates.push(template);
        result.warnings.push(...template.warnings);
      }
      break;
    }
    case "tool": {
      const tool = parseTool(topLevelNode, path);
      if (tool.kind === "error") {
        result.parseErrors.push(...tool.errors);
      } else {
        result.tools.push(tool);
        result.warnings.push(...tool.warnings);
      }
      break;
    }
    case "namespace": {
      const namespace = parseNamespace(topLevelNode, path);
      if (namespace.kind === "error") {
        result.parseErrors.push(...namespace.errors);
      } else {
        result.namespaces.push(namespace);
        if (namespace.schema.kind === "error") {
          result.parseErrors.push(...namespace.schema.errors);
        }
        result.warnings.push(...namespace.warnings);
      }
      break;
    }
    case "meta": {
      const meta = parseMeta(topLevelNode, path);
      if (meta.kind === "error") {
        result.parseErrors.push(...meta.errors);
      } else {
        result.metas.push(meta);
        if (meta.schema.kind === "error") {
          result.parseErrors.push(...meta.schema.errors);
        }
        result.warnings.push(...meta.warnings);
      }
      break;
    }
  }

  return result;
}

class SourceFileParseResultImpl implements SourceFileParseResult {
  constructor(
    readonly path: string,
    readonly content: string,
  ) {
    this.lineFinder = createLineFinder(content);
  }

  readonly lineFinder: LineFinderData;
  readonly templates: Template[] = [];
  readonly tools: Tool[] = [];
  readonly namespaces: Namespace[] = [];
  readonly metas: Meta[] = [];

  readonly parseErrors: InternalError[] = [];
  readonly warnings: InternalError[] = [];
}

type Sourced<T> = {
  readonly element: T;
  readonly sourceFile: SourceFileParseResult;
  /** True if the source file was copied from the cache. */
  readonly cached: boolean;
};

type NamespaceResultImpl = NamespaceResult & {
  readonly tools: { [name: string]: ToolValidationResult };
  readonly templates: TemplateValidationResult[];
  /** To find conflicts. */
  readonly names: (TextSpan & HasPath)[];
};

class CompilationResultImpl implements CompilationResult {
  readonly sourceFiles: { [path: string]: SourceFileParseResult } = {};
  metaSchema: SchemaOrError = EMPTY_SCHEMA;
  readonly namespaces: { [name: string]: NamespaceResultImpl } = {};
  singleNamespace: NamespaceResultImpl | null = null;
  readonly templates: { [id: string]: TemplateValidationResult } = {};
  readonly tools: { [id: string]: ToolValidationResult } = {};
  readonly finalErrors: { [path: string]: InternalError[] } = {};
  anyErrors = false;
  readonly warnings: { [path: string]: InternalError[] } = {};

  validate(cache: CompilationResult | null): void {
    const metas: Array<Sourced<Meta>> = [];
    const namespaces: Array<Sourced<Namespace>> = [];
    const templates: Array<Sourced<Template>> = [];
    const tools: Array<Sourced<Tool>> = [];
    for (const sourceFile of Object.values(this.sourceFiles)) {
      const cached = cache?.sourceFiles[sourceFile.path] === sourceFile;
      const source = <T>(element: T): Sourced<T> => ({
        element,
        sourceFile,
        cached,
      });
      metas.push(...sourceFile.metas.map(source));
      namespaces.push(...sourceFile.namespaces.map(source));
      templates.push(...sourceFile.templates.map(source));
      tools.push(...sourceFile.tools.map(source));
      this.finalErrors[sourceFile.path] = [...sourceFile.parseErrors];
      this.warnings[sourceFile.path] = [...sourceFile.warnings];
    }

    this.resolveMeta(metas);
    this.resolveNamespaces(namespaces);
    this.resolveTools(tools, cache);
    this.resolveTemplates(templates, cache);
    this.checkNameConflictsWithinNamespaces();

    {
      // Remove the default namespace if it doesn't contain any schema,
      // templates or tools.
      const defaultNamespace = this.namespaces[DEFAULT_NAMESPACE]!;
      const isEmpty =
        defaultNamespace.schema.kind === "success" &&
        defaultNamespace.templates.length <= 0 &&
        Object.keys(defaultNamespace.tools).length <= 0 &&
        Object.keys(defaultNamespace.names).length <= 0;
      if (isEmpty) {
        delete this.namespaces[DEFAULT_NAMESPACE];
      }
    }

    const namespaceResults = Object.values(this.namespaces);
    if (namespaceResults.length === 1) {
      const singleNamespace = namespaceResults[0]!;
      if (singleNamespace.name === DEFAULT_NAMESPACE) {
        this.singleNamespace = singleNamespace;
      }
    }

    this.anyErrors = Object.values(this.finalErrors).some(
      (errors) => errors.length >= 1,
    );
  }

  private resolveMeta(metas: ReadonlyArray<Sourced<Meta>>): void {
    if (metas.length <= 1) {
      this.metaSchema = metas[0]?.element.schema ?? EMPTY_SCHEMA;
    } else {
      // Multiple <meta> elements found. This is an error.
      for (const meta of metas) {
        this.finalErrors[meta.sourceFile.path]!.push({
          span: meta.element.tag,
          message: "Multiple <meta> elements found",
        });
      }
      this.metaSchema = { kind: "other-error" };
    }
  }

  private resolveNamespaces(
    namespaces: ReadonlyArray<Sourced<Namespace>>,
  ): void {
    // Organize namespaces by name.
    const namespacesByName: { [name: string]: Sourced<Namespace>[] } = {};
    for (const namespace of namespaces) {
      const name = namespace.element.name.text;
      (namespacesByName[name] ??= []).push(namespace);
    }

    for (const [name, namespaces] of Object.entries(namespacesByName)) {
      if (namespaces.length === 1) {
        const namespace = namespaces[0]!;
        this.namespaces[name] = {
          name: name,
          schema: namespace.element.schema,
          tools: {},
          templates: [],
          names: [],
        };
      } else {
        // Multiple namespaces with the same name found. This is an error.
        this.namespaces[name] = {
          name: name,
          schema: { kind: "other-error" },
          tools: {},
          templates: [],
          names: [],
        };
        // Errors will be pushed to the finalErrors map below.
      }
    }

    this.namespaces[DEFAULT_NAMESPACE] ??= {
      name: DEFAULT_NAMESPACE,
      schema: EMPTY_SCHEMA,
      tools: {},
      templates: [],
      names: [],
    };

    const nameConflicts = checkNameConflicts(
      Object.values(namespaces).map((n) => ({
        ...n.element.name,
        path: n.sourceFile.path,
      })),
    );
    for (const error of nameConflicts) {
      this.finalErrors[error.span.path]!.push(error);
    }
  }

  private resolveTools(
    tools: ReadonlyArray<Sourced<Tool>>,
    cache: CompilationResult | null,
  ): void {
    const namespaceToTools: { [namespace: string]: Sourced<Tool>[] } = {};
    const idToTools: { [namespace: string]: Sourced<Tool>[] } = {};
    for (const tool of tools) {
      const namespace = tool.element.namespace?.text ?? DEFAULT_NAMESPACE;
      (namespaceToTools[namespace] ??= []).push(tool);
      const id = `${namespace}:${tool.element.name.text}`;
      (idToTools[id] ??= []).push(tool);
    }

    if (this.metaSchema.kind !== "success") return;

    for (const [id, tools] of Object.entries(idToTools)) {
      const tool = tools[0]!;
      const { name } = tool.element;

      const namespaceName = tool.element.namespace?.text ?? DEFAULT_NAMESPACE;
      const namespace = this.namespaces[namespaceName];
      if (!namespace) {
        this.finalErrors[tool.sourceFile.path]!.push({
          span: tool.element.namespace!,
          message: `Namespace '${namespaceName}' not found`,
          suggestions: Object.keys(this.namespaces),
        });
        continue;
      } else if (namespace.schema.kind !== "success") {
        continue;
      }

      for (const tool of tools) {
        namespace.names.push({ ...name, path: tool.sourceFile.path });
      }
      if (tools.length > 1) {
        // The error will be reported when we look for name conflicts in each
        // namespace.
        continue;
      }

      let validationResult: ToolValidationResult;
      if (tool.cached && namespace === cache?.namespaces[namespaceName]) {
        // Reuse the cached schema validation result.
        validationResult = cache!.tools[id]!;
      } else {
        validationResult = validateTool({
          tool: tool.element,
          namespaceSchema: namespace.schema,
        });
      }

      this.tools[id] = validationResult;
      namespace.tools[name.text] = validationResult;

      if (validationResult.kind === "error") {
        this.finalErrors[tool.sourceFile.path]!.push(
          ...validationResult.errors,
        );
      }
    }
  }

  private resolveTemplates(
    templates: ReadonlyArray<Sourced<Template>>,
    cache: CompilationResult | null,
  ): void {
    const namespaceToTemplates: { [namespace: string]: Sourced<Template>[] } =
      {};
    const idToTemplates: { [namespace: string]: Sourced<Template>[] } = {};
    for (const template of templates) {
      const namespace = template.element.namespace?.text ?? DEFAULT_NAMESPACE;
      (namespaceToTemplates[namespace] ??= []).push(template);
      const id = `${namespace}:${template.element.name.text}`;
      (idToTemplates[id] ??= []).push(template);
    }

    for (const [id, templates] of Object.entries(idToTemplates)) {
      const template = templates[0]!;
      const namespaceName =
        template.element.namespace?.text ?? DEFAULT_NAMESPACE;

      const namespace = this.namespaces[namespaceName];
      if (!namespace) {
        this.finalErrors[template.sourceFile.path]!.push({
          span: template.element.namespace!,
          message: `Namespace '${namespaceName}' not found`,
          suggestions: Object.keys(this.namespaces),
        });
        continue;
      } else if (namespace.schema.kind !== "success") {
        continue;
      }

      for (const template of templates) {
        namespace.names.push({
          ...template.element.name,
          path: template.sourceFile.path,
        });
      }
      if (templates.length > 1) {
        // The error will be reported when we look for name conflicts in each
        // namespace.
        continue;
      }

      const tryGetFromCache = (): TemplateValidationResult | null => {
        if (!template.cached) return null;
        if (this.metaSchema !== cache?.metaSchema) return null;
        const cachedNamespace = cache?.namespaces[namespaceName];
        if (namespace !== cachedNamespace) return null;
        const cached = cache.templates[id]!;
        const templateTools =
          cached.kind === "template" ? cached.tools : cachedNamespace.tools;
        let sameTools: boolean;
        if (cached.kind === "template") {
          // Check if the template's tools have changed.
          sameTools = Object.entries(templateTools).every(
            ([name, templateTool]) =>
              templateTool.tool === namespace.tools[name],
          );
        } else {
          // Check if the namespace tools have changed.
          sameTools =
            Object.entries(namespace.tools).every(
              ([name, tool]) => tool === cachedNamespace.tools[name],
            ) &&
            Object.keys(namespace.tools).length ===
              Object.keys(cachedNamespace.tools).length;
        }
        return sameTools ? cached : null;
      };
      const validationResult =
        tryGetFromCache() ??
        validateTemplate({
          template: template.element,
          metaSchema: this.metaSchema,
          namespaceSchema: namespace.schema,
          namespaceTools: namespace.tools,
        });

      this.templates[id] = validationResult;

      if (validationResult.kind === "template") {
        namespace.templates.push(validationResult);
      } else if (validationResult.kind === "error") {
        this.finalErrors[template.sourceFile.path]!.push(
          ...validationResult.errors,
        );
      }
    }
  }

  private checkNameConflictsWithinNamespaces(): void {
    for (const namespace of Object.values(this.namespaces)) {
      const nameConflicts = checkNameConflicts(
        namespace.names.map((n) => ({ ...n, path: n.path })),
      );
      for (const error of nameConflicts) {
        this.finalErrors[error.span.path]!.push(error);
      }
    }
  }
}
