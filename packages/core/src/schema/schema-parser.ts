import type { SemanticToken } from "../lsp-util/semantic-token.js";
import { checkNameConflicts } from "../util/casing.js";
import { textToSourcePosition } from "../util/position-mapper.js";
import type {
  InternalError,
  InternalErrors,
  MappedText,
  TextSpan,
} from "../util/shared-types.js";
import { getFirstToken } from "./get-first-token.js";
import type {
  Field,
  FieldType,
  Literal,
  SchemaParseResult,
  Type,
  TypeDeclaration,
  Union,
} from "./schema-types.js";
import { isLiteralType } from "./schema-utils.js";

export function parseSchema(
  content: MappedText,
): SchemaParseResult | InternalErrors {
  return new SchemaParser(content).parse();
}

/**
 * Tokenizes schema content into semantic tokens for syntax highlighting.
 * Used by the language server.
 */
export function tokenizeSchema(content: MappedText): readonly SemanticToken[] {
  return new SchemaParser(content).getSemanticTokens();
}

class SchemaParser {
  private readonly tokens: Token[];
  private tokenIndex = 0;
  private readonly tokenizerErrors: InternalError[] = [];
  private readonly parserErrors: InternalError[] = [];

  private get path(): string {
    return this.content.path;
  }

  constructor(private readonly content: MappedText) {
    this.tokens = this.tokenize();
  }

  parse(): SchemaParseResult | InternalErrors {
    const typeDeclarations: TypeDeclaration[] = [];

    while (true) {
      const typeDeclaration = this.parseTypeDeclaration();
      if (typeDeclaration === null) {
        if (this.peekToken().kind === "string-end") {
          break;
        } else {
          // Jump to the next "type" or "interface" keyword.
          let token = this.peekToken();
          let nestingLevel = 0;
          while (
            token.kind !== "string-end" &&
            !(
              nestingLevel === 0 &&
              (token.text === "type" || token.text === "interface")
            )
          ) {
            if (token.text === "{") {
              ++nestingLevel;
            } else if (token.text === "}") {
              --nestingLevel;
            }
            this.moveNext();
            token = this.peekToken();
          }
        }
      } else {
        typeDeclarations.push(typeDeclaration);
      }
    }

    this.parserErrors.push(
      ...checkNameConflicts(typeDeclarations.map((t) => t.name)),
    );

    if (this.tokenizerErrors.length) {
      return {
        kind: "error",
        errors: this.tokenizerErrors,
      };
    } else if (this.parserErrors.length) {
      return {
        kind: "error",
        errors: this.parserErrors,
      };
    }

    return {
      kind: "success",
      typeDeclarations: Object.fromEntries(
        typeDeclarations.map((t) => [t.name.text, t]),
      ),
      sourcePosition: textToSourcePosition(this.content, 0),
      path: this.path,
    };
  }

  private parseTypeDeclaration(): TypeDeclaration | null {
    let token = this.peekToken();
    if (token.kind === "string-end") {
      return null;
    }

    let jsdoc: Token | undefined;
    if (token.kind === "jsdoc") {
      jsdoc = token;
      this.moveNext();
      token = this.peekToken();
    }

    const match = this.expectThenMove(token, {
      type: EXACT_MATCHER,
      interface: EXACT_MATCHER,
    });
    switch (match) {
      case "type": {
        return this.parseTypeAliasDeclaration(jsdoc);
      }
      case "interface": {
        return this.parseInterfaceDeclaration(jsdoc);
      }
      case "noMatch": {
        return null;
      }
    }
  }

  private parseTypeAliasDeclaration(
    jsdoc: Token | undefined,
  ): TypeDeclaration | null {
    const name = this.peekToken();
    if (this.expectThenMove(name, { _: IDENTIFIER_MATCHER }) === "noMatch") {
      return null;
    }
    if (!this.expectExactThenMove("=")) {
      return null;
    }
    const typeRef = this.parseTypeRef();
    if (typeRef === null) {
      return null;
    }

    const maybeSemicolon = this.peekToken();
    if (maybeSemicolon.text === ";") {
      this.moveNext();
    } else if (
      maybeSemicolon.kind !== "string-end" &&
      !maybeSemicolon.newLine
    ) {
      // Will always push an error.
      this.expectExactThenMove(";", maybeSemicolon);
    }

    return {
      kind: "type",
      name: this.tokenToSpan(name),
      valueType: typeRef,
      doc: getDocText(jsdoc),
    };
  }

