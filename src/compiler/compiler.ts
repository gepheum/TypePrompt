import { Schema } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import { checkNoAmbiguity } from "../util/casing.js";
import { InternalError } from "../util/common-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type {
  CompilationResult,
  Meta,
  Namespace,
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
  cache: CompilationResult | null,
): CompilationResult {
  const result = new CompilationResultImpl();

  for (const [path, content] of Object.entries(pathToContent)) {
    const cachedFile = cache?.sourceFiles[path];
    let outSourceFile: SourceFileParseResult;
    if (cachedFile && cachedFile.content === content) {
      outSourceFile = cachedFile;
    } else {
      outSourceFile = parseSourceFile(path, content);
    }
    result.sourceFiles[path] = outSourceFile;
  }

  result.validate(cache);

  return result;
}

function parseSourceFile(path: string, content: string): SourceFileParseResult {
  const result = new SourceFileParseResultImpl(path, content);

  const xmlDocument = parseXmlDocument(content);
  if (xmlDocument.kind === "error") {
    return result;
  }

  for (const topLevelNode of xmlDocument.root.topLevelNodes) {
    switch (topLevelNode.kind) {
      case "element": {
        switch (topLevelNode.tag.text) {
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
        break;
      }
      case "text": {
        if (!topLevelNode.allWhitespace) {
          result.parseErrors.push({
            span: topLevelNode,
            message: "Unexpected text at the top level",
          });
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
  ) {}

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

class CompilationResultImpl implements CompilationResult {
  readonly sourceFiles: { [path: string]: SourceFileParseResult } = {};
  meta: SchemaOrError = EMPTY_SCHEMA;
  readonly namespaces: { [name: string]: SchemaOrError } = {};
  readonly templates: { [id: string]: TemplateValidationResult } = {};
  readonly validationErrors: { [path: string]: InternalError[] } = {};

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
    }

    this.resolveMeta(metas, cache);
    this.resolveNamespaces(namespaces, cache);
    this.resolveTemplates(templates, cache);
  }

  private resolveMeta(
    metas: ReadonlyArray<Sourced<Meta>>,
    cache: CompilationResult | null,
  ): void {
    switch (metas.length) {
      case 0: {
        // No <meta> elements found. Not an error.
        this.meta = EMPTY_SCHEMA;
        break;
      }
      case 1: {
        // Validate the single <meta> element.
        const meta = metas[0]!;
        if (meta.cached && cache && cache.meta.kind !== "other-error") {
          // Reuse the cached schema validation result.
          this.meta = cache.meta;
        } else {
          const { typeDeclarations } = meta.element.schema;
          this.meta = validateSchema(typeDeclarations, { kind: "meta" });
        }
        if (this.meta.kind === "error") {
          const { path } = meta.sourceFile;
          this.getValidationErrors(path).push(...this.meta.errors);
        }
        break;
      }
      default: {
        // Multiple <meta> elements found. This is an error.
        for (const meta of metas) {
          this.getValidationErrors(meta.sourceFile.path).push({
            span: meta.element.tag,
            message: "Multiple <meta> elements found",
          });
        }
        this.meta = { kind: "other-error" };
      }
    }
  }

  private resolveNamespaces(
    namespaces: ReadonlyArray<Sourced<Namespace>>,
    cache: CompilationResult | null,
  ): void {
    // Organize namespaces by name.
    const namespacesByName: { [name: string]: Sourced<Namespace>[] } = {};
    for (const namespace of namespaces) {
      const name = namespace.element.name.text;
      (namespacesByName[name] ??= []).push(namespace);
    }

    const resolveNamespace = (namespace: Sourced<Namespace>): void => {
      const name = namespace.element.name.text;
      let schema: SchemaOrError | undefined;
      if (namespace.cached && cache) {
        const cachedSchema = cache.namespaces[namespace.element.name.text]!;
        if (cachedSchema && cachedSchema.kind !== "other-error") {
          schema = cachedSchema;
        }
      }
      if (!schema) {
        schema = validateSchema(namespace.element.schema.typeDeclarations, {
          kind: "namespace",
        });
      }
      this.namespaces[name] = schema;
      if (schema.kind === "error") {
        const { path } = namespace.sourceFile;
        this.getValidationErrors(path).push(...schema.errors);
      }
    };

    for (const [name, namespaces] of Object.entries(namespacesByName)) {
      if (namespaces.length === 1) {
        resolveNamespace(namespaces[0]!);
      } else {
        // Multiple namespaces with the same name found. This is an error.
        this.namespaces[name] = { kind: "other-error" };
        // Errors will be pused to the validationErrors map below.
      }
    }

    this.namespaces["Default"] ??= EMPTY_SCHEMA;

    const ambiguityErrors = checkNoAmbiguity(
      Object.values(namespaces).map((n) => ({
        ...n.element.name,
        path: n.sourceFile.path,
      })),
      {
        exactMatchIsConflict: false,
      },
    );
    for (const error of ambiguityErrors) {
      this.getValidationErrors(error.span.path).push(error);
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
      const ambiguityErrors = checkNoAmbiguity(
        Object.values(templates).map((t) => ({
          ...t.element.name,
          path: t.sourceFile.path,
        })),
        {
          exactMatchIsConflict: false,
        },
      );
      for (const error of ambiguityErrors) {
        this.getValidationErrors(error.span.path).push(error);
      }
    }

    if (this.meta.kind !== "success") {
      return;
    }

    for (const [id, templates] of Object.entries(idToTemplates)) {
      if (templates.length !== 1) {
        // The error was already reported in the ambiguity check above.
        continue;
      }
      const template = templates[0]!;

      const namespaceName = template.element.namespace?.text ?? "Default";
      const namespace = this.namespaces[namespaceName];
      if (!namespace) {
        this.getValidationErrors(template.sourceFile.path).push({
          span: template.element.name,
          message: `Namespace '${namespaceName}' not found`,
        });
        continue;
      } else if (namespace.kind !== "success") {
        continue;
      }

      let validationResult: TemplateValidationResult;
      if (
        template.cached &&
        this.meta === cache?.meta &&
        namespace === cache?.namespaces[namespaceName]
      ) {
        // Reuse the cached schema validation result.
        validationResult = cache!.templates[id]!;
      } else {
        validationResult = validateTemplate({
          template: template.element,
          metaSchema: this.meta,
          namespaceSchema: namespace,
        });
      }

      this.templates[id] = validationResult;

      if (validationResult.kind === "error") {
        this.getValidationErrors(template.sourceFile.path).push(
          ...validationResult.errors,
        );
      }
    }
  }

  private getValidationErrors(path: string): InternalError[] {
    return (this.validationErrors[path] ??= []);
  }
}

const EMPTY_SCHEMA: Schema = {
  kind: "success",
  typeDeclarations: {},
  identifiers: new Set(),
  unionToMembers: new Map(),
  typeToNamingHint: new Map(),
} as const;
