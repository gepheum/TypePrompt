import { checkNameConflicts } from "../util/casing.js";
import { textToSourcePosition } from "../util/position-mapper.js";
import type {
  InternalError,
  InternalErrors,
  MappedText,
  TextSpan,
} from "../util/shared-types.js";
import type {
  SchemaField,
  SchemaParseResult,
  Type,
  TypeDeclaration,
  Union,
} from "./schema-types.js";

export function parseSchema(
  content: MappedText,
): SchemaParseResult | InternalErrors {
  return new SchemaParser(content).parse();
}

class SchemaParser {
  constructor(private readonly content: MappedText) {}

  parse(): SchemaParseResult | InternalErrors {
    const typeDeclarations: TypeDeclaration[] = [];

    while (true) {
      const typeDeclaration = this.parseTypeDeclaration();
      if (typeDeclaration === null) {
        if (this.peekToken().kind === "string-end") {
          break;
        } else {
          // Jump to the next "type" keyword.
          let token = this.peekToken();
          let nestingLevel = 0;
          while (
            token.kind !== "string-end" &&
            !(token.text === "type" && nestingLevel === 0)
          ) {
            if (token.text === "{") {
              ++nestingLevel;
            } else if (token.text === "}") {
              --nestingLevel;
            }
            token = this.movePastThenPeek(token);
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
      token = this.movePastThenPeek(token);
    }

    const match = this.expectThenMove(token, {
      type: EXACT_MATCHER,
    });
    switch (match) {
      case "type": {
        return this.parseTypeAliasDeclaration(jsdoc);
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
      this.movePast(maybeSemicolon);
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

  private parseFields(): readonly SchemaField[] {
    const result: SchemaField[] = [];
    while (true) {
      const field = this.tryParseField();
      if (field !== null) {
        result.push(field);
      } else {
        break;
      }
    }
    return result;
  }

  private tryParseField(): SchemaField | null {
    let token = this.peekToken();
    let jsdoc: Token | undefined;
    if (token.kind === "jsdoc") {
      jsdoc = token;
      token = this.movePastThenPeek(token);
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
    this.movePast(name);
    token = this.peekToken();
    const optional = token.text === "?";
    if (optional) {
      token = this.movePastThenPeek(token);
    }
    if (!this.expectExactThenMove(":", token)) {
      return null;
    }
    const typeRef = this.parseTypeRef();
    if (typeRef === null) {
      return null;
    }
    token = this.peekToken();
    if (token.text === ";" || token.text === ",") {
      this.movePast(token);
    } else if (token.text !== "}" && !token.newLine) {
      // Will always push an error.
      this.expectExactThenMove(";", token);
    }
    return {
      name: this.tokenToSpan(name),
      optional: optional,
      type: typeRef,
      doc: getDocText(jsdoc),
    };
  }

  private parseTypeRef(context?: { lastTokenWasPipe?: boolean }): Type | null {
    let type: Type | null = ((): Type | null => {
      const token = this.peekToken();
      const match = this.expectThenMove(token, {
        "(": EXACT_MATCHER,
        "{": EXACT_MATCHER,
        "|": context?.lastTokenWasPipe ? NEVER_MATCHER : EXACT_MATCHER,
        stringLiteral: STRING_LITERAL_MATCHER,
        shared: EXACT_MATCHER,
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
            this.movePast(this.peekToken());
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
            if (!this.expectExactThenMove("}")) return null;
            return {
              kind: "record",
              keyName: keyName,
              leftCurlyBracket: this.tokenToSpan(token),
              valueType: valueType,
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
          return this.parseTypeRef({ lastTokenWasPipe: true });
        }
        case "stringLiteral": {
          const value = token.text.slice(1, -1);
          if (!/^[a-z][A-Za-z0-9]*$/.test(value)) {
            this.parserErrors.push({
              span: this.tokenToSpan(token),
              message: "Quoted text must be a lowerCamelCase identifier",
            });
          }
          return {
            kind: "string-literal",
            value: token.text.slice(1, -1),
            quotedName: this.tokenToSpan(token),
          };
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
    if (type === null) {
      return null;
    }
    while (true) {
      let token = this.peekToken();
      if (token.text === "[") {
        token = this.movePastThenPeek(token);
        if (!this.expectExactThenMove("]", token)) {
          return null;
        }
        type = {
          kind: "array",
          elementType: type,
        };
      } else if (token.text === "|") {
        this.movePast(token);
        const rightType = this.parseTypeRef({ lastTokenWasPipe: true });
        if (rightType === null) {
          return null;
        }
        return joinTypes(type, rightType);
      } else {
        return type;
      }
    }
  }

  private peekToken(): Token {
    if (this.cachedPeek !== null) {
      return this.cachedPeek;
    }
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
    re.lastIndex = this.cursor;
    let group: RegExpExecArray | null;
    let newLine = false;
    // Local position tracker for gap detection; this.cursor is never modified
    // by peekToken() — only movePast() advances it.
    let expectedAt = this.cursor;
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

      // peekToken() is idempotent: this.cursor is never modified here.
      // The cursor advances only when movePast() is called explicitly.
      this.cachedPeek = {
        kind: tokenKind,
        text: text,
        textStart: position,
        textEnd: re.lastIndex,
        newLine: newLine,
      };
      return this.cachedPeek;
    }
    // Cannot happen because the regex matches the end of the string.
    throw new Error();
  }

  private movePast(token: Token): void {
    this.cursor = token.textEnd;
    this.cachedPeek = null;
  }

  private movePastThenPeek(token: Token): Token {
    this.movePast(token);
    return this.peekToken();
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
        this.movePast(token);
        return id;
      }
    }
    const descriptors = Object.entries(matchers)
      .map(([id, matcher]) => matcher.descriptor(id))
      .filter((d) => d)
      .join(" or ");
    this.parserErrors.push({
      span: this.tokenToSpan(token),
      message: `Expected: ${descriptors}`,
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
    const { content } = this;
    return {
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
    const { content, tokenizerErrors } = this;
    tokenizerErrors.push({
      span: {
        start: textToSourcePosition(content, args.start),
        end: textToSourcePosition(content, args.end),
      },
      message: args.message,
    });
  }

  private readonly tokenizerErrors: InternalError[] = [];
  private readonly parserErrors: InternalError[] = [];
  private cursor = 0;
  /** Cache for peekToken(); invalidated whenever cursor advances via movePast(). */
  private cachedPeek: Token | null = null;
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
  descriptor: () => "string",
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
  if (lines.length > 0 && lines[0]!.trim() === "") {
    lines.shift();
  }
  // Remove the last line if it's empty (artifact of ` */` on its own line)
  if (lines.length > 0 && lines.at(-1)!.trim() === "") {
    lines.pop();
  }
  return lines.join("\n");
}

function joinTypes(a: Type, b: Type): Union {
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
