export type Schema = {
  readonly kind: "success";
  readonly types: { readonly [name: string]: TypeDeclaration };
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
  readonly fields: Readonly<Record<string, SchemaField>>;
  readonly firstField?: SchemaField;
  readonly doc: string;
};

export type TypeDeclaration =
  | InterfaceDeclaration
  | {
      readonly kind: "type";
      readonly name: SchemaSourceSpan;
      readonly valueType: TypeRef;
      readonly doc: string;
    };

export type SchemaField = {
  readonly name: SchemaSourceSpan;
  readonly optional: boolean;
  readonly type: TypeRef;
  readonly doc: string;
};

export type NonUnionTypeRef =
  | TypeNameRef
  | StringLiteralTypeRef
  | InlineInterfaceTypeRef
  | ArrayTypeRef;

export type TypeRef = NonUnionTypeRef | UnionTypeRef;

export type TypeNameRef = {
  readonly kind: "type-name";
  readonly name: SchemaSourceSpan;
};

export type StringLiteralTypeRef = {
  readonly kind: "string-literal";
  readonly value: string;
  readonly quotedName: SchemaSourceSpan;
};

export type InlineInterfaceTypeRef = {
  readonly kind: "inline-interface";
  readonly leftCurlyBracket: SchemaSourceSpan;
  readonly fields: Readonly<Record<string, SchemaField>>;
  readonly firstField?: SchemaField;
};

export type ArrayTypeRef = {
  readonly kind: "array";
  readonly elementType: TypeRef;
};

export type UnionTypeRef = {
  readonly kind: "union";
  readonly members: NonUnionTypeRef[];
};

export type SchemaSourceSpan = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};
