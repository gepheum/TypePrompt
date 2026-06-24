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

type Token = {
  readonly kind: "identifier" | "symbol" | "string-literal" | "comment";
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

    const namesToCheck: Array<{
      readonly name: string;
      readonly start: number;
      readonly end: number;
    }> = [];
    for (const member of typeRef.members) {
      if (member.kind === "string-literal") {
        namesToCheck.push({
          name: member.value,
          start: member.quoted_name.start,
          end: member.quoted_name.end,
        });
        this.validateStringLiteralName(member);
        continue;
      }

      this.validateFieldNameAmbiguity(Object.values(member.fields));
      for (const field of Object.values(member.fields)) {
        this.validateTypeRefNoNameAmbiguity(field.type);
      }
      const discriminator = this.getSingleDiscriminatorLiteral(member);
      if (discriminator) {
        namesToCheck.push(discriminator);
      }
    }
    this.pushErrors(
      checkNoAmbiguity(namesToCheck, { exactMatchIsConflict: true }),
    );
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
    let cursor = 0;
    let depthCurly = 0;
    let depthSquare = 0;
    let depthParen = 0;
    let pendingDoc = "";

    while (true) {
      const token = this.nextToken(cursor);
      if (!token) {
        break;
      }
      cursor = token.end;

      const isTopLevel =
        depthCurly === 0 && depthSquare === 0 && depthParen === 0;

      if (token.kind === "comment") {
        if (!isTopLevel) {
          continue;
        }
        const parsed = parseLeadingJsDoc(token.text);
        if (parsed.nextOffset === token.text.length) {
          pendingDoc = parsed.doc;
        } else {
          pendingDoc = "";
        }
        continue;
      }

      if (
        isTopLevel &&
        token.kind === "identifier" &&
        (token.text === "interface" || token.text === "type")
      ) {
        const doc = pendingDoc;
        pendingDoc = "";
        if (token.text === "interface") {
          const parsed = this.parseInterfaceDeclaration(token.start, doc);
          if (parsed) {
            declarations[parsed.declaration.name.text] = parsed.declaration;
            cursor = parsed.nextCursor;
            continue;
          }
        } else {
          const parsed = this.parseTypeDeclaration(token.start, doc);
          if (parsed) {
            declarations[parsed.declaration.name.text] = parsed.declaration;
            cursor = parsed.nextCursor;
            continue;
          }
        }
      }

      if (isTopLevel) {
        pendingDoc = "";
      }

      if (token.kind !== "symbol") {
        continue;
      }
      if (token.text === "{") {
        depthCurly += 1;
      } else if (token.text === "}") {
        depthCurly = Math.max(0, depthCurly - 1);
      } else if (token.text === "[") {
        depthSquare += 1;
      } else if (token.text === "]") {
        depthSquare = Math.max(0, depthSquare - 1);
      } else if (token.text === "(") {
        depthParen += 1;
      } else if (token.text === ")") {
        depthParen = Math.max(0, depthParen - 1);
      }
    }

    this.cursor = cursor;
    return declarations;
  }

  private nextToken(from = this.cursor): Token | null {
    return nextTokenFromText(this.text, from);
  }

  private parseInterfaceDeclaration(
    keywordStart: number,
    doc: string,
  ): {
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
        doc,
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
      const leadingJsDoc = parseLeadingJsDoc(raw);
      const rawWithoutDoc = raw.slice(leadingJsDoc.nextOffset);
      const leading = rawWithoutDoc.match(/^\s*/)?.[0].length ?? 0;
      const trailing = rawWithoutDoc.match(/\s*$/)?.[0].length ?? 0;
      const trimmed = rawWithoutDoc.slice(
        leading,
        Math.max(leading, rawWithoutDoc.length - trailing),
      );
      if (trimmed.length === 0) {
        continue;
      }

      const match = trimmed.match(
        /^([A-Za-z_][A-Za-z0-9_]*)(\?)?\s*:\s*(.+)$/s,
      );
      if (!match) {
        const segmentStart =
          bodyStart + segment.start + leadingJsDoc.nextOffset + leading;
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
          bodyStart + segment.start + leadingJsDoc.nextOffset,
          bodyStart + segment.end,
          `Missing type for field '${nameText}'`,
        );
        continue;
      }

      const memberStartInBody =
        segment.start + leadingJsDoc.nextOffset + leading;
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
        doc: leadingJsDoc.doc,
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

  private parseTypeDeclaration(
    keywordStart: number,
    doc: string,
  ): {
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
        doc,
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
  let partStart = 0;

  let cursor = 0;
  while (true) {
    const token = nextTokenFromText(text, cursor);
    if (!token) {
      break;
    }
    cursor = token.end;
    if (token.kind !== "symbol") {
      continue;
    }

    if (token.text === "{") {
      depthCurly += 1;
      continue;
    }
    if (token.text === "}") {
      depthCurly = Math.max(0, depthCurly - 1);
      continue;
    }
    if (token.text === "[") {
      depthSquare += 1;
      continue;
    }
    if (token.text === "]") {
      depthSquare = Math.max(0, depthSquare - 1);
      continue;
    }
    if (token.text === "(") {
      depthParen += 1;
      continue;
    }
    if (token.text === ")") {
      depthParen = Math.max(0, depthParen - 1);
      continue;
    }

    if (
      token.text === "|" &&
      depthCurly === 0 &&
      depthSquare === 0 &&
      depthParen === 0
    ) {
      parts.push({ start: partStart, end: token.start });
      partStart = token.end;
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
  let segmentStart = 0;

  let cursor = 0;
  while (true) {
    const token = nextTokenFromText(text, cursor);
    if (!token) {
      break;
    }
    cursor = token.end;
    if (token.kind !== "symbol") {
      continue;
    }

    if (token.text === "{") {
      depthCurly += 1;
      continue;
    }
    if (token.text === "}") {
      depthCurly = Math.max(0, depthCurly - 1);
      continue;
    }
    if (token.text === "[") {
      depthSquare += 1;
      continue;
    }
    if (token.text === "]") {
      depthSquare = Math.max(0, depthSquare - 1);
      continue;
    }
    if (token.text === "(") {
      depthParen += 1;
      continue;
    }
    if (token.text === ")") {
      depthParen = Math.max(0, depthParen - 1);
      continue;
    }

    if (
      token.text === ";" &&
      depthCurly === 0 &&
      depthSquare === 0 &&
      depthParen === 0
    ) {
      segments.push({ start: segmentStart, end: token.start });
      segmentStart = token.end;
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

  let cursor = start;
  while (true) {
    const token = nextTokenFromText(text, cursor);
    if (!token) {
      break;
    }
    cursor = token.end;
    if (token.kind !== "symbol") {
      continue;
    }

    if (token.text === "{") {
      depthCurly += 1;
      continue;
    }
    if (token.text === "}") {
      depthCurly = Math.max(0, depthCurly - 1);
      continue;
    }
    if (token.text === "[") {
      depthSquare += 1;
      continue;
    }
    if (token.text === "]") {
      depthSquare = Math.max(0, depthSquare - 1);
      continue;
    }
    if (token.text === "(") {
      depthParen += 1;
      continue;
    }
    if (token.text === ")") {
      depthParen = Math.max(0, depthParen - 1);
      continue;
    }

    if (
      token.text === ";" &&
      depthCurly === 0 &&
      depthSquare === 0 &&
      depthParen === 0
    ) {
      return token.end;
    }
  }

  return text.length;
}

function findMatchingBrace(text: string, openBracePos: number): number {
  let depth = 0;

  let cursor = openBracePos;
  while (true) {
    const token = nextTokenFromText(text, cursor);
    if (!token) {
      break;
    }
    cursor = token.end;
    if (token.kind !== "symbol") {
      continue;
    }

    if (token.text === "{") {
      depth += 1;
      continue;
    }
    if (token.text === "}") {
      depth -= 1;
      if (depth === 0) {
        return token.start;
      }
    }
  }

  return -1;
}

function nextTokenFromText(text: string, from: number): Token | null {
  let cursor = from;
  while (cursor < text.length && /\s/.test(text[cursor]!)) {
    cursor += 1;
  }
  if (cursor >= text.length) {
    return null;
  }

  const ch = text[cursor]!;
  const next = text[cursor + 1];

  if (ch === "/" && next === "/") {
    const lineEnd = text.indexOf("\n", cursor + 2);
    const end = lineEnd < 0 ? text.length : lineEnd;
    return {
      kind: "comment",
      text: text.slice(cursor, end),
      start: cursor,
      end,
    };
  }

  if (ch === "/" && next === "*") {
    let blockEnd = text.indexOf("*/", cursor + 2);
    while (blockEnd >= 0) {
      const adjacentJsDocStart = blockEnd + 1;
      if (!text.startsWith("/**", adjacentJsDocStart)) {
        break;
      }
      const extendedEnd = text.indexOf("*/", adjacentJsDocStart + 3);
      if (extendedEnd < 0) {
        blockEnd = -1;
        break;
      }
      blockEnd = extendedEnd;
    }

    const end = blockEnd < 0 ? text.length : blockEnd + 2;
    return {
      kind: "comment",
      text: text.slice(cursor, end),
      start: cursor,
      end,
    };
  }

  if (ch === "'" || ch === '"' || ch === "`") {
    let end = cursor + 1;
    while (end < text.length) {
      const c = text[end]!;
      if (c === "\\") {
        end += 2;
        continue;
      }
      if (c === ch) {
        end += 1;
        break;
      }
      if (ch !== "`" && c === "\n") {
        break;
      }
      end += 1;
    }
    return {
      kind: "string-literal",
      text: text.slice(cursor, end),
      start: cursor,
      end,
    };
  }

  if (isIdentifierStart(ch)) {
    let end = cursor + 1;
    while (end < text.length && isIdentifierPart(text[end]!)) {
      end += 1;
    }
    return {
      kind: "identifier",
      text: text.slice(cursor, end),
      start: cursor,
      end,
    };
  }

  return {
    kind: "symbol",
    text: ch,
    start: cursor,
    end: cursor + 1,
  };
}

function parseLeadingJsDoc(raw: string): {
  readonly doc: string;
  readonly nextOffset: number;
} {
  const leadingWhitespace = raw.match(/^\s*/)?.[0].length ?? 0;
  if (!raw.startsWith("/**", leadingWhitespace)) {
    return { doc: "", nextOffset: 0 };
  }

  const commentEnd = raw.indexOf("*/", leadingWhitespace + 3);
  if (commentEnd < 0) {
    return { doc: "", nextOffset: 0 };
  }

  let docBody = raw.slice(leadingWhitespace + 3, commentEnd);
  const nestedMarker = docBody.lastIndexOf("/**");
  if (nestedMarker >= 0 && docBody.slice(0, nestedMarker).trim() === "") {
    docBody = docBody.slice(nestedMarker + 3);
  }

  return {
    doc: normalizeJsDocText(docBody),
    nextOffset: commentEnd + 2,
  };
}

function normalizeJsDocText(raw: string): string {
  const lines = raw.replace(/\r/g, "").split("\n");
  const normalized = lines.map((line) => {
    const withoutPrefix = line.replace(/^\s*\*/, "");
    const withoutLeadingSpace = withoutPrefix.startsWith(" ")
      ? withoutPrefix.slice(1)
      : withoutPrefix;
    return withoutLeadingSpace.trimEnd();
  });

  while (normalized.length > 0 && normalized[0] === "") {
    normalized.shift();
  }
  while (normalized.length > 0 && normalized[normalized.length - 1] === "") {
    normalized.pop();
  }

  return normalized.join("\n");
}

const IDENTIFIER_RE = /[A-Za-z_][A-Za-z0-9_]*/y;
const WHITESPACE_RUN_RE = /\s*/y;

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
