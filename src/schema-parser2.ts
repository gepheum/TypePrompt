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

  parse(): Schema | SchemaParseErrors {
    return {
      kind: "error",
      errors: [...this.tokenizerErrors, ...this.parserErrors],
    };
  }

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
      /(\/\*([^*]|\*[^/])*(\*\/)?)|(\/\/[^\n\r]*)|\b(\w+)\b|([ \n\r\t]+)|([{}[\]():=;|,])|("(\\.|[^\\"\n\r])*"?)|('(\\.|[^\\'\n\r])*'?)|($)/g;
    // 1    2             3        4                5       6            7                8                      9                      10
    const { schemaSource } = this;
    let group: RegExpExecArray | null;
    while ((group = re.exec(schemaSource)) !== null) {
      const position = re.lastIndex - group[0].length;

      // Check that all the regex matches are consecutive.
      // If there is a gap between two matches, it means that we have an invalid
      // sequence of characters.
      if (position !== this.cursor) {
        this.tokenizerErrors.push({
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
          this.tokenizerErrors.push({
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
          this.tokenizerErrors.push({
            start: position,
            end: re.lastIndex,
            message: "Invalid identifier",
          });
        } else if (text.includes("_")) {
          this.tokenizerErrors.push({
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
          this.tokenizerErrors.push({
            start: position,
            end: re.lastIndex,
            message: "Unterminated string literal",
          });
        } else if (text.includes("\\")) {
          this.tokenizerErrors.push({
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
      };
    }
    // Cannot happen because the regex matches the end of the string.
    throw new Error();
  }

  private movePast(token: Token): void {
    this.cursor = token.end;
  }

  private expectThenMove<M extends TokenMatchers>(
    token: Token,
    matchers: M,
  ): keyof M | "no-match" {
    for (const [id, matcher] of Object.entries(matchers)) {
      if (matcher === null) {
        continue;
      }
      if (matcher.test(token.text, id)) {
        this.movePast(token);
        return id;
      }
    }
    const descriptors = Object.entries(matchers)
      .map(([id, matcher]) => matcher.descriptor(id))
      .filter((d) => d)
      .join(" or ");
    this.parserErrors.push({
      start: token.start,
      end: token.end,
      message: `Expected: ${descriptors}`,
    });
    return "no-match";
  }

  private readonly tokenizerErrors: SchemaParseError[] = [];
  private readonly parserErrors: SchemaParseError[] = [];
  private cursor = 0;
}

type Token = {
  readonly kind: "identifier" | "symbol" | "string-literal" | "jsdoc" | "end";
  readonly text: string;
  readonly start: number;
  readonly end: number;
};

type TokenMatcher = {
  readonly test: (token: string, id: string) => boolean;
  readonly descriptor: (id: string) => string;
};

const EXACT_MATCHER: TokenMatcher = {
  test: (token: string, id: string) => token === id,
  descriptor: (id: string) => `'${id}'`,
};

const NEVER_MATCHER: TokenMatcher = {
  test: () => false,
  descriptor: () => "",
};

type TokenMatchers = { readonly [id: string]: TokenMatcher };
