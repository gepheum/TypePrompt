import { EMPTY_SCHEMA } from "../schema/empty-schema.js";
import { checkNameConflicts } from "../util/casing.js";
import { createLineFinder, LineFinderData } from "../util/line-finder.js";
import { InternalError } from "../util/shared-types.js";
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
} from "./compiler-types.js";
import { parseMeta } from "./meta-parser.js";
import { parseNamespace } from "./namespace-parser.js";
import { parseTemplate } from "./template-parser.js";
import { validateTemplate } from "./template-validator.js";

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
    return result;
  }

  const topLevelNodes = checkAllAreElements(
    xmlDocument.root.topLevelNodes,
    ["template", "namespace", "meta"] as const,
    " at the top level",
    result.parseErrors,
  );
  for (const [tag, topLevelNode] of topLevelNodes) {
    switch (tag) {
      case "template": {
        const template = parseTemplate(topLevelNode);
        if (template.kind === "error") {
          result.parseErrors.push(...template.errors);
        } else {
          result.templates.push(template);
        }
        break;
      }
      case "namespace": {
        const namespace = parseNamespace(topLevelNode);
        if (namespace.kind === "error") {
          result.parseErrors.push(...namespace.errors);
        } else {
          result.namespaces.push(namespace);
        }
        break;
      }
      case "meta": {
        const meta = parseMeta(topLevelNode);
        if (meta.kind === "error") {
          result.parseErrors.push(...meta.errors);
        } else {
          result.metas.push(meta);
        }
        break;
      }
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
  readonly namespaces: Namespace[] = [];
  readonly metas: Meta[] = [];

  readonly parseErrors: InternalError[] = [];
}

type Sourced<T> = {
  readonly element: T;
  readonly sourceFile: SourceFileParseResult;
  /** True if the source file was copied from the cache. */
  readonly cached: boolean;
};

type NamespaceResultImpl = NamespaceResult & {
  readonly templates: TemplateValidationResult[];
};

class CompilationResultImpl implements CompilationResult {
  readonly sourceFiles: { [path: string]: SourceFileParseResult } = {};
  metaSchema: SchemaOrError = EMPTY_SCHEMA;
  readonly namespaces: { [name: string]: NamespaceResultImpl } = {};
  readonly templates: { [id: string]: TemplateValidationResult } = {};
  readonly finalErrors: { [path: string]: InternalError[] } = {};

  validate(cache: CompilationResult | null): void {
    const metas: Array<Sourced<Meta>> = [];
    const namespaces: Array<Sourced<Namespace>> = [];
    const templates: Array<Sourced<Template>> = [];
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
      this.finalErrors[sourceFile.path] = [...sourceFile.parseErrors];
    }

    this.resolveMeta(metas);
    this.resolveNamespaces(namespaces);
    this.resolveTemplates(templates, cache);
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
          schema: namespace.element.schema,
          templates: [],
        };
      } else {
        // Multiple namespaces with the same name found. This is an error.
        this.namespaces[name] = { schema: { kind: "other-error" }, templates: [] };
        // Errors will be pused to the finalErrors map below.
      }
    }

    this.namespaces["Default"] ??= { schema: EMPTY_SCHEMA, templates: [] };

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

  private resolveTemplates(
    templates: ReadonlyArray<Sourced<Template>>,
    cache: CompilationResult | null,
  ): void {
    const namespaceToTemplates: { [namespace: string]: Sourced<Template>[] } =
      {};
    const idToTemplates: { [namespace: string]: Sourced<Template>[] } = {};
    for (const template of templates) {
      const namespace = template.element.namespace?.text ?? "Default";
      (namespaceToTemplates[namespace] ??= []).push(template);
      const id = `${namespace}.${template.element.name.text}`;
      (idToTemplates[id] ??= []).push(template);
    }

    for (const templates of Object.values(namespaceToTemplates)) {
      const nameConflicts = checkNameConflicts(
        Object.values(templates).map((t) => ({
          ...t.element.name,
          path: t.sourceFile.path,
        })),
      );
      for (const error of nameConflicts) {
        this.finalErrors[error.span.path]!.push(error);
      }
    }

    if (this.metaSchema.kind !== "success") {
      return;
    }

    for (const [id, templates] of Object.entries(idToTemplates)) {
      if (templates.length !== 1) {
        // The error was already reported in the name conflicts check above.
        continue;
      }
      const template = templates[0]!;

      const namespaceName = template.element.namespace?.text ?? "Default";
      const namespace = this.namespaces[namespaceName];
      if (!namespace) {
        this.finalErrors[template.sourceFile.path]!.push({
          span: template.element.name,
          message: `Namespace '${namespaceName}' not found`,
          suggestions: Object.keys(this.namespaces),
        });
        continue;
      } else if (namespace.schema.kind !== "success") {
        continue;
      }

      let validationResult: TemplateValidationResult;
      if (
        template.cached &&
        this.metaSchema === cache?.metaSchema &&
        namespace === cache?.namespaces[namespaceName]
      ) {
        // Reuse the cached schema validation result.
        validationResult = cache!.templates[id]!;
      } else {
        validationResult = validateTemplate({
          template: template.element,
          metaSchema: this.metaSchema,
          namespaceSchema: namespace.schema,
        });
      }

      this.templates[id] = validationResult;

      if (validationResult.kind === "success") {
        namespace.templates.push(validationResult);
      } else if (validationResult.kind === "error") {
        this.finalErrors[template.sourceFile.path]!.push(
          ...validationResult.errors,
        );
      }
    }
  }
}
