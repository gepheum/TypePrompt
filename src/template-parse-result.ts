export type Templates = {
  readonly kind: "success";
  readonly templates: {
    readonly [name: string]: TemplateBundle;
  };
};

export type TemplateBundle =
  | {
      readonly kind: "no-variants";
      readonly name: string;
      readonly template: Template;
    }
  | {
      readonly kind: "variants";
      readonly name: string;
      readonly variants: {
        readonly [variant: string]: Template;
      };
    };

export type Template = {
  readonly name: string;
  /// Variant name. Can be empty.
  readonly variant: string;
  readonly args: readonly string[];
  readonly content: readonly TemplatePiece[];
  readonly xmlContent: string;
};

export type TemplatePiece =
  | {
      readonly kind: "text";
      readonly text: string;
    }
  | {
      readonly kind: "arg";
      readonly name: string;
    };

export type Schema = {
  readonly types: { readonly [name: string]: TypeDeclaration };
};

export type InterfaceDeclaration = {
  readonly kind: "interface";
  readonly name: string;
  readonly fields: {readonly [name: string]: SchemaField};
  readonly firstField?: SchemaField;
};

export type TypeDeclaration =
  | InterfaceDeclaration
  | {
      readonly kind: "type";
      readonly name: string;
      readonly valueType: TypeRef;
    };

export type SchemaField = {
  readonly name: string;
  readonly optional: boolean;
  readonly type: TypeRef;
};

export type TypeRef =
  | TypeNameRef
  | StringLiteralTypeRef
  | InlineInterfaceTypeRef
  | ArrayTypeRef
  | UnionTypeRef;

export type TypeNameRef = {
  readonly kind: "type-name";
  readonly name: string;
};

export type StringLiteralTypeRef = {
  readonly kind: "string-literal";
  readonly value: string;
  readonly quoted_name: string;
};

export type InlineInterfaceTypeRef = {
  readonly kind: "inline-interface";
  readonly fields: {readonly [name: string]: SchemaField};
  readonly firstField?: SchemaField;
};

export type ArrayTypeRef = {
  readonly kind: "array";
  readonly elementType: TypeRef;
};

export type UnionTypeRef = {
  readonly kind: "union";
  readonly members: ReadonlyArray<
    StringLiteralTypeRef | InlineInterfaceTypeRef
  >;
};
