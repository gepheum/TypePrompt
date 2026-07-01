export type SchemaParseContext =
  | {
      readonly kind: "meta";
    }
  | {
      readonly kind: "template";
      readonly argTypeNames: readonly string[];
    };

export type Schema = {
  readonly kind: "success";
  readonly types: { readonly [name: string]: TypeDeclaration };
  /**
   * Field names and identifiers used in string literals.
   * Does not include types names.
   */
  readonly identifiers: ReadonlySet<string>;
  readonly unionToMembers: ReadonlyMap<Union, UnionMembers>;
  readonly typeToNamingHint: ReadonlyMap<Interface | Union, NamingHint>;
};

export type SchemaParseErrors = {
  readonly kind: "error";
  readonly errors: readonly SchemaParseError[];
};

export type SchemaParseError = {
  readonly start: number;
  readonly end: number;
  readonly message: string;
};

export type InterfaceDeclaration = {
  readonly kind: "interface";
  readonly name: SchemaSourceSpan;
  readonly leftCurlyBracket: undefined;
  readonly fields: { readonly [name: string]: SchemaField };
  readonly firstField?: SchemaField;
  readonly doc: string;
};

export type TypeDeclaration =
  | InterfaceDeclaration
  | {
      readonly kind: "type";
      readonly name: SchemaSourceSpan;
      readonly valueType: Type;
      readonly doc: string;
    };

export type SchemaField = {
  readonly name: SchemaSourceSpan;
  readonly optional: boolean;
  readonly type: Type;
  readonly doc: string;
};

export type Type = TypeName | StringLiteral | InlineInterface | Array | Union;

export type NonUnionType = Exclude<Type, Union>;

export type TypeName = {
  readonly kind: "type-name";
  readonly name: SchemaSourceSpan;
};

export type StringLiteral = {
  readonly kind: "string-literal";
  readonly value: string;
  readonly quotedName: SchemaSourceSpan;
};

export type InlineInterface = {
  readonly kind: "interface";
  readonly name: undefined;
  readonly leftCurlyBracket: SchemaSourceSpan;
  readonly fields: { readonly [name: string]: SchemaField };
  readonly firstField?: SchemaField;
};

export type Interface = InterfaceDeclaration | InlineInterface;

export type Array = {
  readonly kind: "array";
  readonly elementType: Type;
};

export type Union = {
  readonly kind: "union";
  /** Guaranteed to contain 2+ elements. */
  readonly members: NonUnionType[];
};

export type ResolvedType =
  | Exclude<Type, TypeName>
  | InterfaceDeclaration
  | PrimitiveType;

export type PrimitiveType = {
  readonly kind: "primitive";
  readonly primitive: "number" | "string" | "boolean" | "int";
};

/** Hint for generating a name for an anonymous type in a targeted language. */
export type NamingHint = {
  /**
   * Guaranteed to be non-empty.
   * The first element is always an uppercased type name used in a type declaration.
   * The remaining elements are lowercased field names.
   */
  readonly namePieces: readonly string[];
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

export type SchemaSourceSpan = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};
