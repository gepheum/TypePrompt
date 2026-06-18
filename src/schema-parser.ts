import { checkNoAmbiguity } from "./casing.js";

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
};

export type TypeDeclaration =
  | InterfaceDeclaration
  | {
      readonly kind: "type";
      readonly name: SchemaSourceSpan;
      readonly valueType: TypeRef;
    };

export type SchemaField = {
  readonly name: SchemaSourceSpan;
  readonly optional: boolean;
  readonly type: TypeRef;
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
  readonly members: readonly (StringLiteralTypeRef | InlineInterfaceTypeRef)[];
};

export type SchemaSourceSpan = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};

export function parseSchema(schemaSource: string): Schema | SchemaParseErrors {
  return new SchemaParser(schemaSource, 0).parse();
}

class SchemaParser {
  private static readonly STRING_LITERAL_NAME_RE = /^[a-z][A-Za-z0-9]*$/;

  private readonly errors: SchemaParseError[] = [];
  private cursor = 0;

  constructor(
    private readonly text: string,
    private readonly sourceStart: number,
  ) {}

  parse(): Schema | SchemaParseErrors {
    const types = this.parseSchemaDeclarations();
    if (this.errors.length > 0) {
      return {
        kind: "error",
        errors: this.errors,
      };
    }

    this.validateNoNameAmbiguity(types);
    this.validateSchema(types);
    if (this.errors.length > 0) {
      return {
        kind: "error",
        errors: this.errors,
      };
    }

    return {
      kind: "success",
      types,
    };
  }

  private validateSchema(declarations: Record<string, TypeDeclaration>): void {
    // Schema consumers expect a top-level Response type as the entry point.
    const response = declarations.Response;
    if (!response) {
      this.pushError(0, 0, "Missing required type 'Response'");
      return;
    }

    const reachable = this.collectReachableTypeNames(declarations, "Response");

    for (const declaration of Object.values(declarations)) {
      const typeName = declaration.name.text;
      if (reachable.has(typeName)) {
        continue;
      }

      this.pushError(
        declaration.name.start,
        declaration.name.end,
        `Type '${typeName}' is not reachable from 'Response'`,
      );
    }
  }

  private validateNoNameAmbiguity(
    declarations: Record<string, TypeDeclaration>,
  ): void {
    this.pushErrors(
      checkNoAmbiguity(
        Object.values(declarations).map((declaration) => ({
          name: declaration.name.text,
          start: declaration.name.start,
          end: declaration.name.end,
        })),
      ),
    );

    for (const declaration of Object.values(declarations)) {
      this.validateDeclarationNoNameAmbiguity(declaration);
    }
  }

  private validateDeclarationNoNameAmbiguity(
    declaration: TypeDeclaration,
  ): void {
    if (declaration.kind === "interface") {
      this.validateFieldNameAmbiguity(Object.values(declaration.fields));
      for (const field of Object.values(declaration.fields)) {
        this.validateTypeRefNoNameAmbiguity(field.type);
      }
      return;
    }

    this.validateTypeRefNoNameAmbiguity(declaration.valueType);
  }

  private validateFieldNameAmbiguity(fields: readonly SchemaField[]): void {
    this.pushErrors(
      checkNoAmbiguity(
        fields.map((field) => ({
          name: field.name.text,
          start: field.name.start,
          end: field.name.end,
        })),
      ),
    );
  }

  private validateTypeRefNoNameAmbiguity(typeRef: TypeRef): void {
    if (typeRef.kind === "string-literal") {
      this.validateStringLiteralName(typeRef);
      return;
    }

    if (typeRef.kind === "type-name") {
      return;
    }

    if (typeRef.kind === "array") {
      this.validateTypeRefNoNameAmbiguity(typeRef.elementType);
      return;
    }

    if (typeRef.kind === "inline-interface") {
      this.validateFieldNameAmbiguity(Object.values(typeRef.fields));
      for (const field of Object.values(typeRef.fields)) {
        this.validateTypeRefNoNameAmbiguity(field.type);
      }
      return;
    }

    const literalMembers = typeRef.members
      .filter(
        (member): member is StringLiteralTypeRef =>
          member.kind === "string-literal",
      )
      .map((member) => ({
        name: member.value,
        start: member.quoted_name.start,
        end: member.quoted_name.end,
      }));
    this.pushErrors(checkNoAmbiguity(literalMembers));
    for (const member of typeRef.members) {
      if (member.kind === "string-literal") {
        this.validateStringLiteralName(member);
        continue;
      }

      this.validateFieldNameAmbiguity(Object.values(member.fields));
      for (const field of Object.values(member.fields)) {
        this.validateTypeRefNoNameAmbiguity(field.type);
      }
    }

    const discriminatorLiterals: Array<{
      readonly name: string;
      readonly start: number;
      readonly end: number;
    }> = [];
    for (const member of typeRef.members) {
      if (member.kind !== "inline-interface") {
        continue;
      }
      const discriminator = this.getSingleDiscriminatorLiteral(member);
      if (discriminator) {
        discriminatorLiterals.push(discriminator);
      }
    }
    this.pushErrors(checkNoAmbiguity(discriminatorLiterals));
  }

