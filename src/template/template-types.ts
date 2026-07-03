import type { Schema } from "../schema/schema-types.js";
import { ElementNode } from "../xml/xml-parser.js";

export type Templates = {
  readonly kind: "success";
  readonly meta: Schema | null;
  readonly namespaces: readonly TemplateNamespace[];
};

export type TemplateNamespace = {
  readonly namespace: string;
  readonly templates: readonly ResolvedTemplate[];
};

export type ResolvedTemplate = {
  readonly name: string;
  readonly namespace: string;
  readonly meta: { [property: string]: boolean | number | string };
  readonly schema: ResolvedSchema;
  readonly args: readonly TemplateArg[];
  readonly content: TemplateContent;
  readonly xmlContent: string;
};

export type Template = {
  readonly name: string;
  readonly namespace: string;
  readonly metaNode: ElementNode | null;
  readonly schema: Schema;
  readonly args: readonly TemplateArg[];
  readonly content: TemplateContent;
  readonly xmlContent: string;
};

export type TemplateContent = 
  | {
      readonly kind: "no-variants";
      readonly body: readonly TemplatePiece[];
    }
  | {
      readonly kind: "variants";
      readonly bodies: { [variant: string]: readonly TemplatePiece[] };
    };

export type TemplateArg = {
  readonly name: string;
  readonly typeName: string | null;
  readonly doc: string;
};

export type TemplatePiece =
  | {
      readonly kind: "text";
      readonly text: string;
    }
  | {
      readonly kind: "arg";
      readonly name: string;
      /** Can only contain whitespaces. */
      readonly indent: string;
      readonly format: "json" | "toon" | null;
    };

/** Result of parsing a single template file. */
export type TemplateFileParseResult = {
  readonly kind: "success";
  readonly path: string;
  readonly templates: readonly Template[];
  readonly metas: readonly Schema[];
};

export type TemplateParseErrors = {
  readonly kind: "error";
  readonly errors: readonly TemplateParseError[];
};

export type TemplateParseError = {
  readonly path: string;
  readonly message: string;
  readonly startPosition: Position;
  readonly endPosition: Position;
};

/** Position in a source file. */
export type Position = {
  /** UTF-16 offset */
  readonly offset: number;
  readonly position: {
    readonly line: string;
    /** 1-based */
    readonly lineNumber: number;
    /** 1-based codepoint offset (not UTF-16 offset) */
    readonly columnNumber: number;
  };
};

export type SourceFile = {
  readonly path: string;
  readonly content: string;
};

// =============================================================================
// RESOLVED SCHEMA
// =============================================================================

export type ResolvedSchema = {
  readonly types: readonly ResolvedTypeDeclaration[];
};

export type ResolvedTypeDeclaration =
  | ResolvedInterface
  | ResolvedStringUnion
  | ResolvedInterfaceUnion;

export type ResolvedInterface = {
  readonly kind: "interface";
  /**
   * Guaranteed to be non-empty.
   * The first element is always an uppercased type name used in a type declaration.
   * The remaining elements are lowercased field names.
   */
  readonly namePieces: readonly string[];
  readonly doc: string;
  readonly fields: readonly ResolvedField[];
};

export type ResolvedStringUnion = {
  readonly kind: "string-union";
  /**
   * Guaranteed to be non-empty.
   * The first element is always an uppercased type name used in a type declaration.
   * The remaining elements are lowercased field names.
   */
  readonly namePieces: readonly string[];
  readonly doc: string;
  readonly values: readonly string[];
};

export type ResolvedInterfaceUnion = {
  readonly kind: "interface-union";
  /**
   * Guaranteed to be non-empty.
   * The first element is always an uppercased type name used in a type declaration.
   * The remaining elements are lowercased field names.
   */
  readonly namePieces: readonly string[];
  readonly doc: string;
  readonly members: ReadonlyArray<{
    readonly kind: string;
    readonly namePieces: readonly string[];
  }>;
  readonly kindFieldName: string;
};

export type ResolvedField = {
  readonly name: string;
  readonly doc: string;
  readonly type: ResolvedType;
  readonly optional: boolean;
}

export type ResolvedType =
  | { readonly kind: "ref"; readonly namePieces: readonly string[] }
  | { readonly kind: "primitive"; readonly primitive:
    | "string"
  | "number"
  | "boolean"
  | "int" }
  | { readonly kind: "array"; readonly name: ResolvedType };