  private parseInterfaceDeclaration(
    jsdoc: Token | undefined,
  ): TypeDeclaration | null {
    const name = this.peekToken();
    if (this.expectThenMove(name, { _: IDENTIFIER_MATCHER }) === "noMatch") {
      return null;
    }
    const leftCurlyBracket = this.peekToken();
    if (!this.expectExactThenMove("{", leftCurlyBracket)) {
      return null;
    }
    const fields = this.parseFields();
    if (!this.expectExactThenMove("}")) return null;
    const typeRef: Type = {
      kind: "interface",
      leftCurlyBracket: this.tokenToSpan(leftCurlyBracket),
      fields: Object.fromEntries(fields.map((f) => [f.name.text, f])),
      firstField: fields[0],
    };

    const maybeSemicolon = this.peekToken();
    if (maybeSemicolon.text === ";") {
      this.moveNext();
    }

    return {
      kind: "type",
      name: this.tokenToSpan(name),
      valueType: typeRef,
      doc: getDocText(jsdoc),
    };
  }

  private parseFields(): readonly Field[] {
    const result: Field[] = [];
    while (true) {
      const field = this.tryParseField();
      if (field !== null) {
        result.push(field);
      } else {
        // Error. Move to the next '}'
        let token: Token;
        while (
          (token = this.peekToken()).kind !== "string-end" &&
          token.text !== "}"
        ) {
          this.moveNext();
        }
        break;
      }
    }
    return result;
  }

  private tryParseField(): Field | null {
    let token = this.peekToken();
    let jsdoc: Token | undefined;
    if (token.kind === "jsdoc") {
      jsdoc = token;
      this.moveNext();
      token = this.peekToken();
    }
    const name = token;
    if (name.kind !== "identifier") {
      if (jsdoc) {
        // jsdoc was attached to nothing — report the error.
        this.parserErrors.push({
          span: this.tokenToSpan(name),
          message: "Expected: identifier",
        });
      }
      return null;
    }
    const doc = getDocText(jsdoc);
    this.moveNext();
    token = this.peekToken();
    const optional = token.text === "?";
    if (optional) {
      this.moveNext();
      token = this.peekToken();
    }
    if (!this.expectExactThenMove(":", token)) {
      return null;
    }
    let type: FieldType | null = this.parseTypeRef({ allowLiteral: true });
    if (type === null) return null;
    if (optional) {
      if (isLiteralType(type)) {
        this.parserErrors.push(makeLiteralTypeNotAllowedError(type));
        return null;
      }
      type = { kind: "optional", innerType: type };
    }
    token = this.peekToken();
    if (token.text === ";" || token.text === ",") {
      this.moveNext();
    } else if (token.text !== "}" && !token.newLine) {
      // Will always push an error.
      this.expectExactThenMove(";", token);
    }
    return { name: this.tokenToSpan(name), type, doc };
  }

  private parseTypeRef(context: {
    lastTokenWasPipe: true;
    allowLiteral: true;
  }): Type | Literal | null;

  private parseTypeRef(context: {
    lastTokenWasPipe?: undefined;
    allowLiteral: true;
  }): Type | Literal | null;

  private parseTypeRef(context?: undefined): Type | null;