  private getSingleDiscriminatorLiteral(member: InlineInterfaceTypeRef):
    | {
        readonly name: string;
        readonly start: number;
        readonly end: number;
      }
    | undefined {
    const firstField = member.firstField;
    if (!firstField) {
      this.pushError(
        0,
        0,
        "Union interface member first field type must be a single string literal",
      );
      return undefined;
    }

    if (firstField.type.kind !== "string-literal") {
      this.pushError(
        firstField.name.start,
        firstField.name.end,
        "Union interface member first field type must be a single string literal",
      );
      return undefined;
    }

    return {
      name: firstField.type.value,
      start: firstField.type.quoted_name.start,
      end: firstField.type.quoted_name.end,
    };
  }

  private validateStringLiteralName(typeRef: StringLiteralTypeRef): void {
    if (SchemaParser.STRING_LITERAL_NAME_RE.test(typeRef.value)) {
      return;
    }

    this.pushError(
      typeRef.quoted_name.start,
      typeRef.quoted_name.end,
      `String literal '${typeRef.value}' must match /^[a-z][A-Za-z0-9]*$/`,
    );
  }

  private collectReachableTypeNames(
    declarations: Record<string, TypeDeclaration>,
    rootTypeName: string,
  ): Set<string> {
    // Walk the type graph from Response and record every named declaration we can reach.
    const reachable = new Set<string>();
    const stack = [rootTypeName];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (reachable.has(current)) {
        continue;
      }
      reachable.add(current);

      const declaration = declarations[current];
      if (!declaration) {
        continue;
      }

      const refs = new Set<string>();
      this.collectDeclarationTypeReferences(declaration, refs);
      for (const refName of refs) {
        if (declarations[refName] && !reachable.has(refName)) {
          stack.push(refName);
        }
      }
    }

