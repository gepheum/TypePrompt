import { InternalError } from "../util/error-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type {
  CompilationResult,
  SourceFile,
  Template,
} from "./compiler-types.js";

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

class CompilationResultBuilder {
  readonly pathToErrors: { [path: string]: InternalError[] } = {};
  readonly sourceFiles: { [path: string]: SourceFile } = {};
  readonly xmlSourceToTemplate: { [xmlSource: string]: Template } = {};

  build(): CompilationResult {
    return {
      pathToErrors: this.pathToErrors,
      sourceFiles: this.sourceFiles,
      xmlSourceToTemplate: this.xmlSourceToTemplate,
    };
  }
}
