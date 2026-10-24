import type {
  DefinitionLink,
  InternalError,
  Span,
  TextSpan,
} from "../util/shared-types.js";

export type SchemaContext = "meta" | "namespace" | "template" | "tool";

export type SchemaParseResult<Context extends SchemaContext> = {
  readonly kind: "success";
  readonly context: Context;
  readonly typeDeclarations: { readonly [name: string]: TypeDeclaration };
  readonly source: Omit<TextSpan, "path">;
  readonly path: string;
  readonly warnings: readonly InternalError[];
};

export type SchemaView = {
  readonly typeDeclarations: TypeDeclarations;
  /**
   * Type declarations in the <namespace> schema.
   * Empty if this schema is the <meta> schema.
   * Same as `typeDeclarations` if this schema is the <namespace> schema.
   */
  readonly sharedDeclarations: TypeDeclarations;
};

export type TypeDeclarations = { readonly [name: string]: TypeDeclaration };

export type Schema = SchemaView & {
  readonly kind: "success";
  readonly source: Omit<TextSpan, "path">;
  /**
   * Field names and identifiers used in string literals.
   * Includes identifiers from shared types if they are referenced from this schema.
   * Does not include types names.
   */
  readonly identifiers: { readonly [identifier: string]: Span };
  /** Includes shared types. */
  readonly unionToMembers: ReadonlyMap<Union, UnionMembers>;
  /** Hints for creating names for anonymous types in generated code. */
  readonly namingHints: {
    /** Covers types found in {@link SchemaView.typeDeclarations}. */
    readonly defaultScope: ReadonlyMap<Interface | Union, NamingHint>;
    /** Covers types found in {@link SchemaView.sharedDeclarations}. */
    readonly shared: ReadonlyMap<Interface | Union, NamingHint>;
  };
  readonly definitionLinks: readonly DefinitionLink[];
};

export type TypeDeclaration = {
  readonly kind: "type";
  readonly name: TextSpan;
  readonly valueType: Type;
  readonly doc: string;
};

export type ResolvedType =
  AnyType | Array | Interface | PrimitiveType | RecordType | Union;

export type Type = ResolvedType | TypeName | SharedTypeName;

export type Literal = BooleanLiteral | StringLiteral;

export type ResolvedFieldType = ResolvedType | Literal | Optional;

export type FieldType = Type | Literal | Optional;

export type AnyType = {
  readonly kind: "any";
  readonly span: Span;
};

export type AnyTypeView = {
  readonly kind: "any";
};

export type Array = {
  readonly kind: "array";
  readonly elementType: Type;
  readonly constraint?: undefined;
};

export type Interface = {
  readonly kind: "interface";
  readonly name?: undefined;
  readonly leftCurlyBracket: Span;
  readonly fields: { readonly [name: string]: Field };
  readonly firstField?: Field;
};

export type Field = {
  readonly name: TextSpan;
  readonly type: FieldType;
  readonly doc: string;
};

export type PrimitiveType = {
  readonly kind: "primitive";
  readonly primitive: TextSpan<"number" | "string" | "boolean" | "integer">;
  readonly constraint?: undefined;
};

export type PrimitiveTypeView = {
  readonly kind: "primitive";
  readonly primitive: {
    readonly text: "number" | "string" | "boolean" | "integer";
  };
  readonly constraint?: undefined;
};

/** String type with an optional constraint. */
export type SyntheticStringType = {
  readonly kind: "primitive";
  readonly primitive: {
    readonly text: "string";
  };
  readonly constraint?: Constraint<string>;
};

export type RecordType = {
  readonly kind: "record";
  readonly leftCurlyBracket: Span;
  readonly keyName: string;
  readonly valueType: Type;
};

export type Union = {
  readonly kind: "union";
  /** Guaranteed to contain 2+ elements. */
  readonly members: readonly UnionMemberType[];
};

export type UnionMemberType = Exclude<Type, Union> | Literal;

export type TypeName = {
  readonly kind: "type-name";
  readonly name: TextSpan;
  readonly context: SchemaContext;
};

export type TypeNameView = {
  readonly kind: "type-name";
  readonly name: {
    readonly text: string;
  };
  readonly context?: undefined;
};

export type SharedTypeName = {
  readonly kind: "shared-type-name";
  readonly shared: Span;
  readonly name: TextSpan;
};

export type StringLiteral = StringLiteralView & {
  readonly quotedName: TextSpan;
};

