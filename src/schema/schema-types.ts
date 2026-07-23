import type { Span, TextSpan } from "../util/common-types.js";

export type SchemaParseResult = {
  readonly kind: "success";
  readonly typeDeclarations: { readonly [name: string]: TypeDeclaration };
};

export type SchemaValidationContext =
  | { readonly kind: "meta" }
  | { readonly kind: "namespace" }
  | { readonly kind: "template" };

export type Schema = {
  readonly kind: "success";
  readonly typeDeclarations: { readonly [name: string]: TypeDeclaration };
  /**
   * Field names and identifiers used in string literals.
   * Does not include types names.
   */
  readonly identifiers: ReadonlySet<string>;
  readonly unionToMembers: ReadonlyMap<Union, UnionMembers>;
  readonly typeToNamingHint: ReadonlyMap<Interface | Union, NamingHint>;
};

export type TypeDeclaration = {
  readonly kind: "type";
  readonly name: TextSpan;
  readonly valueType: Type;
  readonly doc: string;
};

export type SchemaField = {
  readonly name: TextSpan;
  readonly optional: boolean;
  readonly type: Type;
  readonly doc: string;
};

export type Type = TypeName | StringLiteral | Interface | Array | Union;

export type NonUnionType = Exclude<Type, Union>;

export type TypeName = {
  readonly kind: "type-name";
  readonly name: TextSpan;
};

export type StringLiteral = {
  readonly kind: "string-literal";
  readonly value: string;
  readonly quotedName: TextSpan;
};

export type Interface = {
  readonly kind: "interface";
  readonly leftCurlyBracket: Span;
  readonly fields: { readonly [name: string]: SchemaField };
  readonly firstField?: SchemaField;
};

export type Array = {
  readonly kind: "array";
  readonly elementType: Type;
};

export type Union = {
  readonly kind: "union";
  /** Guaranteed to contain 2+ elements. */
  readonly members: NonUnionType[];
};

export type ResolvedType = Exclude<Type, TypeName> | PrimitiveType;

export type PrimitiveType = {
  readonly kind: "primitive";
  readonly primitive: "number" | "string" | "boolean" | "integer";
};

export type SyntheticInterface = {
  readonly name: {
    readonly text: string;
  };
  readonly kind: "synthetic-interface";
  readonly fields: { readonly [name: string]: SchemaField };
};

export type SyntheticSchemaField = {
  readonly name: {
    readonly text: string;
  };
  readonly optional: boolean;
  readonly type: Type;
};

/** Hint for generating a name for an anonymous type in a targeted language. */
export type NamingHint = {
  /**
   * Guaranteed to be non-empty.
   * The first element is always an uppercased type name used in a type declaration.
   * The remaining elements are lowercased field names.
   */
  readonly namePieces: readonly string[];
  readonly doc: string | null;
};

export type UnionMembers =
  | {
      readonly kind: "strings";
      readonly members: readonly StringLiteral[];
      readonly values: ReadonlySet<string>;
    }
  | {
      readonly kind: "interfaces";
      readonly members: { [kind: string]: Interface };
      readonly kindFieldName: string;
    };
