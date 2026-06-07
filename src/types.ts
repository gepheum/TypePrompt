export interface Result<T> {
  readonly value: T;
  readonly errors: Error[];
}

export interface TemplateFile {
  readonly templates: readonly Template[];
}

export interface Template {
  readonly name: CodeSlice;
  readonly variantName?: CodeSlice;
  readonly pieces: readonly TemplatePiece[];
  readonly parameters: readonly string[];
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
      readonly schema: ResponseSchema | null;
    }
  | {
      readonly kind: "example";
      readonly text: string;
      readonly example: ResponseExample;
    };

export interface ResponseSchema {
  readonly codeSlice: CodeSlice;
  readonly declarations: readonly ResponseSchemaDeclaration[];
}

export interface ResponseSchemaTypeRef {
  readonly text: string;
  readonly codeSlice: CodeSlice;
}

export interface ResponseSchemaField {
  readonly name: CodeSlice;
  readonly optional: boolean;
  readonly type: ResponseSchemaTypeRef;
  readonly codeSlice: CodeSlice;
}

export type ResponseSchemaDeclaration =
  | {
      readonly kind: "interface";
      readonly name: CodeSlice;
      readonly codeSlice: CodeSlice;
      readonly fields: readonly ResponseSchemaField[];
    }
  | {
      readonly kind: "type";
      readonly name: CodeSlice;
      readonly codeSlice: CodeSlice;
      readonly valueType: ResponseSchemaTypeRef;
    };

export interface ResponseExample {
  readonly codeSlice: CodeSlice;
  readonly value: JsonValue | null;
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
