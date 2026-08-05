import type { Span, TextSpan } from "../util/shared-types.js";

export type SchemaParseResult = {
  readonly kind: "success";
  readonly typeDeclarations: { readonly [name: string]: TypeDeclaration };
};

export type SchemaValidationContext =
  | { readonly kind: "meta" }
  | { readonly kind: "namespace" }
  | { readonly kind: "template"; readonly namespaceSchema: Schema }
  | { readonly kind: "tool"; readonly namespaceSchema: Schema };

export type SchemaView = {
  readonly typeDeclarations: TypeDeclarations;
  readonly sharedDeclarations: TypeDeclarations;
};

export type TypeDeclarations = { readonly [name: string]: TypeDeclaration };

export type Schema = SchemaView & {
  readonly kind: "success";
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

export type ResolvedType =
  | AnyType
  | Array
  | Interface
  | PrimitiveType
  | RecordType
  | StringLiteral
  | Union;

export type Type = ResolvedType | TypeName | SharedTypeName;

export type NonUnionType = Exclude<Type, Union>;

export type TypeName = {
  readonly kind: "type-name";
  readonly name: TextSpan;
};

export type SharedTypeName = {
  readonly kind: "shared-type-name";
  readonly shared: Span;
  readonly name: TextSpan;
};

export type StringLiteralView = {
  readonly kind: "string-literal";
  readonly value: string;
};

export type StringLiteral = StringLiteralView & {
  readonly quotedName: TextSpan;
};

export type Interface = {
  readonly kind: "interface";
  readonly name?: undefined;
  readonly leftCurlyBracket: Span;
  readonly fields: { readonly [name: string]: SchemaField };
  readonly firstField?: SchemaField;
};

export type RecordType = {
  readonly kind: "record";
  readonly leftCurlyBracket: Span;
  readonly keyName: string;
  readonly valueType: Type;
};

export type AnyType = {
  readonly kind: "any";
  readonly span: Span;
};

export type Array = {
  readonly kind: "array";
  readonly elementType: Type;
};

export type Union = {
  readonly kind: "union";
  /** Guaranteed to contain 2+ elements. */
  readonly members: readonly NonUnionType[];
};

export type PrimitiveType = {
  readonly kind: "primitive";
  readonly primitive: TextSpan<"number" | "string" | "boolean" | "integer">;
};

export type SyntheticArray = {
  readonly kind: "array";
  readonly elementType: Type | SyntheticType;
};

export type SyntheticInterface = {
  readonly kind: "interface";
  readonly fields: { readonly [name: string]: SyntheticSchemaField };
};

export type SyntheticSchemaField = {
  readonly name: {
    readonly text: string;
  };
  readonly optional: boolean;
  readonly type: Type | SyntheticType;
  readonly doc: string;
};

export type SyntheticUnion = {
  readonly kind: "synthetic-union";
  readonly members: SyntheticUnionMembers;
};

export type HasName = {
  readonly name: {
    readonly text: string;
  };
};

export type SyntheticType = SyntheticArray | SyntheticInterface | SyntheticUnion;

/** Hint for generating a name for an anonymous type in a targeted language. */
export type NamingHint = {
  /**
   * Guaranteed to be non-empty.
   * The first element is always an uppercased type name used in a type declaration.
   */
  readonly namePieces: ReadonlyArray<
    | {
        readonly kind: "type";
        /** Uppercased type name. */
        readonly name: string;
      }
    | {
        readonly kind: "field";
        /** Lowercased field name. */
        readonly name: string;
      }
    | {
        readonly kind: "member";
        /** Name of the field used to discriminate union members. Always lowercased. */
        readonly discriminator: string;
        /** Value of the discriminant field. Always lowercased. */
        readonly discriminant: string;
      }
  >;
  readonly doc: string | null;
};

export type UnionMembers =
  | {
      readonly kind: "strings";
      readonly members: readonly StringLiteral[];
      readonly values: ReadonlySet<string>;
      /** Other unions included in this union. */
      readonly includes: readonly Union[];
    }
  | {
      readonly kind: "interfaces";
      readonly members: { [kind: string]: Interface };
      /** Name of the discriminator field, e.g. 'kind'. */
      readonly discriminator: string;
      readonly discriminants: readonly StringLiteral[];
      /** Other unions included in this union. */
      readonly includes: readonly Union[];
      /**
       * Fields shared across all members of the union.
       * These fields are present in every member of the union with the same type.
       */
      readonly sharedFields: { readonly [name: string]: SyntheticSchemaField };
    };

export type SyntheticUnionMembers =
  | {
      readonly kind: "strings";
      readonly values: ReadonlySet<string>;
    }
  | {
      readonly kind: "interfaces";
      readonly members: { [kind: string]: Interface | SyntheticInterface };
      /** Name of the discriminator field, e.g. 'kind'. */
      readonly discriminator: string;
      readonly discriminants: readonly StringLiteralView[];
    };
