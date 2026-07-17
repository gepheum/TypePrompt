import { InternalError, InternalErrors } from "../util/error-types.js";
import { XmlDocument } from "../xml/xml-types.js";

export type CompilationResult = {
  readonly pathToErrors: {readonly [path: string]: readonly InternalError[]};
  readonly sourceFiles: {readonly [path: string]: SourceFile};
};

export type SourceFile = {
  readonly path: string;
  readonly content: string;
  readonly xmlDocument: XmlDocument | InternalErrors;
};
