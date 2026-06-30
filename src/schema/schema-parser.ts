import type {
  Interface,
  NamingHint,
  Schema,
  SchemaField,
  SchemaParseContext,
  SchemaParseError,
  SchemaParseErrors,
  Type,
  TypeDeclaration,
  Union,
  UnionMembers,
} from "./schema-types.js";
import { validateSchema } from "./schema-validator.js";
import { getUnionMembers } from "./unions.js";

export function parseSchema(
  schemaSource: string,
  context: SchemaParseContext,
): Schema | SchemaParseErrors {
  return new SchemaParser(schemaSource).parse(context);
}

class SchemaParser {
  constructor(private readonly schemaSource: string) {}

  parse(context: SchemaParseContext): Schema | SchemaParseErrors {
    const typeDeclarations: TypeDeclaration[] = [];

    while (true) {
      const typeDeclaration = this.parseTypeDeclaration();
      if (typeDeclaration === null) {
        if (this.peekToken().kind === "string-end") {
          break;
        } else {
          // Jump to the next "type" or "interface" keyword.
          let token = this.peekToken();
          while (
            token.kind !== "string-end" &&
            token.text !== "type" &&
            token.text !== "interface"
          ) {
            this.movePast(token);
            token = this.peekToken();
          }
        }
      } else {
        typeDeclarations.push(typeDeclaration);
      }
    }

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

    const validationErrors = validateSchema(typeDeclarations, context);
    if (validationErrors.length) {
      return {
        kind: "error",
        errors: validationErrors,
      };
    }

    const types = Object.fromEntries(
      typeDeclarations.map((t) => [t.name.text, t]),
    );

    const typeTraverser = TypeTraverser.traverseAll(types);

    return {
      kind: "success",
      types: types,
      identifiers: typeTraverser.identifiers,
      unionToMembers: typeTraverser.unionToMembers,
      typeToNamingHint: typeTraverser.typeToNamingHint,
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
      this.movePast(maybeSemicolon);
    } else if (maybeSemicolon.kind !== "string-end" && !maybeSemicolon.newLine) {
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

  private parseInterfaceDeclaration(
    jsdoc: Token | undefined,
  ): TypeDeclaration | null {
    const name = this.peekToken();
    if (this.expectThenMove(name, { _: IDENTIFIER_MATCHER }) === "noMatch") {
      return null;
    }
    if (!this.expectExactThenMove("{")) {
      return null;
    }
    const fields = this.parseFields();
    if (!this.expectExactThenMove("}")) {
      return null;
    }
    return {
      kind: "interface",
      name: name,
      leftCurlyBracket: undefined,
      fields: Object.fromEntries(fields.map((f) => [f.name.text, f])),
      firstField: fields[0],
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
          start: name.start,
          end: name.end,
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
            name: undefined,
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
          this.tokenizerErrors.push({
            start: position,
            end: position + 2,
            message: "Unterminated multi-line comment",
          });
        }
        if (text.startsWith("/**")) {
          tokenKind = "jsdoc";
        } else {
          // Skip regular multi-line comments.
          newLine = newLine || group[0].includes("\n");
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
      start: token.start,
      end: token.end,
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

  private readonly tokenizerErrors: SchemaParseError[] = [];
  private readonly parserErrors: SchemaParseError[] = [];
  private cursor = 0;
  /** Cache for peekToken(); invalidated whenever cursor advances via movePast(). */
  private cachedPeek: Token | null = null;
}

type Token = {
  readonly kind:
    | "identifier"
    | "symbol"
    | "string-literal"
    | "jsdoc"
    | "string-end";
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

class TypeTraverser {
  static traverseAll(
    types: {readonly [name: string]: TypeDeclaration},
  ): TypeTraverser {
    const traverser = new TypeTraverser(types);
    for (const type of Object.values(types)) {
      traverser.traverse(type, { namePieces: [] });
    }
    return traverser;
  }

  private constructor(
    private readonly types: {readonly [name: string]: TypeDeclaration},
  ) {}

  private traverse(type: Type | TypeDeclaration, context: NamingHint): null {
    switch (type.kind) {
      case "array": {
        return this.traverse(type.elementType, context);
      }
      case "interface": {
        const fields = Object.values(type.fields);
        for (const field of fields) {
          this.identifiers.add(field.name.text);
          const newContext: NamingHint = {
            namePieces: [...context.namePieces, field.name.text],
          };
          this.traverse(field.type, newContext);
        }
        return null;
      }
      case "string-literal": {
        this.identifiers.add(type.value);
        return null;
      }
      case "type": {
        return this.traverse(type.valueType, context);
      }
      case "type-name": {
        return null;
      }
      case "union": {
        this.typeToNamingHint.set(type, context);
        const unionMembers = getUnionMembers(type, this.types);
        this.unionToMembers.set(type, unionMembers);
        switch (unionMembers.kind) {
          case "interfaces": {
            for (const member of unionMembers.members) {
              const newContext: NamingHint = {
                namePieces: [...context.namePieces, member.kind],
              };
              this.traverse(member.interface, newContext);
            }
            return null;
          }
          case "strings": {
            return null;
          }
        }
      }
    }
  }

  readonly identifiers: Set<string> = new Set();
  readonly unionToMembers = new Map<Union, UnionMembers>();
  readonly typeToNamingHint = new Map<Interface | Union, NamingHint>();
}