  private parseTypeRef(
    context?:
      | {
          lastTokenWasPipe: true;
          allowLiteral: true;
        }
      | {
          lastTokenWasPipe?: undefined;
          allowLiteral: true;
        },
  ): Type | Literal | null {
    let type = ((): Type | Literal | null => {
      const token = this.peekToken();
      const match = this.expectThenMove(token, {
        "(": EXACT_MATCHER,
        "{": EXACT_MATCHER,
        "|": context?.lastTokenWasPipe ? NEVER_MATCHER : EXACT_MATCHER,
        shared: EXACT_MATCHER,
        stringLiteral: STRING_LITERAL_MATCHER,
        identifier: IDENTIFIER_MATCHER,
      });
      switch (match) {
        case "(": {
          const type = this.parseTypeRef();
          if (type === null) return null;
          if (!this.expectExactThenMove(")")) return null;
          return type;
        }
        case "{": {
          if (this.peekToken().text === "[") {
            this.moveNext();
            const keyName = this.peekToken().text;
            if (
              this.expectThenMove(this.peekToken(), {
                identifier: IDENTIFIER_MATCHER,
              }) === "noMatch"
            ) {
              return null;
            }
            if (!this.expectExactThenMove(":")) return null;
            if (!this.expectExactThenMove("string")) return null;
            if (!this.expectExactThenMove("]")) return null;
            if (!this.expectExactThenMove(":")) return null;
            const valueType = this.parseTypeRef();
            if (valueType === null) return null;
            if (this.peekToken().text === ";") {
              this.moveNext();
            }
            if (!this.expectExactThenMove("}")) return null;
            return {
              kind: "record",
              keyName,
              leftCurlyBracket: this.tokenToSpan(token),
              valueType,
            };
          } else {
            // Inline interface
            const fields = this.parseFields();
            if (!this.expectExactThenMove("}")) return null;
            return {
              kind: "interface",
              leftCurlyBracket: this.tokenToSpan(token),
              fields: Object.fromEntries(fields.map((f) => [f.name.text, f])),
              firstField: fields[0],
            };
          }
        }
        case "|": {
          return this.parseTypeRef({
            lastTokenWasPipe: true,
            allowLiteral: true,
          });
        }
        case "stringLiteral": {
          const value = token.text.slice(1, -1);
          const quotedName = this.tokenToSpan(token);
          return { kind: "string-literal", value, quotedName };
        }
        case "shared": {
          if (!this.expectExactThenMove(".")) {
            return null;
          }
          const nameToken = this.peekToken();
          const nameMatch = this.expectThenMove(nameToken, {
            identifier: IDENTIFIER_MATCHER,
          });
          if (nameMatch === "noMatch") return null;
          return {
            kind: "shared-type-name",
            shared: this.tokenToSpan(token),
            name: this.tokenToSpan(nameToken),
          };
        }
        case "identifier": {
          const span = this.tokenToSpan(token);
          if (
            span.text === "string" ||
            span.text === "number" ||
            span.text === "boolean" ||
            span.text === "integer"
          ) {
            return {
              kind: "primitive",
              primitive: { ...span, text: span.text },
            };
          } else if (span.text === "any") {
            return {
              kind: "any",
              span: span,
            };
          } else if (span.text === "true" || span.text === "false") {
            return {
              kind: "boolean-literal",
              span: { ...span, text: span.text },
              value: span.text === "true",
            };
          } else {
            return {
              kind: "type-name",
              name: this.tokenToSpan(token),
            };
          }
        }
        case "noMatch": {
          return null;
        }
      }
    })();
    while (true) {
      if (type === null) return null;
      let token = this.peekToken();
      if (token.text === "|") {
        this.moveNext();
        const rightType = this.parseTypeRef({
          lastTokenWasPipe: true,
          allowLiteral: true,
        });
        if (rightType === null) {
          return null;
        }
        return joinTypes(type, rightType);
      } else if (!context?.allowLiteral && isLiteralType(type)) {
        this.parserErrors.push(makeLiteralTypeNotAllowedError(type));
        return null;
      } else if (token.text === "[") {
        this.moveNext();
        token = this.peekToken();
        if (!this.expectExactThenMove("]", token)) {
          return null;
        }
        if (isLiteralType(type)) {
          this.parserErrors.push(makeLiteralTypeNotAllowedError(type));
          return null;
        }
        type = {
          kind: "array",
          elementType: type,
        };
      } else {
        return type;
      }
    }
  }

