import { SchemaParseResult } from "../schema/schema-types.js";
import { InternalError } from "../util/common-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type {
  CompilationResult,
  Meta,
  Namespace,
  SourceFileParseResult,
  Template,
} from "./compiler-types.js";
import { parseNamespace } from "./namespace-parser.js";
import { parseTemplate } from "./template-parser.js";

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
  readonly schemas: SchemaParseResult[] = [];
  readonly metas: Meta[] = [];

  readonly parseErrors: InternalError[] = [];
}
