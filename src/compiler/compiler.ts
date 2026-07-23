import { Schema, SchemaParseResult } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import { InternalError } from "../util/common-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type {
  CompilationResult,
  Meta,
  Namespace,
  SchemaOrError,
  SourceFileParseResult,
  Template,
} from "./compiler-types.js";
import { parseMeta } from "./meta-parser.js";
import { parseNamespace } from "./namespace-parser.js";
import { parseTemplate } from "./template-parser.js";

export function compile(
  pathToContent: { readonly [path: string]: string },
  cache: CompilationResult | null,
): CompilationResult {
  const impl = new CompilationResultImpl();

  for (const [path, content] of Object.entries(pathToContent)) {
    const cachedFile = cache?.sourceFiles[path];
    let outSourceFile: SourceFileParseResult;
    if (cachedFile && cachedFile.content === content) {
      outSourceFile = cachedFile;
    } else {
      outSourceFile = parseSourceFile(path, content);
    }
    impl.sourceFiles[path] = outSourceFile;
  }

  impl.validate(cache);

  return impl;
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

class SourceFileParseResultImpl {
  constructor(
    readonly path: string,
    readonly content: string,
  ) {}

  readonly templates: Template[] = [];
  readonly namespaces: Namespace[] = [];
  readonly schemas: SchemaParseResult[] = [];
  readonly metas: Meta[] = [];

  readonly parseErrors: InternalError[] = [];
}

type Sourced<T> = {
  readonly element: T;
  readonly sourceFile: SourceFileParseResult;
  /** True if the source file was copied from the cache. */
  readonly cached: boolean;
};

class CompilationResultImpl {
  readonly sourceFiles: { [path: string]: SourceFileParseResult } = {};
  meta: SchemaOrError = EMPTY_SCHEMA;
  readonly namespaces: { [name: string]: SchemaOrError } = {};
  readonly templates: { [id: string]: SchemaOrError } = {};
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

    // Resolve workspace's meta.
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