  private tokenize(): Token[] {
    const tokens: Token[] = [];
    // Multiline comment:            \/\*([^*]|\*[^\/])*(\*\/)?
    // Single-line comment:          \/\/[^\n\r]*
    // Word:                         \b\w+\b
    // Whitespaces:                  [ \n\r\t]+
    // Symbol:                       [{}[\]():=;|,?.]
    // Double-quote string literal:  "(\\.|[^\\\"\n\r])*"?
    // Single-quote string literal:  '(\\.|[^\\\'\n\r])*'?
    //
    // To iterate on this regex, use https://regex101.com/.
    const re =
      /(\/\*([^*]|\*[^/])*(\*\/)?)|(\/\/[^\n\r]*)|\b(\w+)\b|([ \n\r\t]+)|([{}[\]():=;|,?.])|("(?:\\.|[^\\"\n\r])*"?)|('(?:\\.|[^\\'\n\r])*'?)|($)/g;
    // 1    2             3        4                5       6            7                  8                        9                        10
    let group: RegExpExecArray | null;
    let newLine = false;
    let expectedAt = 0;
    while ((group = re.exec(this.content.text)) !== null) {
      const position = re.lastIndex - group[0].length;

      // Check that all the regex matches are consecutive.
      // If there is a gap between two matches, it means that we have an invalid
      // sequence of characters.
      if (position !== expectedAt) {
        this.pushTokenizerError({
          start: expectedAt,
          end: position,
          message: "Invalid sequence of characters",
        });
      }
      expectedAt = re.lastIndex;

      if (group[6] !== undefined) {
        // Skip whitespaces.
        newLine = newLine || group[0].includes("\n");
        continue;
      }

      const text = group[0]!;
      let tokenKind: Token["kind"];
      if (group[1] !== undefined) {
        if (!text.endsWith("*/")) {
          this.pushTokenizerError({
            start: position,
            end: position + 2,
            message: "Unterminated multi-line comment",
          });
        }
        if (text.startsWith("/**")) {
          tokenKind = "jsdoc";
        } else {
          // Non-JSDoc block comment — skip.
          newLine = newLine || group[0].includes("\n");
          continue;
        }
      } else if (group[4] !== undefined) {
        // Single-line comment — skip.
        continue;
      } else if (group[5] !== undefined) {
        // Validate identifier.
        if (/^[0-9]/.test(text)) {
          this.pushTokenizerError({
            start: position,
            end: re.lastIndex,
            message: "Invalid identifier",
          });
        } else if (text.includes("_")) {
          this.pushTokenizerError({
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
          this.pushTokenizerError({
            start: position,
            end: re.lastIndex,
            message: "Unterminated string literal",
          });
        } else if (text.includes("\\")) {
          this.pushTokenizerError({
            start: position,
            end: re.lastIndex,
            message: "Must not contain escape sequences",
          });
        }
        tokenKind = "string-literal";
      } else if (group[10] !== undefined) {
        tokenKind = "string-end";
      } else {
        throw new Error("Unexpected regex match");
      }

      tokens.push({
        kind: tokenKind,
        text: text,
        textStart: position,
        textEnd: re.lastIndex,
        newLine: newLine,
      });
      newLine = false;

      if (tokenKind === "string-end") {
        break;
      }
    }
    return tokens;
  }

  private peekToken(): Token {
    return this.tokens[this.tokenIndex] ?? this.tokens[this.tokens.length - 1]!;
  }

  private moveNext(): void {
    if (this.tokenIndex < this.tokens.length - 1) {
      this.tokenIndex++;
    }
  }

  private expectThenMove<M extends TokenMatchers>(
    token: Token,
    matchers: M,
  ): keyof M | "noMatch" {
    for (const [id, matcher] of Object.entries(matchers)) {
      if (matcher === null) {
        continue;
      }
      if (matcher.test(token, id)) {
        this.moveNext();
        return id;
      }
    }
    const descriptors = Object.entries(matchers)
      .map(([id, matcher]) => matcher.descriptor(id))
      .filter((d) => d)
      .join(", ");
    const message =
      Object.keys(matchers).length === 1
        ? `Expected: ${descriptors}`
        : `Expected one of: ${descriptors}`;
    this.parserErrors.push({
      span: this.tokenToSpan(token),
      message,
    });
    return "noMatch";
  }

  private expectExactThenMove(expected: string, token?: Token): boolean {
    token ??= this.peekToken();
    return (
      this.expectThenMove(token, { [expected]: EXACT_MATCHER }) !== "noMatch"
    );
  }

  private tokenToSpan(token: Token): TextSpan {
    const { content, path } = this;
    return {
      path,
      text: token.text,
      start: textToSourcePosition(content, token.textStart),
      end: textToSourcePosition(content, token.textEnd),
    };
  }

  private pushTokenizerError(args: {
    start: number;
    end: number;
    message: string;
  }): void {
    const { content, path, tokenizerErrors } = this;
    tokenizerErrors.push({
      span: {
        path,
        start: textToSourcePosition(content, args.start),
        end: textToSourcePosition(content, args.end),
      },
      message: args.message,
    });
  }

  getSemanticTokens(): readonly SemanticToken[] {
    const { tokens } = this;
    const result: SemanticToken[] = [];
    for (let i = 0; i < tokens.length; ++i) {
      const token = tokens[i]!;
      switch (token.kind) {
        case "identifier": {
          let semanticKind: "schema-keyword" | "boolean" | undefined;
          switch (token.text) {
            case "interface":
            case "type": {
              semanticKind = "schema-keyword";
              break;
            }
            case "false":
            case "true": {
              semanticKind = "boolean";
              break;
            }
          }
          if (semanticKind) {
            const nextToken = tokens[i + 1]?.text;
            if (nextToken !== ":") {
              const span = this.tokenToSpan(token);
              result.push({
                kind: semanticKind,
                span,
              });
            }
          }
          break;
        }
        case "string-literal": {
          result.push({
            kind: "string",
            span: this.tokenToSpan(token),
          });
          break;
        }
        case "jsdoc": {
          result.push({
            kind: "comment",
            span: this.tokenToSpan(token),
          });
          break;
        }
      }
    }
    return result;
  }
}

type Token = {
  readonly kind:
    "identifier" | "symbol" | "string-literal" | "jsdoc" | "string-end";
  readonly text: string;
  /** Position of the start of the token in `content.text`. */
  readonly textStart: number;
  /** Position of the end of the token in `content.text`. */
  readonly textEnd: number;
  /**
   * True if the start of this token is not on the same line as the end of the
   * previous token.
   */
  readonly newLine: boolean;
};

type TokenMatcher = {
  readonly test: (token: Token, id: string) => boolean;
  /**
   * Will be used to describe the expected token in error messages.
   * Return an empty string to not include this matcher in the error message.
   */
  readonly descriptor: (id: string) => string;
};

const NEVER_MATCHER: TokenMatcher = {
  test: () => false,
  descriptor: () => "",
};

const EXACT_MATCHER: TokenMatcher = {
  test: (token: Token, id: string) => token.text === id,
  descriptor: (id: string) => `'${id}'`,
};

const IDENTIFIER_MATCHER: TokenMatcher = {
  test: (token: Token) => token.kind === "identifier",
  descriptor: () => "identifier",
};

const STRING_LITERAL_MATCHER: TokenMatcher = {
  test: (token: Token) => token.kind === "string-literal",
  descriptor: () => "string literal",
};

type TokenMatchers = { readonly [id: string]: TokenMatcher };

function getDocText(jsdoc: Token | undefined): string {
  if (!jsdoc) {
    return "";
  }
  // Strip the opening `/**` and closing `*/`
  const inner = jsdoc.text.slice(3, -2);
  const lines = inner
    .split("\n")
    .map((line) => line.trimEnd().replace(/^\s*\*? ?/, ""));
  // Remove the first line if it's empty (artifact of `/**` on its own line)
  if (lines.length >= 1 && lines[0]!.trim() === "") {
    lines.shift();
  }
  // Remove the last line if it's empty (artifact of ` */` on its own line)
  if (lines.length >= 1 && lines.at(-1)!.trim() === "") {
    lines.pop();
  }
  return lines.join("\n");
}

function joinTypes(a: Type | Literal, b: Type | Literal): Union {
  if (a.kind === "union") {
    if (b.kind === "union") {
      return {
        kind: "union",
        members: [...a.members, ...b.members],
      };
    } else {
      return {
        kind: "union",
        members: [...a.members, b],
      };
    }
  } else if (b.kind === "union") {
    return {
      kind: "union",
      members: [a, ...b.members],
    };
  } else {
    return {
      kind: "union",
      members: [a, b],
    };
  }
}

function makeLiteralTypeNotAllowedError(type: Literal): InternalError {
  return {
    span: getFirstToken(type),
    message: "Literal type not allowed here",
    rule: "Literal types are allowed only as non-optional field types or members in a union",
  };
}
