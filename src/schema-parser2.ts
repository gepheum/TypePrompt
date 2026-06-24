// =============================================================================
// PUBLIC TYPES
// =============================================================================

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

export type TypeRef =
  | TypeNameRef
  | StringLiteralTypeRef
  | InlineInterfaceTypeRef
  | ArrayTypeRef
  | UnionTypeRef;

export type TypeNameRef = {
  readonly kind: "type-name";
  readonly name: SchemaSourceSpan;
};

export type StringLiteralTypeRef = {
  readonly kind: "string-literal";
  readonly value: string;
  readonly quoted_name: SchemaSourceSpan;
};

export type InlineInterfaceTypeRef = {
  readonly kind: "inline-interface";
  readonly fields: Readonly<Record<string, SchemaField>>;
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

export type SchemaSourceSpan = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};

// =============================================================================
// LOGIC
// =============================================================================

export function parseSchema(schemaSource: string): Schema | SchemaParseErrors {
  return new SchemaParser(schemaSource).parse();
}

class SchemaParser {
  constructor(private readonly schemaSource: string) {}

  private peekToken(): Token {
    // Multiline comment:            \/\*([^*]|\*[^\/])*(\*\/)?
    // Single-line comment:          \/\/[^\n\r]*
    // Word:                         \b\w+\b
    // Whitespaces:                  [ \n\r\t]+
    // Symbol:                       [{}[\]():=;|,]
    // Double-quote string literal:  "(\\.|[^\\\"\n\r])*"?
    // Single-quote string literal:  '(\\.|[^\\\'\n\r])*'?
    //
    // To iterate on this regex, use https://regex101.com/.
    const re =
      /(\/\*([^*]|\*[^/])*(\*\/)?)|(\/\/[^\n\r]*)|\b(\w+)\b|([ \n\r\t]+)|([{}[\]():=;|,])|("(\\.|[^\\\"\n\r])*"?)|('(\\.|[^\\\'\n\r])*'?)|($)/g;
    // 1    2             3        4                5       6            7                8                       9                       10
    const {schemaSource} = this;
    let group: RegExpExecArray | null;
    while ((group = re.exec(schemaSource)) !== null) {
      const position = re.lastIndex - group[0].length;

      // Check that all the regex matches are consecutive.
      // If there is a gap between two matches, it means that we have an invalid
      // sequence of characters.
      if (position !== this.cursor) {
        this.errors.push({
          start: this.cursor,
          end: position,
          message: "Invalid sequence of characters",
        });
      }
      this.cursor = re.lastIndex;

      if (group[6] !== undefined) {
        // Skip whitespaces.
        continue;
      }

      const text = group[0]!;
      let tokenKind: Token["kind"];
      if (group[1] !== undefined) {
        if (!text.endsWith("*/")) {
          this.errors.push({
            start: position,
            end: position + 2,
            message: "Unterminated multi-line comment",
          });
        }
        if (text.startsWith("/**")) {
          tokenKind = "jsdoc";
        } else {
          // Skip regular comments.
          continue;
        }
      } else if (group[4] !== undefined) {
        // Skip single-line comments.
        continue;
      } else if (group[5] !== undefined) {
        // Validate identifier.
        if (/^[0-9]/.test(text)) {
          this.errors.push({
            start: position,
            end: re.lastIndex,
            message: "Invalid identifier",
          });
        } else if (text.includes("_")) {
          this.errors.push({
            start: position,
            end: re.lastIndex,
            message: "Must not contain underscores",
          });
        }
        tokenKind = "identifier";
      } else if (group[7] !== undefined) {
        tokenKind = "symbol";
      } else if (group[8] !== undefined || group[9] !== undefined) {
        // Validate string literal.
        if (text.at(-1) !== text[0]) {
          this.errors.push({
            start: position,
            end: re.lastIndex,
            message: "Unterminated string literal",
          });
        } else if (text.includes("\\")) {
          this.errors.push({
            start: position,
            end: re.lastIndex,
            message: "Must not contain escape sequences",
          });
        }
        tokenKind = "string-literal";
      } else if (group[10] !== undefined) {
        tokenKind = "end";
      } else {
        throw new Error("Unexpected regex match");
      }

      return {
        kind: tokenKind,
        text: text,
        start: position,
        end: re.lastIndex,
        move: () => {
          this.cursor = re.lastIndex;
        },
      };
    }
    // Cannot happen because the regex matches the end of the string.
    throw new Error();
  }

  private readonly errors: SchemaParseError[] = [];
  private cursor = 0;
}

type Token = {
  readonly kind: "identifier" | "symbol" | "string-literal" | "jsdoc" | "end";
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly move: () => void;
};
