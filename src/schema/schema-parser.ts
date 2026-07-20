import { checkNoAmbiguity } from "../util/casing.js";
import type {
  InternalError,
  InternalErrors,
  MappedText,
  Span,
} from "../util/common-types.js";
import {
  decodedToSourceOffsets,
  textToSourcePosition,
} from "../xml/text-node-joiner.js";
import type {
  NonUnionType,
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

  private readonly schemaSource = this.content.text;

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
      ...checkNoAmbiguity(
        typeDeclarations.map((t) => ({
          name: t.name.text,
          start: t.name.start,
          end: t.name.end,
        })),
      ),
    );

    if (this.tokenizerErrors.length) {
      return {
        kind: "error",
        errors: this.remapErrors(this.tokenizerErrors),
      };
    } else if (this.parserErrors.length) {
      return {
        kind: "error",
        errors: this.remapErrors(this.parserErrors),
      };
    }

    return {
      kind: "success",
      typeDeclarations: Object.fromEntries(
        typeDeclarations.map((t) => [
          t.name.text,
          this.remapTypeDeclaration(t),
        ]),
      ),
    };
  }

  private remapSpan(span: Span): Span {
    return {
      text: span.text,
      start: textToSourcePosition(this.content, span.start),
      end: textToSourcePosition(this.content, span.end),
    };
  }

  private remapTypeDeclaration(t: TypeDeclaration): TypeDeclaration {
    return {
      kind: t.kind,
      name: this.remapSpan(t.name),
      valueType: this.remapType(t.valueType),
      doc: t.doc,
    };
  }

  private remapType(type: Type): Type {
    switch (type.kind) {
      case "type-name":
        return { kind: "type-name", name: this.remapSpan(type.name) };
      case "string-literal":
        return {
          kind: "string-literal",
          value: type.value,
          quotedName: this.remapSpan(type.quotedName),
        };
      case "interface": {
        return {
          kind: "interface",
          leftCurlyBracket: this.remapSpan(type.leftCurlyBracket),
          fields: Object.fromEntries(
            Object.entries(type.fields).map(([k, v]) => [
              k,
              this.remapField(v),
            ]),
          ),
          firstField: type.firstField
            ? this.remapField(type.firstField)
            : undefined,
        };
      }
      case "array":
        return { kind: "array", elementType: this.remapType(type.elementType) };
      case "union":
        return {
          kind: "union",
          members: type.members.map((m) => this.remapType(m) as NonUnionType),
        };
    }
  }

  private remapField(field: SchemaField): SchemaField {
    return {
      name: this.remapSpan(field.name),
      optional: field.optional,
      type: this.remapType(field.type),
      doc: field.doc,
    };
  }

  private remapErrors(
    errors: readonly InternalError[],
  ): readonly InternalError[] {
    return errors.map(decodedToSourceOffsets(this.content));
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
      name: name,
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
          span: name,
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
      name: name,
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
        identifier: IDENTIFIER_MATCHER,
      });
      switch (match) {
        case "(": {
          const type = this.parseTypeRef();
          if (type === null) {
            return null;
          }
          if (!this.expectExactThenMove(")")) {
            return null;
          }
          return type;
        }
        case "{": {
          const fields = this.parseFields();
          if (!this.expectExactThenMove("}")) {
            return null;
          }
          return {
            kind: "interface",
            leftCurlyBracket: token,
            fields: Object.fromEntries(fields.map((f) => [f.name.text, f])),
            firstField: fields[0],
          };
        }
        case "|": {
          return this.parseTypeRef({ lastTokenWasPipe: true });
        }
        case "stringLiteral": {
          return {
            kind: "string-literal",
            value: token.text.slice(1, -1),
            quotedName: token,
          };
        }
        case "identifier": {
          return {
            kind: "type-name",
            name: token,
          };
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
    // Symbol:                       [{}[\]():=;|,?]
    // Double-quote string literal:  "(\\.|[^\\\"\n\r])*"?
    // Single-quote string literal:  '(\\.|[^\\\'\n\r])*'?
    //
    // To iterate on this regex, use https://regex101.com/.
    const re =
      /(\/\*([^*]|\*[^/])*(\*\/)?)|(\/\/[^\n\r]*)|\b(\w+)\b|([ \n\r\t]+)|([{}[\]():=;|,?])|("(?:\\.|[^\\"\n\r])*"?)|('(?:\\.|[^\\'\n\r])*'?)|($)/g;
    // 1    2             3        4                5       6            7                8                      9                      10
    re.lastIndex = this.cursor;
    const { schemaSource } = this;
    let group: RegExpExecArray | null;
    let newLine = false;
    // Local position tracker for gap detection; this.cursor is never modified
    // by peekToken() — only movePast() advances it.
    let expectedAt = this.cursor;
    while ((group = re.exec(schemaSource)) !== null) {
      const position = re.lastIndex - group[0].length;

      // Check that all the regex matches are consecutive.
      // If there is a gap between two matches, it means that we have an invalid
      // sequence of characters.
      if (position !== expectedAt) {
        this.tokenizerErrors.push({
          span: {
            start: expectedAt,
            end: position,
          },
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
          this.tokenizerErrors.push({
            span: {
              start: position,
              end: position + 2,
            },
            message: "Unterminated multi-line comment",
          });
        }
        if (text.startsWith("/**")) {
          tokenKind = "jsdoc";
        } else {
          // Terminated non-JSDoc block comment — report error and skip.
          this.tokenizerErrors.push({
            span: {
              start: position,
              end: position + 2,
            },
            message:
              "Non-JSDoc comments are not allowed; use /** ... */ instead",
          });
          newLine = newLine || group[0].includes("\n");
          continue;
        }
      } else if (group[4] !== undefined) {
        // Single-line comment — report error and skip.
        this.tokenizerErrors.push({
          span: {
            start: position,
            end: position + 2,
          },
          message: "Non-JSDoc comments are not allowed; use /** ... */ instead",
        });
        continue;
      } else if (group[5] !== undefined) {
        // Validate identifier.
        if (/^[0-9]/.test(text)) {
          this.tokenizerErrors.push({
            span: {
              start: position,
              end: re.lastIndex,
            },
            message: "Invalid identifier",
          });
        } else if (text.includes("_")) {
          this.tokenizerErrors.push({
            span: {
              start: position,
              end: re.lastIndex,
            },
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
            span: {
              start: position,
              end: re.lastIndex,
            },
            message: "Unterminated string literal",
          });
        } else if (text.includes("\\")) {
          this.tokenizerErrors.push({
            span: {
              start: position,
              end: re.lastIndex,
            },
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
        start: position,
        end: re.lastIndex,
        newLine: newLine,
      };
      return this.cachedPeek;
    }
    // Cannot happen because the regex matches the end of the string.
    throw new Error();
  }

  private movePast(token: Token): void {
    this.cursor = token.end;
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
      span: {
        start: token.start,
        end: token.end,
      },
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
  readonly start: number;
  readonly end: number;
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