export type StringLiteralView = {
  readonly kind: "string-literal";
  readonly value: string;
  readonly quotedName?: TextSpan;
};

export type BooleanLiteral = {
  readonly kind: "boolean-literal";
  readonly span: TextSpan<"true" | "false">;
  readonly value: boolean;
};

export type Optional = {
  readonly kind: "optional";
  readonly innerType: Exclude<Type, Optional>;
};

export type SyntheticArray = {
  readonly kind: "array";
  readonly elementType: Type | SyntheticType;
  readonly constraint?: Constraint<readonly unknown[]>;
};

export type SyntheticInterface = {
  readonly kind: "interface";
  readonly fields: { readonly [name: string]: SyntheticField };
};

export type SyntheticOptional = {
  readonly kind: "optional";
  readonly innerType: Type | SyntheticType;
};

export type SyntheticField = {
  readonly name: {
    readonly text: string;
    readonly start?: undefined;
  };
  readonly type: FieldType | SyntheticType;
  readonly doc?: string;
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

export type SyntheticType =
  | AnyTypeView
  | PrimitiveTypeView
  | StringLiteralView
  | SyntheticArray
  | SyntheticInterface
  | SyntheticOptional
  | SyntheticStringType
  | SyntheticUnion;

export type NullType = { readonly kind: "null" };

export type Constraint<T> = {
  readonly predicate: (t: T) => boolean;
  /** Starts with "Must" or "Must not". */
  readonly message: string;
};

/** Hint for creating a name for an anonymous type in generated code. */
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
        /**
         * Name of the discriminator field.
         * Common to all members in the discriminated union.
         * In camelCase.
         */
        readonly discriminator: string;
        /** Value of the discriminator field. Specific to this member. */
        readonly discriminant:
          | {
              readonly type: "string";
              /** In camelCase. */
              readonly value: string;
            }
          | {
              readonly type: "boolean";
              readonly value: boolean;
            };
      }
  >;
  readonly doc: string;
};

export type UnionMembers =
  | {
      readonly kind: "strings";
      readonly members: readonly StringLiteral[];
      readonly values: { readonly [v: string]: StringLiteral };
      /** Other unions included in this union. */
      readonly includes: readonly Union[];
    }
  | DiscriminatedUnionMembers;

export type DiscriminatedUnionMembers = {
  /** A discriminated union. */
  readonly kind: "interfaces";
  /**
   * If the discriminants are booleans, the keys are the strings 'true' and
   * 'false'.
   */
  readonly members: {
    [discriminant: string]: {
      readonly discriminant: StringLiteral | BooleanLiteral;
      readonly resolved: Interface;
      readonly unresolved: UnionMemberType;
      /** True if this union member contains a reference to the union type. */
      readonly isRecursive: boolean;
    };
  };
  readonly first: Interface;
  /** Name of the discriminator field, e.g. 'kind'. */
  readonly discriminator: string;
  readonly discriminants: Discriminants;
  /** Other unions included in this union. */
  readonly includes: readonly Union[];
  /** Fields common to all members of the union: same name, type, optionality. */
  readonly commonFields: readonly CommonField[];
};

/** Discriminants of a discriminated union. */
export type Discriminants =
  | {
      readonly type: "string";
      readonly values: readonly StringLiteral[];
    }
  | {
      readonly type: "boolean";
      readonly values: readonly BooleanLiteral[];
    };

/** A field common to all members of a discriminated union. */
export type CommonField = {
  readonly name: string;
  readonly type: FieldType;
  readonly doc?: string;
  readonly memberFields: readonly Field[];
};

export type SyntheticUnionMembers =
  | {
      readonly kind: "strings";
      /** Can be empty. */
      readonly values: {
        readonly [v: string]:
          | {
              readonly kind: "string-literal";
              readonly quotedName: TextSpan;
            }
          | {
              readonly kind: "unquoted";
              readonly unquotedName:
                | TextSpan
                | {
                    readonly text: string;
                    readonly start?: undefined;
                    readonly end?: undefined;
                  };
            };
      };
    }
  | {
      readonly kind: "interfaces";
      readonly members: {
        [kind: string]: {
          readonly resolved: Interface | SyntheticInterface;
        };
      };
      /** Name of the discriminator field, e.g. 'kind'. */
      readonly discriminator: string;
      readonly discriminants: Discriminants;
    };

export type SchemaType = {
  readonly type: Type | SyntheticType;
  readonly schema: SchemaView;
};
