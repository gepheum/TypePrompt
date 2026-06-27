export type Schema = {
  readonly kind: "success";
  readonly types: { readonly [name: string]: TypeDeclaration };
  readonly fieldNameMapping: { readonly [fieldName: string]: readonly Interface[] };
  /** True if the schema contains an interface containing only optional fields. */
  readonly hasEmptyInterface: boolean;
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

export type Type =
  | TypeName
  | StringLiteral
  | InlineInterface
  | Array
  | Union;

export type NonUnionTypeRef = Exclude<Type, Union>;

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
  readonly members: NonUnionTypeRef[];
};

export type ResolvedTypeRef =
  | Exclude<Type, TypeName>
  | InterfaceDeclaration
  | PrimitiveType;

export type PrimitiveType = {
  readonly kind: "primitive";
  readonly primitive: "number" | "string" | "boolean";
};

export type SchemaSourceSpan = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};