    return reachable;
  }

  private collectDeclarationTypeReferences(
    declaration: TypeDeclaration,
    refs: Set<string>,
  ): void {
    if (declaration.kind === "interface") {
      for (const field of Object.values(declaration.fields)) {
        this.collectTypeReferences(field.type, refs);
      }
      return;
    }

    this.collectTypeReferences(declaration.valueType, refs);
  }

  private collectTypeReferences(typeRef: TypeRef, refs: Set<string>): void {
    if (typeRef.kind === "type-name") {
      refs.add(typeRef.name.text);
      return;
    }

    if (typeRef.kind === "array") {
      this.collectTypeReferences(typeRef.elementType, refs);
      return;
    }

    if (typeRef.kind === "inline-interface") {
      for (const field of Object.values(typeRef.fields)) {
        this.collectTypeReferences(field.type, refs);
      }
      return;
    }

    if (typeRef.kind === "union") {
      // Union members are either string literals or inline interfaces in this schema model.
      for (const member of typeRef.members) {
        if (member.kind === "inline-interface") {
          for (const field of Object.values(member.fields)) {
            this.collectTypeReferences(field.type, refs);
          }
        }
      }
    }
  }

  private parseSchemaDeclarations(): Record<string, TypeDeclaration> {
    const declarations: Record<string, TypeDeclaration> = {};
    this.cursor = 0;

    while (this.cursor < this.text.length) {
      const keyword = this.readTopLevelKeyword(this.cursor);
      if (!keyword) {
        this.cursor += 1;
        continue;
      }

      if (keyword.word === "interface") {
        const parsed = this.parseInterfaceDeclaration(keyword.start);
        if (parsed) {
          declarations[parsed.declaration.name.text] = parsed.declaration;
          this.cursor = parsed.nextCursor;
          continue;
        }
      }

      if (keyword.word === "type") {
        const parsed = this.parseTypeDeclaration(keyword.start);
        if (parsed) {
          declarations[parsed.declaration.name.text] = parsed.declaration;
          this.cursor = parsed.nextCursor;
          continue;
        }
      }

      this.cursor = keyword.end;
    }

    return declarations;
  }

  private readTopLevelKeyword(from: number): {
    readonly word: "interface" | "type";
    readonly start: number;
    readonly end: number;
  } | null {
    let depthCurly = 0;
    let depthSquare = 0;
    let depthParen = 0;
    let mode:
      | "normal"
      | "single"
      | "double"
      | "template"
      | "line-comment"
      | "block-comment" = "normal";

    let cursor = from;
    while (cursor < this.text.length) {
      const nextTokenIndex = findNextRegexIndex(
        this.text,
        cursor,
        KEYWORD_SCAN_TOKEN_RE,
      );
      if (nextTokenIndex < 0) {
        return null;
      }
      cursor = nextTokenIndex;
      const ch = this.text[cursor]!;
      const next = this.text[cursor + 1];

      if (mode === "normal") {
        if (ch === "'") {
          mode = "single";
          cursor += 1;
          continue;
        }
        if (ch === '"') {
          mode = "double";
          cursor += 1;
          continue;
        }
        if (ch === "`") {
          mode = "template";
          cursor += 1;
          continue;
        }
        if (ch === "/" && next === "/") {
          mode = "line-comment";
          cursor += 2;
          continue;
        }
        if (ch === "/" && next === "*") {
          mode = "block-comment";
          cursor += 2;
          continue;
        }

        if (ch === "{") {
          depthCurly += 1;
          cursor += 1;
          continue;
        }
        if (ch === "}") {
          depthCurly = Math.max(0, depthCurly - 1);
          cursor += 1;
          continue;
        }
        if (ch === "[") {
          depthSquare += 1;
          cursor += 1;
          continue;
        }
        if (ch === "]") {
          depthSquare = Math.max(0, depthSquare - 1);
          cursor += 1;
          continue;
        }
        if (ch === "(") {
          depthParen += 1;
          cursor += 1;
          continue;
        }
        if (ch === ")") {
          depthParen = Math.max(0, depthParen - 1);
          cursor += 1;
          continue;
        }

        if (depthCurly !== 0 || depthSquare !== 0 || depthParen !== 0) {
          cursor += 1;
          continue;
        }

        if (!isIdentifierStart(ch)) {
          cursor += 1;
          continue;
        }

        let end = cursor + 1;
        while (end < this.text.length && isIdentifierPart(this.text[end]!)) {
          end += 1;
        }

        const word = this.text.slice(cursor, end);
        if (word !== "interface" && word !== "type") {
          cursor = end;
          continue;
        }

        return { word, start: cursor, end };
      }

      if (mode === "single") {
        const nextSpecial = findNextRegexIndex(
          this.text,
          cursor,
          SINGLE_QUOTE_SCAN_RE,
        );
        if (nextSpecial < 0) {
          return null;
        }
        cursor = nextSpecial;
        if (this.text[cursor] === "\\") {
          cursor += 2;
        } else {
          mode = "normal";
          cursor += 1;
        }
        continue;
      }

      if (mode === "double") {
        const nextSpecial = findNextRegexIndex(
          this.text,
          cursor,
          DOUBLE_OR_NEWLINE_SCAN_RE,
        );
        if (nextSpecial < 0) {
          return null;
        }
        cursor = nextSpecial;
        if (this.text[cursor] === "\n") {
          mode = "normal";
          cursor += 1;
        } else if (this.text[cursor] === "\\") {
          cursor += 2;
        } else {
          mode = "normal";
          cursor += 1;
        }
        continue;
      }

      if (mode === "template") {
        const nextSpecial = findNextRegexIndex(
          this.text,
          cursor,
          TEMPLATE_SCAN_RE,
        );
        if (nextSpecial < 0) {
          return null;
        }
        cursor = nextSpecial;
        if (this.text[cursor] === "\\") {
          cursor += 2;
        } else {
          mode = "normal";
          cursor += 1;
        }
        continue;
      }

      if (mode === "line-comment") {
        const lineEnd = this.text.indexOf("\n", cursor);
        if (lineEnd < 0) {
          return null;
        }
        cursor = lineEnd + 1;
        mode = "normal";
        continue;
      }

      const blockEnd = this.text.indexOf("*/", cursor);
      if (blockEnd < 0) {
        return null;
      }
      cursor = blockEnd + 2;
      mode = "normal";
    }

    return null;
  }

  private parseInterfaceDeclaration(keywordStart: number): {
    readonly declaration: TypeDeclaration;
    readonly nextCursor: number;
  } | null {
    let cursor = keywordStart + "interface".length;
    cursor = skipWithRegex(this.text, cursor, WHITESPACE_RUN_RE);
    const nameMatch = matchAt(this.text, cursor, IDENTIFIER_RE);
    if (!nameMatch) {
      this.pushError(
        this.sourceStart + cursor,
        this.sourceStart + Math.min(cursor + 1, this.text.length),
        "Expected interface name",
      );
      return null;
    }

    const nameStart = cursor;
    cursor += nameMatch[0].length;
    const nameEnd = cursor;

    cursor = skipWithRegex(this.text, cursor, WHITESPACE_RUN_RE);
    if (this.text[cursor] !== "{") {
      this.pushError(
        this.sourceStart + cursor,
        this.sourceStart + Math.min(cursor + 1, this.text.length),
        "Expected '{' after interface name",
      );
      return null;
    }

    const bodyStart = cursor + 1;
    const bodyEnd = findMatchingBrace(this.text, cursor);
    if (bodyEnd < 0) {
      this.pushError(
        this.sourceStart + cursor,
        this.sourceStart + this.text.length,
        "Unclosed interface body",
      );
      return null;
    }

    const fields = this.parseInterfaceFields(
      this.text.slice(bodyStart, bodyEnd),
      this.sourceStart + bodyStart,
    );

    return {
      declaration: {
        kind: "interface",
        name: {
          text: this.text.slice(nameStart, nameEnd),
          start: this.sourceStart + nameStart,
          end: this.sourceStart + nameEnd,
        },
        fields: fields.fields,
        firstField: fields.firstField,
      },
      nextCursor: bodyEnd + 1,
    };
  }

  private parseInterfaceFields(
    text: string,
    bodyStart: number,
  ): {
    readonly fields: Record<string, SchemaField>;
    readonly firstField?: SchemaField;
  } {
    const fields: Record<string, SchemaField> = {};
    let firstField: SchemaField | undefined;

    const segments = splitTopLevelSemicolonSegments(text);
    for (const segment of segments) {
      const raw = text.slice(segment.start, segment.end);
      const leading = raw.match(/^\s*/)?.[0].length ?? 0;
      const trailing = raw.match(/\s*$/)?.[0].length ?? 0;
      const trimmed = raw.slice(
        leading,
        Math.max(leading, raw.length - trailing),
      );
      if (trimmed.length === 0) {
        continue;
      }

      const match = trimmed.match(
        /^([A-Za-z_][A-Za-z0-9_]*)(\?)?\s*:\s*(.+)$/s,
      );
      if (!match) {
        const segmentStart = bodyStart + segment.start + leading;
        this.pushError(
          segmentStart,
          segmentStart + trimmed.length,
          "Invalid interface field declaration",
        );
        continue;
      }

      const nameText = match[1]!;
      const optional = Boolean(match[2]);
      const colonIndex = trimmed.indexOf(":");
      const typeRaw = trimmed.slice(colonIndex + 1);
      const typeLeading = typeRaw.match(/^\s*/)?.[0].length ?? 0;
      const typeText = typeRaw.slice(typeLeading).trimEnd();
      if (typeText.length === 0) {
        this.pushError(
          bodyStart + segment.start,
          bodyStart + segment.end,
          `Missing type for field '${nameText}'`,
        );
        continue;
      }

      const memberStartInBody = segment.start + leading;
      const memberStart = bodyStart + memberStartInBody;
      const typeStartInMember = colonIndex + 1 + typeLeading;
      const typeStart = memberStart + typeStartInMember;
      const nameStart = memberStart;
      const nameEnd = nameStart + nameText.length;
      const typeRef = this.parseSchemaTypeRef(typeText, typeStart);
      if (!typeRef) {
        this.pushError(
          typeStart,
          typeStart + typeText.length,
          `Invalid type for field '${nameText}'`,
        );
        continue;
      }

      const field: SchemaField = {
        name: {
          text: nameText,
          start: nameStart,
          end: nameEnd,
        },
        optional,
        type: typeRef,
      };

      if (!firstField) {
        firstField = field;
      }
      fields[nameText] = field;
    }

    return { fields, firstField };
  }

  private parseSchemaTypeRef(rawText: string, start: number): TypeRef | null {
    const trimmed = trimSlice(rawText, 0, rawText.length);
    if (trimmed.text.length === 0) {
      return null;
    }

    const rawOffsetStart = trimmed.start;
    let baseText = trimmed.text;
    let baseStart = start + rawOffsetStart;

    const arraySuffixes: Array<{
      readonly start: number;
      readonly end: number;
    }> = [];
    while (true) {
      const suffix = parseTopLevelArraySuffix(baseText);
      if (!suffix) {
        break;
      }
      arraySuffixes.push({
        start: baseStart + suffix.suffixStart,
        end: baseStart + suffix.suffixEnd,
      });
      baseText = suffix.baseText;
      const baseTrimmed = trimSlice(baseText, 0, baseText.length);
      baseStart += baseTrimmed.start;
      baseText = baseTrimmed.text;
    }

    const unionParts = splitTopLevelByPipe(baseText);
    const nonEmptyUnionParts = unionParts
      .map((part) => trimSlice(baseText, part.start, part.end))
      .filter((part) => part.text.length > 0);

    let baseRef: TypeRef | null;
    if (nonEmptyUnionParts.length > 1) {
      const members: Array<StringLiteralTypeRef | InlineInterfaceTypeRef> = [];
      for (const partTrimmed of nonEmptyUnionParts) {
        const memberStart = baseStart + partTrimmed.start;
        const member = this.parseUnionMemberTypeRef(
          partTrimmed.text,
          memberStart,
        );
        if (!member) {
          return null;
        }
        members.push(member);
      }

      baseRef = {
        kind: "union",
        members,
      };
    } else {
      baseRef = this.parseSingleSchemaTypeRef(baseText, baseStart);
    }

    if (!baseRef) {
      return null;
    }

    let wrapped: TypeRef = baseRef;
    for (let i = arraySuffixes.length - 1; i >= 0; i -= 1) {
      wrapped = {
        kind: "array",
        elementType: wrapped,
      };
    }

    return wrapped;
  }

  private parseUnionMemberTypeRef(
    text: string,
    start: number,
  ): StringLiteralTypeRef | InlineInterfaceTypeRef | null {
    const literal = this.parseStringLiteralTypeRef(text, start);
    if (literal) {
      return literal;
    }
    const inlineInterface = this.parseInlineInterfaceTypeRef(text, start);
    if (inlineInterface) {
      return inlineInterface;
    }
    return null;
  }

  private parseSingleSchemaTypeRef(
    text: string,
    start: number,
  ): TypeRef | null {
    const inlineInterface = this.parseInlineInterfaceTypeRef(text, start);
    if (inlineInterface) {
      return inlineInterface;
    }

    const literal = this.parseStringLiteralTypeRef(text, start);
    if (literal) {
      return literal;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
      return {
        kind: "type-name",
        name: {
          text,
          start,
          end: start + text.length,
        },
      };
    }

    return null;
  }

  private parseInlineInterfaceTypeRef(
    text: string,
    start: number,
  ): InlineInterfaceTypeRef | null {
    if (!text.startsWith("{") || !text.endsWith("}")) {
      return null;
    }
    const close = findMatchingBrace(text, 0);
    if (close !== text.length - 1) {
      return null;
    }

    const fields = this.parseInterfaceFields(
      text.slice(1, text.length - 1),
      start + 1,
    );
    return {
      kind: "inline-interface",
      fields: fields.fields,
      firstField: fields.firstField,
    };
  }

  private parseStringLiteralTypeRef(
    text: string,
    start: number,
  ): StringLiteralTypeRef | null {
    if (text.length < 2) {
      return null;
    }
    const quote = text[0]!;
    if ((quote !== '"' && quote !== "'") || text[text.length - 1] !== quote) {
      return null;
    }

    return {
      kind: "string-literal",
      value: decodeTypeStringLiteral(text),
      quoted_name: {
        text,
        start,
        end: start + text.length,
      },
    };
  }

  private parseTypeDeclaration(keywordStart: number): {
    readonly declaration: TypeDeclaration;
    readonly nextCursor: number;
  } | null {
    let cursor = keywordStart + "type".length;
    cursor = skipWithRegex(this.text, cursor, WHITESPACE_RUN_RE);
    const nameMatch = matchAt(this.text, cursor, IDENTIFIER_RE);
    if (!nameMatch) {
      this.pushError(
        this.sourceStart + cursor,
        this.sourceStart + Math.min(cursor + 1, this.text.length),
        "Expected type name",
      );
      return null;
    }

    const nameStart = cursor;
    cursor += nameMatch[0].length;
    const nameEnd = cursor;

    cursor = skipWithRegex(this.text, cursor, WHITESPACE_RUN_RE);
    if (this.text[cursor] !== "=") {
      this.pushError(
        this.sourceStart + cursor,
        this.sourceStart + Math.min(cursor + 1, this.text.length),
        "Expected '=' after type name",
      );
      return null;
    }
    cursor += 1;

    const typeValueStart = cursor;
    const statementEnd = findTopLevelStatementEnd(this.text, typeValueStart);
    const valueEnd =
      statementEnd > typeValueStart && this.text[statementEnd - 1] === ";"
        ? statementEnd - 1
        : statementEnd;
    const valueRaw = this.text.slice(typeValueStart, valueEnd);
    const leading = valueRaw.match(/^\s*/)?.[0].length ?? 0;
    const trailing = valueRaw.match(/\s*$/)?.[0].length ?? 0;
    const valueText = valueRaw.slice(
      leading,
      Math.max(leading, valueRaw.length - trailing),
    );
    if (valueText.length === 0) {
      this.pushError(
        this.sourceStart + typeValueStart,
        this.sourceStart + valueEnd,
        "Expected type value",
      );
      return null;
    }

    const valueType = this.parseSchemaTypeRef(
      valueText,
      this.sourceStart + typeValueStart + leading,
    );
    if (!valueType) {
      this.pushError(
        this.sourceStart + typeValueStart + leading,
        this.sourceStart + typeValueStart + leading + valueText.length,
        "Invalid type value",
      );
      return null;
    }

    return {
      declaration: {
        kind: "type",
        name: {
          text: this.text.slice(nameStart, nameEnd),
          start: this.sourceStart + nameStart,
          end: this.sourceStart + nameEnd,
        },
        valueType,
      },
      nextCursor: statementEnd,
    };
  }

  private pushError(start: number, end: number, message: string): void {
    this.errors.push({
      start,
      end: Math.max(start, end),
      message,
    });
  }

  private pushErrors(
    errors: ReadonlyArray<{
      readonly start: number;
      readonly end: number;
      readonly message: string;
    }>,
  ): void {
    for (const error of errors) {
      this.pushError(error.start, error.end, error.message);
    }
  }
}

