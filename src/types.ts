export interface Result<T> {
  readonly value: T;
  readonly errors: readonly Error[];
}
]
export interface TemplateFile {
  readonly templates: readonly Template[];
}

export interface Template {
  readonly name: CodeSlice;
  readonly variantName: CodeSlice | null;
  readonly pieces: readonly TemplatePiece[];
  readonly parameters: ReadonlySet<string>;
  readonly schema: Schema | null;
  readonly examples: readonly Example[];
}

export interface Schema {
  readonly types: Readonly<Record<string, TypeDeclaration>>;
}

export type TemplatePiece =
  | {
      readonly kind: "text";
      readonly text: string;
    }
  | {
      readonly kind: "expression";
      readonly expression: string;
      readonly hide: boolean;
    }
  | {
      readonly kind: "schema";
      readonly text: string;
      readonly schema: Schema;
    }
  | {
      readonly kind: "example";
      readonly text: string;
      readonly example: Example;
    };

export interface TypeNameRef {
  readonly kind: "type-name";
  readonly name: CodeSlice;
}

export interface StringLiteralTypeRef {
  readonly kind: "string-literal";
  readonly value: string;
  readonly quoted_name: CodeSlice;
}

export interface InlineInterfaceTypeRef {
  readonly kind: "inline-interface";
  readonly fields: Readonly<Record<string, SchemaField>>;
  readonly firstField?: SchemaField;
}

export interface ArrayTypeRef {
  readonly kind: "array";
  readonly elementType: TypeRef;
}

export interface UnionTypeRef {
  readonly kind: "union";
  readonly members: readonly (StringLiteralTypeRef | InlineInterfaceTypeRef)[];
}

export type TypeRef =
  | TypeNameRef
  | StringLiteralTypeRef
  | InlineInterfaceTypeRef
  | ArrayTypeRef
  | UnionTypeRef;

export interface SchemaField {
  readonly name: CodeSlice;
  readonly optional: boolean;
  readonly type: TypeRef;
}

export interface InterfaceDeclaration {
  readonly kind: "interface";
  readonly name: CodeSlice;
  readonly fields: Readonly<Record<string, SchemaField>>;
  readonly firstField?: SchemaField;
}

export type TypeDeclaration =
  | InterfaceDeclaration
  | {
      readonly kind: "type";
      readonly name: CodeSlice;
      readonly valueType: TypeRef;
    };

export interface Example {
  readonly codeSlice: CodeSlice;
  readonly value: JsonValue;
  readonly type?: string;
}

export type JsonValue =
  | JsonObject
  | JsonArray
  | JsonString
  | JsonNumber
  | JsonBoolean
  | JsonNull
  | JsonEllipsis;

export interface JsonObject {
  readonly kind: "object";
  readonly codeSlice: CodeSlice;
  readonly entries: readonly JsonObjectEntry[];
  readonly ellipsis?: JsonEllipsis;
}

export interface JsonObjectEntry {
  readonly key: JsonString;
  readonly value: JsonValue;
}

export interface JsonArray {
  readonly kind: "array";
  readonly codeSlice: CodeSlice;
  readonly values: readonly JsonValue[];
}

export interface JsonString {
  readonly kind: "string";
  readonly codeSlice: CodeSlice;
  readonly value: string;
}

export interface JsonNumber {
  readonly kind: "number";
  readonly codeSlice: CodeSlice;
  readonly value: number;
}

export interface JsonBoolean {
  readonly kind: "boolean";
  readonly codeSlice: CodeSlice;
  readonly value: boolean;
}

export interface JsonNull {
  readonly kind: "null";
  readonly codeSlice: CodeSlice;
}

export interface JsonEllipsis {
  readonly kind: "ellipsis";
  readonly codeSlice: CodeSlice;
}

export interface CodeSlice {
  readonly text: string;
  readonly startPos: number;
  readonly endPos: number;
  readonly line: Line;
}

export interface Line {
  /// 0-based line number
  readonly lineNumber: number;
  readonly startPos: number;
  readonly text: string;
  readonly indent: string;
}

export type Error =
  | {
      readonly message: string;
      readonly expected?: undefined;
      readonly codeSlice: CodeSlice;
    }
  | {
      readonly expected: string;
      readonly message?: undefined;
      readonly codeSlice: CodeSlice;
    };
