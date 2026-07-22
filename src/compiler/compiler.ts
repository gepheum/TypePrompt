import { SchemaParseResult } from "../schema/schema-types.js";
import { InternalError } from "../util/common-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type {
  CompilationResult,
  Meta,
  Namespace,
  SourceFile,
  Template,
  TemplateResult,
} from "./compiler-types.js";

function parseSourceFile(
  path: string,
  content: string,
): SourceFileParseResult {
  const result = new SourceFileParseResultImpl(path, content);

  const xmlDocument = parseXmlDocument(content);
  if (xmlDocument.kind === "error") {
    return result;
  }

  for (const topLevelNode of xmlDocument.root.topLevelNodes) {

  }
}

export function compile(
  pathToContent: { readonly [path: string]: string },
  cache: CompilationResult | null,
): CompilationResult {
  const builder = new CompilationResultBuilder();

  for (const [path, content] of Object.entries(pathToContent)) {
    const cachedFile = cache?.sourceFiles[path];
    let outSourceFile: SourceFile;
    if (cachedFile && cachedFile.content === content) {
      outSourceFile = cachedFile;
    } else {
      const xmlDocument = parseXmlDocument(content);
      outSourceFile = { path, content, xmlDocument };
    }
    builder.sourceFiles[path] = outSourceFile;
    if (outSourceFile.xmlDocument.kind === "error") {
      const errors = (builder.pathToErrors[path] ??= []);
      errors.push(...outSourceFile.xmlDocument.errors);
    }
  }

  return builder.build();
}

class SourceFileParseResultImpl {
  constructor(
    readonly path: string,
    readonly content: string,
  ) {}

  readonly templates: Template[] = [];
  readonly namespaces: Namespace[] = [];
  readonly schemas: readonly SchemaParseResult[] = [];
  readonly metas: readonly Meta[] = [];

  readonly parseErrors: readonly InternalError[] = [];
}