function decodeTypeStringLiteral(text: string): string {
  if (text.startsWith('"')) {
    try {
      return JSON.parse(text) as string;
    } catch {
      return text.slice(1, -1);
    }
  }

  const inner = text.slice(1, -1);
  return inner.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}

function parseTopLevelArraySuffix(text: string): {
  readonly baseText: string;
  readonly suffixStart: number;
  readonly suffixEnd: number;
} | null {
  const trimmed = trimSlice(text, 0, text.length);
  if (!trimmed.text.endsWith("]")) {
    return null;
  }

  const localEnd = trimmed.end;
  const closePos = localEnd - 1;
  const preClose = text.slice(trimmed.start, closePos);
  const openMatch = preClose.match(/\[\s*$/);
  if (!openMatch) {
    return null;
  }
  const cursor = trimmed.start + openMatch.index!;

  return {
    baseText: text.slice(0, cursor),
    suffixStart: cursor,
    suffixEnd: closePos + 1,
  };
}

function splitTopLevelByPipe(
  text: string,
): ReadonlyArray<{ readonly start: number; readonly end: number }> {
  const parts: Array<{ readonly start: number; readonly end: number }> = [];
  let depthCurly = 0;
  let depthSquare = 0;
  let depthParen = 0;
  let mode:
    | "normal"
    | "single"
    | "double"
    | "template"
    | "line-comment"
    | "block-comment" = "normal";
  let partStart = 0;

  let cursor = 0;
  while (cursor < text.length) {
    const nextTokenIndex = findNextRegexIndex(
      text,
      cursor,
      SPLIT_PIPE_TOKEN_RE,
    );
    if (nextTokenIndex < 0) {
      break;
    }
    cursor = nextTokenIndex;
    const ch = text[cursor]!;
    const next = text[cursor + 1];

    if (mode === "normal") {
      if (ch === "'") {
        mode = "single";
        cursor += 1;
        continue;
      }
      if (ch === '"') {
        mode = "double";
        cursor += 1;
        continue;
      }
      if (ch === "`") {
        mode = "template";
        cursor += 1;
        continue;
      }
      if (ch === "/" && next === "/") {
        mode = "line-comment";
        cursor += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        mode = "block-comment";
        cursor += 2;
        continue;
      }

      if (ch === "{") {
        depthCurly += 1;
        cursor += 1;
        continue;
      }
      if (ch === "}") {
        depthCurly = Math.max(0, depthCurly - 1);
        cursor += 1;
        continue;
      }
      if (ch === "[") {
        depthSquare += 1;
        cursor += 1;
        continue;
      }
      if (ch === "]") {
        depthSquare = Math.max(0, depthSquare - 1);
        cursor += 1;
        continue;
      }
      if (ch === "(") {
        depthParen += 1;
        cursor += 1;
        continue;
      }
      if (ch === ")") {
        depthParen = Math.max(0, depthParen - 1);
        cursor += 1;
        continue;
      }

      if (
        ch === "|" &&
        depthCurly === 0 &&
        depthSquare === 0 &&
        depthParen === 0
      ) {
        parts.push({ start: partStart, end: cursor });
        partStart = cursor + 1;
      }
      cursor += 1;
      continue;
    }

    if (mode === "single") {
      const nextSpecial = findNextRegexIndex(
        text,
        cursor,
        SINGLE_QUOTE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "double") {
      const nextSpecial = findNextRegexIndex(
        text,
        cursor,
        DOUBLE_QUOTE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "template") {
      const nextSpecial = findNextRegexIndex(text, cursor, TEMPLATE_SCAN_RE);
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "line-comment") {
      const lineEnd = text.indexOf("\n", cursor);
      if (lineEnd < 0) {
        break;
      }
      cursor = lineEnd + 1;
      mode = "normal";
      continue;
    }

    if (mode === "block-comment") {
      const blockEnd = text.indexOf("*/", cursor);
      if (blockEnd < 0) {
        break;
      }
      cursor = blockEnd + 2;
      mode = "normal";
      continue;
    }
  }

  parts.push({ start: partStart, end: text.length });
  return parts;
}

function trimSlice(
  text: string,
  start: number,
  end: number,
): { readonly text: string; readonly start: number; readonly end: number } {
  const segment = text.slice(start, end);
  const leading = segment.match(/^\s*/)?.[0].length ?? 0;
  const trailing = segment.match(/\s*$/)?.[0].length ?? 0;
  const left = start + leading;
  const right = Math.max(left, end - trailing);

  return {
    text: text.slice(left, right),
    start: left,
    end: right,
  };
}

function splitTopLevelSemicolonSegments(
  text: string,
): ReadonlyArray<{ readonly start: number; readonly end: number }> {
  const segments: Array<{ readonly start: number; readonly end: number }> = [];
  let depthCurly = 0;
  let depthSquare = 0;
  let depthParen = 0;
  let mode:
    | "normal"
    | "single"
    | "double"
    | "template"
    | "line-comment"
    | "block-comment" = "normal";
  let segmentStart = 0;

  let cursor = 0;
  while (cursor < text.length) {
    const nextTokenIndex = findNextRegexIndex(
      text,
      cursor,
      SPLIT_SEMICOLON_TOKEN_RE,
    );
    if (nextTokenIndex < 0) {
      break;
    }
    cursor = nextTokenIndex;
    const ch = text[cursor]!;
    const next = text[cursor + 1];

    if (mode === "normal") {
      if (ch === "'") {
        mode = "single";
        cursor += 1;
        continue;
      }
      if (ch === '"') {
        mode = "double";
        cursor += 1;
        continue;
      }
      if (ch === "`") {
        mode = "template";
        cursor += 1;
        continue;
      }
      if (ch === "/" && next === "/") {
        mode = "line-comment";
        cursor += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        mode = "block-comment";
        cursor += 2;
        continue;
      }

      if (ch === "{") {
        depthCurly += 1;
        cursor += 1;
        continue;
      }
      if (ch === "}") {
        depthCurly = Math.max(0, depthCurly - 1);
        cursor += 1;
        continue;
      }
      if (ch === "[") {
        depthSquare += 1;
        cursor += 1;
        continue;
      }
      if (ch === "]") {
        depthSquare = Math.max(0, depthSquare - 1);
        cursor += 1;
        continue;
      }
      if (ch === "(") {
        depthParen += 1;
        cursor += 1;
        continue;
      }
      if (ch === ")") {
        depthParen = Math.max(0, depthParen - 1);
        cursor += 1;
        continue;
      }

      if (
        ch === ";" &&
        depthCurly === 0 &&
        depthSquare === 0 &&
        depthParen === 0
      ) {
        segments.push({ start: segmentStart, end: cursor });
        segmentStart = cursor + 1;
      }
      cursor += 1;
      continue;
    }

    if (mode === "single") {
      const nextSpecial = findNextRegexIndex(
        text,
        cursor,
        SINGLE_QUOTE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "double") {
      const nextSpecial = findNextRegexIndex(
        text,
        cursor,
        DOUBLE_QUOTE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "template") {
      const nextSpecial = findNextRegexIndex(text, cursor, TEMPLATE_SCAN_RE);
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "line-comment") {
      const lineEnd = text.indexOf("\n", cursor);
      if (lineEnd < 0) {
        break;
      }
      cursor = lineEnd + 1;
      mode = "normal";
      continue;
    }

    if (mode === "block-comment") {
      const blockEnd = text.indexOf("*/", cursor);
      if (blockEnd < 0) {
        break;
      }
      cursor = blockEnd + 2;
      mode = "normal";
      continue;
    }
  }

  if (segmentStart < text.length) {
    segments.push({ start: segmentStart, end: text.length });
  }

  return segments;
}

function findTopLevelStatementEnd(text: string, start: number): number {
  let depthCurly = 0;
  let depthSquare = 0;
  let depthParen = 0;
  let mode:
    | "normal"
    | "single"
    | "double"
    | "template"
    | "line-comment"
    | "block-comment" = "normal";

  let cursor = start;
  while (cursor < text.length) {
    const nextTokenIndex = findNextRegexIndex(
      text,
      cursor,
      STATEMENT_END_TOKEN_RE,
    );
    if (nextTokenIndex < 0) {
      break;
    }
    cursor = nextTokenIndex;
    const ch = text[cursor]!;
    const next = text[cursor + 1];

    if (mode === "normal") {
      if (ch === "'") {
        mode = "single";
        cursor += 1;
        continue;
      }
      if (ch === '"') {
        mode = "double";
        cursor += 1;
        continue;
      }
      if (ch === "`") {
        mode = "template";
        cursor += 1;
        continue;
      }
      if (ch === "/" && next === "/") {
        mode = "line-comment";
        cursor += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        mode = "block-comment";
        cursor += 2;
        continue;
      }

      if (ch === "{") {
        depthCurly += 1;
        cursor += 1;
        continue;
      }
      if (ch === "}") {
        depthCurly = Math.max(0, depthCurly - 1);
        cursor += 1;
        continue;
      }
      if (ch === "[") {
        depthSquare += 1;
        cursor += 1;
        continue;
      }
      if (ch === "]") {
        depthSquare = Math.max(0, depthSquare - 1);
        cursor += 1;
        continue;
      }
      if (ch === "(") {
        depthParen += 1;
        cursor += 1;
        continue;
      }
      if (ch === ")") {
        depthParen = Math.max(0, depthParen - 1);
        cursor += 1;
        continue;
      }

      if (
        ch === ";" &&
        depthCurly === 0 &&
        depthSquare === 0 &&
        depthParen === 0
      ) {
        return cursor + 1;
      }
      cursor += 1;
      continue;
    }

    if (mode === "single") {
      const nextSpecial = findNextRegexIndex(
        text,
        cursor,
        SINGLE_QUOTE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "double") {
      const nextSpecial = findNextRegexIndex(
        text,
        cursor,
        DOUBLE_QUOTE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "template") {
      const nextSpecial = findNextRegexIndex(text, cursor, TEMPLATE_SCAN_RE);
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "line-comment") {
      const lineEnd = text.indexOf("\n", cursor);
      if (lineEnd < 0) {
        break;
      }
      cursor = lineEnd + 1;
      mode = "normal";
      continue;
    }

    if (mode === "block-comment") {
      const blockEnd = text.indexOf("*/", cursor);
      if (blockEnd < 0) {
        break;
      }
      cursor = blockEnd + 2;
      mode = "normal";
      continue;
    }
  }

  return text.length;
}

function findMatchingBrace(text: string, openBracePos: number): number {
  let depth = 0;
  let mode:
    | "normal"
    | "single"
    | "double"
    | "template"
    | "line-comment"
    | "block-comment" = "normal";

  let cursor = openBracePos;
  while (cursor < text.length) {
    const nextTokenIndex = findNextRegexIndex(
      text,
      cursor,
      BRACE_MATCH_TOKEN_RE,
    );
    if (nextTokenIndex < 0) {
      break;
    }
    cursor = nextTokenIndex;
    const ch = text[cursor]!;
    const next = text[cursor + 1];

    if (mode === "normal") {
      if (ch === "'") {
        mode = "single";
        cursor += 1;
        continue;
      }
      if (ch === '"') {
        mode = "double";
        cursor += 1;
        continue;
      }
      if (ch === "`") {
        mode = "template";
        cursor += 1;
        continue;
      }
      if (ch === "/" && next === "/") {
        mode = "line-comment";
        cursor += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        mode = "block-comment";
        cursor += 2;
        continue;
      }

      if (ch === "{") {
        depth += 1;
        cursor += 1;
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return cursor;
        }
        cursor += 1;
      }
      cursor += 1;
      continue;
    }

    if (mode === "single") {
      const nextSpecial = findNextRegexIndex(
        text,
        cursor,
        SINGLE_QUOTE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "double") {
      const nextSpecial = findNextRegexIndex(
        text,
        cursor,
        DOUBLE_QUOTE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "template") {
      const nextSpecial = findNextRegexIndex(text, cursor, TEMPLATE_SCAN_RE);
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        mode = "normal";
        cursor += 1;
      }
      continue;
    }

    if (mode === "line-comment") {
      const lineEnd = text.indexOf("\n", cursor);
      if (lineEnd < 0) {
        break;
      }
      cursor = lineEnd + 1;
      mode = "normal";
      continue;
    }

    if (mode === "block-comment") {
      const blockEnd = text.indexOf("*/", cursor);
      if (blockEnd < 0) {
        break;
      }
      cursor = blockEnd + 2;
      mode = "normal";
      continue;
    }
  }

  return -1;
}

const IDENTIFIER_RE = /[A-Za-z_][A-Za-z0-9_]*/y;
const WHITESPACE_RUN_RE = /\s*/y;
const KEYWORD_SCAN_TOKEN_RE = /[A-Za-z_'"`{}[\]()/]/g;
const SPLIT_PIPE_TOKEN_RE = /['"`{}[\]()|/]/g;
const SPLIT_SEMICOLON_TOKEN_RE = /['"`{}[\]();/]/g;
const STATEMENT_END_TOKEN_RE = /['"`{}[\]();/]/g;
const BRACE_MATCH_TOKEN_RE = /['"`{}/]/g;
const SINGLE_QUOTE_SCAN_RE = /[\\']/g;
const DOUBLE_QUOTE_SCAN_RE = /[\\"]/g;
const DOUBLE_OR_NEWLINE_SCAN_RE = /[\\"\n]/g;
const TEMPLATE_SCAN_RE = /[\\`]/g;

function findNextRegexIndex(
  text: string,
  start: number,
  pattern: RegExp,
): number {
  pattern.lastIndex = start;
  const match = pattern.exec(text);
  return match ? match.index : -1;
}

function matchAt(
  text: string,
  start: number,
  pattern: RegExp,
): RegExpExecArray | null {
  pattern.lastIndex = start;
  return pattern.exec(text);
}

function skipWithRegex(text: string, start: number, pattern: RegExp): number {
  const match = matchAt(text, start, pattern);
  return match ? start + match[0].length : start;
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}
