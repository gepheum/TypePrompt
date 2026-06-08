import type {
  ArrayTypeRef,
  CodeSlice,
  Error,
  Example,
  InlineInterfaceTypeRef,
  JsonArray,
  JsonBoolean,
  JsonEllipsis,
  JsonNull,
  JsonNumber,
  JsonObject,
  JsonObjectEntry,
  JsonString,
  JsonValue,
  Line,
  Result,
  Schema,
  SchemaField,
  StringLiteralTypeRef,
  Template,
  TemplateFile,
  TemplatePiece,
  TypeDeclaration,
  TypeRef,
  UnionTypeRef,
} from "./types.js";

interface HeaderParseResult {
  readonly name: CodeSlice;
  readonly variantName?: CodeSlice;
}

interface BodyBuildResult {
  readonly text: string;
  readonly sourceLineSegments: readonly SourceLineSegment[];
  readonly endSourcePos: number;
  readonly nextLineIndex: number;
  readonly errors: readonly Error[];
}

interface SourceLineSegment {
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly sourceLineStart: number;
  readonly dedentLen: number;
  readonly sourceLineLength: number;
}

interface ParseState {
  readonly content: string;
  readonly lines: readonly Line[];
  readonly errors: Error[];
}

export function parseTemplateFile(content: string): Result<TemplateFile> {
  const lines = splitIntoLines(content);
  const state: ParseState = {
    content,
    lines,
    errors: [],
  };

  const templates: Template[] = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    while (
      lineIndex < lines.length &&
      (isEmptyLine(lines[lineIndex]!) ||
        isTopLevelCommentLine(lines[lineIndex]!))
    ) {
      lineIndex += 1;
    }
    if (lineIndex >= lines.length) {
      break;
    }

    const headerLine = lines[lineIndex]!;
    const header = parseTemplateHeaderLine(state, headerLine);
    if (!header) {
      lineIndex += 1;
      continue;
    }

    lineIndex += 1;
    const body = buildTemplateBody(state, lineIndex);
    lineIndex = body.nextLineIndex;
    state.errors.push(...body.errors);

    const piecesParse = parseTemplatePieces(state, body);
    templates.push({
      name: header.name,
      variantName: header.variantName,
      pieces: piecesParse.pieces,
      parameters: piecesParse.parameters,
      schema: piecesParse.schema,
      examples: piecesParse.examples,
    });
  }

  return {
    value: {
      templates,
    },
    errors: state.errors,
  };
}

function parseTemplateHeaderLine(
  state: ParseState,
  line: Line,
): HeaderParseResult | null {
  if (line.indent !== "") {
    state.errors.push({
      message: "Template header line must not be indented",
      codeSlice: lineSlice(line),
    });
    return null;
  }

  const text = line.text;
  let cursor = 0;

  const parseIdentifier = (): CodeSlice | null => {
    const match = matchAt(text, cursor, IDENTIFIER_RE);
    if (!match) {
      return null;
    }
    const start = cursor;
    cursor += match[0].length;
    return {
      text: text.slice(start, cursor),
      startPos: line.startPos + start,
      endPos: line.startPos + cursor,
      line,
    };
  };

  const skipSpaces = (): void => {
    cursor = skipWithRegex(text, cursor, SPACE_RUN_RE);
  };

  const name = parseIdentifier();
  if (!name) {
    state.errors.push({
      message: "Expected template identifier",
      codeSlice: lineSlice(line),
    });
    return null;
  }

  skipSpaces();
  if (cursor >= text.length) {
    state.errors.push({
      expected: ":",
      codeSlice: name,
    });
    return null;
  }

  if (text[cursor] === ":") {
    cursor += 1;
    if (cursor !== text.length) {
      state.errors.push({
        message: "Expected end of line after ':'",
        codeSlice: lineSliceFromColumn(line, cursor),
      });
      return null;
    }
    return { name };
  }

  if (text[cursor] !== "/") {
    state.errors.push({
      expected: "'/' or ':'",
      codeSlice: lineSliceFromColumn(line, cursor),
    });
    return null;
  }

  cursor += 1;
  skipSpaces();
  const variantName = parseIdentifier();
  if (!variantName) {
    state.errors.push({
      message: "Expected variant identifier after '/'",
      codeSlice: lineSliceFromColumn(line, cursor),
    });
    return null;
  }

  skipSpaces();
  if (cursor >= text.length || text[cursor] !== ":") {
    state.errors.push({
      expected: ":",
      codeSlice: variantName,
    });
    return null;
  }

  cursor += 1;
  if (cursor !== text.length) {
    state.errors.push({
      message: "Expected end of line after ':'",
      codeSlice: lineSliceFromColumn(line, cursor),
    });
    return null;
  }

  return { name, variantName };
}

function buildTemplateBody(
  state: ParseState,
  startLineIndex: number,
): BodyBuildResult {
  const errors: Error[] = [];
  const bodyLines: Line[] = [];
  let index = startLineIndex;

  while (index < state.lines.length) {
    const line = state.lines[index]!;
    if (!isEmptyLine(line) && line.indent === "") {
      break;
    }
    bodyLines.push(line);
    index += 1;
  }

  let requiredIndent: string | null = null;
  for (const line of bodyLines) {
    if (isEmptyLine(line)) {
      continue;
    }
    requiredIndent = line.indent;
    break;
  }

  const sourceLineSegments: SourceLineSegment[] = [];
  const dedentedLines: string[] = [];

  for (const line of bodyLines) {
    if (isEmptyLine(line)) {
      dedentedLines.push("");
      continue;
    }

    const expectedIndent = requiredIndent ?? "";
    if (!line.text.startsWith(expectedIndent)) {
      errors.push({
        message: `Expected line to start with template indent '${expectedIndent.replace(/\t/g, "\\t")}'`,
        codeSlice: lineSlice(line),
      });
    }

    const dedentLen = line.text.startsWith(expectedIndent)
      ? expectedIndent.length
      : Math.min(line.indent.length, expectedIndent.length);
    dedentedLines.push(line.text.slice(dedentLen));
  }

  let bodyCursor = 0;
  for (let i = 0; i < bodyLines.length; i += 1) {
    const line = bodyLines[i]!;
    const dedented = dedentedLines[i]!;
    const dedentLen = line.text.length - dedented.length;
    sourceLineSegments.push({
      bodyStart: bodyCursor,
      bodyEnd: bodyCursor + dedented.length,
      sourceLineStart: line.startPos,
      dedentLen,
      sourceLineLength: line.text.length,
    });
    bodyCursor += dedented.length;
    if (i < bodyLines.length - 1) {
      bodyCursor += 1;
    }
  }

  const text = dedentedLines.join("\n");
  const endSourcePos =
    bodyLines.length === 0
      ? (state.lines[Math.max(0, startLineIndex - 1)]?.startPos ?? 0)
      : bodyLines[bodyLines.length - 1]!.startPos +
        bodyLines[bodyLines.length - 1]!.text.length;

  return {
    text,
    sourceLineSegments,
    endSourcePos,
    nextLineIndex: index,
    errors,
  };
}

function parseTemplatePieces(
  state: ParseState,
  body: BodyBuildResult,
): {
  readonly pieces: readonly TemplatePiece[];
  readonly parameters: readonly string[];
  readonly schema: Schema | null;
  readonly examples: readonly Example[];
} {
  const pieces: TemplatePiece[] = [];
  const parameters = new Set<string>();
  const templateTypes: Record<string, TypeDeclaration> = {};
  const examples: Example[] = [];

  const text = body.text;
  let cursor = 0;
  let textBuffer = "";

  const flushText = (): void => {
    if (textBuffer.length === 0) {
      return;
    }
    pieces.push({
      kind: "text",
      text: textBuffer,
    });
    textBuffer = "";
  };

  while (cursor < text.length) {
    const dollarPos = text.indexOf("$", cursor);
    if (dollarPos < 0) {
      textBuffer += text.slice(cursor);
      break;
    }
    if (dollarPos > cursor) {
      textBuffer += text.slice(cursor, dollarPos);
      cursor = dollarPos;
    }

    const next = text[cursor + 1];
    if (next === "$") {
      textBuffer += "$";
      cursor += 2;
      continue;
    }

    const tag = parseTagAt(text, cursor);
    if (tag && !tag.closing) {
      flushText();
      if (tag.name === "schema") {
        const close = findClosingTag(text, cursor + tag.length, tag.name);
        if (!close) {
          state.errors.push({
            message: `Missing '$</${tag.name}>'`,
            codeSlice: bodySlice(state, body, cursor, text.length),
          });
          const sectionRaw = text.slice(cursor + tag.length);
          const schema = parseResponseSchema(
            state,
            body,
            cursor + tag.length,
            text.length,
            sectionRaw,
          );
          Object.assign(templateTypes, schema.types);
          pieces.push({
            kind: "schema",
            text: tag.hide ? "" : sectionRaw,
            types: schema.types,
          });
          cursor = text.length;
          continue;
        }

        const raw = text.slice(cursor + tag.length, close.start);
        const schema = parseResponseSchema(
          state,
          body,
          cursor + tag.length,
          close.start,
          raw,
        );
        Object.assign(templateTypes, schema.types);
        pieces.push({
          kind: "schema",
          text: tag.hide ? "" : raw,
          types: schema.types,
        });
        cursor = close.start + close.length;
        continue;
      }

      if (tag.name === "example") {
        flushText();
        const close = findClosingTag(text, cursor + tag.length, "example");
        if (!close) {
          state.errors.push({
            message: "Missing '$</example>'",
            codeSlice: bodySlice(state, body, cursor, text.length),
          });
          const raw = text.slice(cursor + tag.length);
          const example = parseResponseExample(
            state,
            body,
            cursor + tag.length,
            text.length,
            raw,
            tag.type,
          );
          if (example) {
            examples.push(example);
            pieces.push({
              kind: "example",
              text: raw,
              example,
            });
          }
          cursor = text.length;
          continue;
        }

        const raw = text.slice(cursor + tag.length, close.start);
        const example = parseResponseExample(
          state,
          body,
          cursor + tag.length,
          close.start,
          raw,
          tag.type,
        );
        if (example) {
          examples.push(example);
          pieces.push({
            kind: "example",
            text: raw,
            example,
          });
        }
        cursor = close.start + close.length;
        continue;
      }
    }

    if (next === "{") {
      const endBrace = text.indexOf("}", cursor + 2);
      if (endBrace < 0) {
        state.errors.push({
          expected: "}",
          codeSlice: bodySlice(
            state,
            body,
            cursor,
            Math.min(cursor + 2, text.length),
          ),
        });
        textBuffer += "$";
        cursor += 1;
        continue;
      }

      const inner = text.slice(cursor + 2, endBrace);
      const parsedExpr = parseExpressionWithModifier(inner);
      if (!parsedExpr) {
        state.errors.push({
          message: "Invalid expression placeholder",
          codeSlice: bodySlice(state, body, cursor, endBrace + 1),
        });
        textBuffer += text.slice(cursor, endBrace + 1);
        cursor = endBrace + 1;
        continue;
      }

      flushText();
      parameters.add(parsedExpr.expression);
      pieces.push({
        kind: "expression",
        expression: parsedExpr.expression,
        hide: parsedExpr.hide,
      });
      cursor = endBrace + 1;
      continue;
    }

    if (next && isIdentifierStart(next)) {
      let end = cursor + 2;
      while (end < text.length && isIdentifierPart(text[end]!)) {
        end += 1;
      }
      flushText();
      const expression = text.slice(cursor + 1, end);
      parameters.add(expression);
      pieces.push({
        kind: "expression",
        expression,
        hide: false,
      });
      cursor = end;
      continue;
    }

    state.errors.push({
      message: "Invalid '$' sequence",
      codeSlice: bodySlice(
        state,
        body,
        cursor,
        Math.min(cursor + 1, text.length),
      ),
    });
    textBuffer += "$";
    cursor += 1;
  }

  flushText();

  return {
    pieces,
    parameters: [...parameters],
    schema:
      Object.keys(templateTypes).length > 0 ? { types: templateTypes } : null,
    examples,
  };
}

function parseExpressionWithModifier(
  source: string,
): { readonly expression: string; readonly hide: boolean } | null {
  const exprMatch = source.match(
    /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*hide\s*)?$/,
  );
  if (!exprMatch) {
    return null;
  }
  const hideMatch = source.match(/:\s*hide\s*$/);
  return {
    expression: exprMatch[1]!,
    hide: Boolean(hideMatch),
  };
}

function parseResponseSchema(
  state: ParseState,
  body: BodyBuildResult,
  sectionStart: number,
  _sectionEnd: number,
  sectionText: string,
): Schema {
  const startPos = mapBodyPosToSource(body, sectionStart);
  return { types: parseSchemaDeclarations(sectionText, startPos, state.lines) };
}

function parseSchemaDeclarations(
  text: string,
  sectionStartPos: number,
  lines: readonly Line[],
): Record<string, TypeDeclaration> {
  const declarations: Record<string, TypeDeclaration> = {};
  let cursor = 0;

  while (cursor < text.length) {
    const keyword = readTopLevelKeyword(text, cursor);
    if (!keyword) {
      cursor += 1;
      continue;
    }

    if (keyword.word === "interface") {
      const parsed = parseInterfaceDeclaration(
        text,
        keyword.start,
        sectionStartPos,
        lines,
      );
      if (parsed) {
        declarations[parsed.declaration.name.text] = parsed.declaration;
        cursor = parsed.nextCursor;
        continue;
      }
    }

    if (keyword.word === "type") {
      const parsed = parseTypeDeclaration(
        text,
        keyword.start,
        sectionStartPos,
        lines,
      );
      if (parsed) {
        declarations[parsed.declaration.name.text] = parsed.declaration;
        cursor = parsed.nextCursor;
        continue;
      }
    }

    cursor = keyword.end;
  }

  return declarations;
}

function readTopLevelKeyword(
  text: string,
  from: number,
): {
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
  while (cursor < text.length) {
    const nextTokenIndex = findNextRegexIndex(
      text,
      cursor,
      KEYWORD_SCAN_TOKEN_RE,
    );
    if (nextTokenIndex < 0) {
      return null;
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

      if (depthCurly !== 0 || depthSquare !== 0 || depthParen !== 0) {
        cursor += 1;
        continue;
      }

      if (!isIdentifierStart(ch)) {
        cursor += 1;
        continue;
      }
      let end = cursor + 1;
      while (end < text.length && isIdentifierPart(text[end]!)) {
        end += 1;
      }

      const word = text.slice(cursor, end);
      if (word !== "interface" && word !== "type") {
        cursor = end;
        continue;
      }

      return { word, start: cursor, end };
    }

    if (mode === "single") {
      const nextSpecial = findNextRegexIndex(
        text,
        cursor,
        SINGLE_QUOTE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        return null;
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
        DOUBLE_OR_NEWLINE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        return null;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\n") {
        mode = "normal";
        cursor += 1;
      } else if (text[cursor] === "\\") {
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
        return null;
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
        return null;
      }
      cursor = lineEnd + 1;
      mode = "normal";
      continue;
    }

    if (mode === "block-comment") {
      const blockEnd = text.indexOf("*/", cursor);
      if (blockEnd < 0) {
        return null;
      }
      cursor = blockEnd + 2;
      mode = "normal";
      continue;
    }
  }

  return null;
}

function parseInterfaceDeclaration(
  text: string,
  keywordStart: number,
  sectionStartPos: number,
  lines: readonly Line[],
): {
  readonly declaration: TypeDeclaration;
  readonly nextCursor: number;
} | null {
  let cursor = keywordStart + "interface".length;
  cursor = skipWithRegex(text, cursor, WHITESPACE_RUN_RE);
  const nameMatch = matchAt(text, cursor, IDENTIFIER_RE);
  if (!nameMatch) {
    return null;
  }

  const nameStart = cursor;
  cursor += nameMatch[0].length;
  const nameEnd = cursor;

  cursor = skipWithRegex(text, cursor, WHITESPACE_RUN_RE);
  if (text[cursor] !== "{") {
    return null;
  }
  const bodyStart = cursor + 1;
  const bodyEnd = findMatchingBrace(text, cursor);
  if (bodyEnd < 0) {
    return null;
  }

  const nameAbsStart = sectionStartPos + nameStart;
  const nameSlice: CodeSlice = {
    text: text.slice(nameStart, nameEnd),
    startPos: nameAbsStart,
    endPos: sectionStartPos + nameEnd,
    line: findLineByPos(lines, nameAbsStart),
  };

  const fields = parseInterfaceFields(
    text.slice(bodyStart, bodyEnd),
    sectionStartPos + bodyStart,
    lines,
  );

  return {
    declaration: {
      kind: "interface",
      name: nameSlice,
      fields: fields.fields,
      firstField: fields.firstField,
    },
    nextCursor: bodyEnd + 1,
  };
}

function parseInterfaceFields(
  text: string,
  bodyStartPos: number,
  lines: readonly Line[],
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

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)(\?)?\s*:\s*(.+)$/s);
    if (!match) {
      continue;
    }

    const nameText = match[1]!;
    const optional = Boolean(match[2]);
    const colonIndex = trimmed.indexOf(":");
    const typeRaw = trimmed.slice(colonIndex + 1);
    const typeLeading = typeRaw.match(/^\s*/)?.[0].length ?? 0;
    const typeText = typeRaw.slice(typeLeading).trimEnd();
    if (typeText.length === 0) {
      continue;
    }

    const memberStartInBody = segment.start + leading;
    const memberStartPos = bodyStartPos + memberStartInBody;
    const typeStartInMember = colonIndex + 1 + typeLeading;
    const typeStartPos = memberStartPos + typeStartInMember;
    const nameStartPos = memberStartPos;
    const nameEndPos = nameStartPos + nameText.length;
    const typeRef = parseSchemaTypeRef(typeText, typeStartPos, lines);
    if (!typeRef) {
      continue;
    }

    const field: SchemaField = {
      name: {
        text: nameText,
        startPos: nameStartPos,
        endPos: nameEndPos,
        line: findLineByPos(lines, nameStartPos),
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

function parseSchemaTypeRef(
  rawText: string,
  startPos: number,
  lines: readonly Line[],
): TypeRef | null {
  const trimmed = trimSlice(rawText, 0, rawText.length);
  if (trimmed.text.length === 0) {
    return null;
  }

  const rawOffsetStart = trimmed.start;
  let baseText = trimmed.text;
  let baseStartPos = startPos + rawOffsetStart;

  const arraySuffixes: Array<{
    readonly startPos: number;
    readonly endPos: number;
  }> = [];
  while (true) {
    const suffix = parseTopLevelArraySuffix(baseText);
    if (!suffix) {
      break;
    }
    arraySuffixes.push({
      startPos: baseStartPos + suffix.suffixStart,
      endPos: baseStartPos + suffix.suffixEnd,
    });
    baseText = suffix.baseText;
    const baseTrimmed = trimSlice(baseText, 0, baseText.length);
    baseStartPos += baseTrimmed.start;
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
      const memberStartPos = baseStartPos + partTrimmed.start;
      const member = parseUnionMemberTypeRef(
        partTrimmed.text,
        memberStartPos,
        lines,
      );
      if (!member) {
        return null;
      }
      members.push(member);
    }

    baseRef = {
      kind: "union",
      members,
    } satisfies UnionTypeRef;
  } else {
    baseRef = parseSingleSchemaTypeRef(baseText, baseStartPos, lines);
  }

  if (!baseRef) {
    return null;
  }

  let wrapped: TypeRef = baseRef;
  for (let i = arraySuffixes.length - 1; i >= 0; i -= 1) {
    wrapped = {
      kind: "array",
      elementType: wrapped,
    } satisfies ArrayTypeRef;
  }

  return wrapped;
}

function parseUnionMemberTypeRef(
  text: string,
  startPos: number,
  lines: readonly Line[],
): StringLiteralTypeRef | InlineInterfaceTypeRef | null {
  const literal = parseStringLiteralTypeRef(text, startPos, lines);
  if (literal) {
    return literal;
  }
  const inlineInterface = parseInlineInterfaceTypeRef(text, startPos, lines);
  if (inlineInterface) {
    return inlineInterface;
  }
  return null;
}

function parseSingleSchemaTypeRef(
  text: string,
  startPos: number,
  lines: readonly Line[],
): TypeRef | null {
  const inlineInterface = parseInlineInterfaceTypeRef(text, startPos, lines);
  if (inlineInterface) {
    return inlineInterface;
  }

  const literal = parseStringLiteralTypeRef(text, startPos, lines);
  if (literal) {
    return literal;
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    return {
      kind: "type-name",
      name: {
        text,
        startPos,
        endPos: startPos + text.length,
        line: findLineByPos(lines, startPos),
      },
    };
  }

  return null;
}

function parseInlineInterfaceTypeRef(
  text: string,
  startPos: number,
  lines: readonly Line[],
): InlineInterfaceTypeRef | null {
  if (!text.startsWith("{") || !text.endsWith("}")) {
    return null;
  }
  const close = findMatchingBrace(text, 0);
  if (close !== text.length - 1) {
    return null;
  }

  const fields = parseInterfaceFields(
    text.slice(1, text.length - 1),
    startPos + 1,
    lines,
  );
  return {
    kind: "inline-interface",
    fields: fields.fields,
    firstField: fields.firstField,
  };
}

function parseStringLiteralTypeRef(
  text: string,
  startPos: number,
  lines: readonly Line[],
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
      startPos,
      endPos: startPos + text.length,
      line: findLineByPos(lines, startPos),
    },
  };
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

function parseTypeDeclaration(
  text: string,
  keywordStart: number,
  sectionStartPos: number,
  lines: readonly Line[],
): {
  readonly declaration: TypeDeclaration;
  readonly nextCursor: number;
} | null {
  let cursor = keywordStart + "type".length;
  cursor = skipWithRegex(text, cursor, WHITESPACE_RUN_RE);
  const nameMatch = matchAt(text, cursor, IDENTIFIER_RE);
  if (!nameMatch) {
    return null;
  }

  const nameStart = cursor;
  cursor += nameMatch[0].length;
  const nameEnd = cursor;

  cursor = skipWithRegex(text, cursor, WHITESPACE_RUN_RE);
  if (text[cursor] !== "=") {
    return null;
  }
  cursor += 1;

  const typeValueStart = cursor;
  const statementEnd = findTopLevelStatementEnd(text, typeValueStart);
  const valueEnd =
    statementEnd > typeValueStart && text[statementEnd - 1] === ";"
      ? statementEnd - 1
      : statementEnd;
  const valueRaw = text.slice(typeValueStart, valueEnd);
  const leading = valueRaw.match(/^\s*/)?.[0].length ?? 0;
  const trailing = valueRaw.match(/\s*$/)?.[0].length ?? 0;
  const valueText = valueRaw.slice(
    leading,
    Math.max(leading, valueRaw.length - trailing),
  );
  if (valueText.length === 0) {
    return null;
  }

  const nameAbsStart = sectionStartPos + nameStart;
  const valueAbsStart = sectionStartPos + typeValueStart + leading;
  const valueType = parseSchemaTypeRef(valueText, valueAbsStart, lines);
  if (!valueType) {
    return null;
  }

  return {
    declaration: {
      kind: "type",
      name: {
        text: text.slice(nameStart, nameEnd),
        startPos: nameAbsStart,
        endPos: sectionStartPos + nameEnd,
        line: findLineByPos(lines, nameAbsStart),
      },
      valueType,
    },
    nextCursor: statementEnd,
  };
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

function parseResponseExample(
  state: ParseState,
  body: BodyBuildResult,
  sectionStart: number,
  sectionEnd: number,
  sectionText: string,
  type?: string,
): Example | null {
  const startPos = mapBodyPosToSource(body, sectionStart);
  const endPos = mapBodyPosToSource(body, sectionEnd);
  const line = findLineByPos(state.lines, startPos);
  const jsonState: JsonParserState = {
    text: sectionText,
    cursor: 0,
    line,
    sourceStartPos: startPos,
    errors: state.errors,
  };

  skipJsonSpaces(jsonState);
  const value = parseJsonValue(jsonState);
  if (!value) {
    return null;
  }
  skipJsonSpaces(jsonState);
  if (jsonState.cursor < jsonState.text.length) {
    state.errors.push({
      message: "Unexpected trailing content after JSON value",
      codeSlice: jsonSlice(jsonState, jsonState.cursor, jsonState.text.length),
    });
    return null;
  }

  return {
    codeSlice: {
      text: sectionText,
      startPos,
      endPos,
      line,
    },
    value,
    type,
  };
}

interface JsonParserState {
  text: string;
  cursor: number;
  line: Line;
  sourceStartPos: number;
  errors: Error[];
}

function parseJsonValue(state: JsonParserState): JsonValue | null {
  if (state.cursor >= state.text.length) {
    state.errors.push({
      message: "Expected JSON value",
      codeSlice: jsonSlice(state, state.cursor, state.cursor),
    });
    return null;
  }

  const ch = state.text[state.cursor]!;
  if (ch === "{") {
    return parseJsonObject(state);
  }
  if (state.text.startsWith("...", state.cursor)) {
    return parseJsonEllipsis(state);
  }
  if (ch === "[") {
    return parseJsonArray(state);
  }
  if (ch === '"') {
    return parseJsonString(state);
  }
  if (ch === "t" || ch === "f") {
    return parseJsonBoolean(state);
  }
  if (ch === "n") {
    return parseJsonNull(state);
  }
  if (ch === "-" || /[0-9]/.test(ch)) {
    return parseJsonNumber(state);
  }

  state.errors.push({
    message: "Invalid JSON value",
    codeSlice: jsonSlice(
      state,
      state.cursor,
      Math.min(state.cursor + 1, state.text.length),
    ),
  });
  return null;
}

function parseJsonObject(state: JsonParserState): JsonObject | null {
  const start = state.cursor;
  state.cursor += 1;
  skipJsonSpaces(state);
  const entries: JsonObjectEntry[] = [];
  if (state.text[state.cursor] === "}") {
    state.cursor += 1;
    return {
      kind: "object",
      codeSlice: jsonSlice(state, start, state.cursor),
      entries,
    };
  }

  let objectEllipsis: JsonEllipsis | undefined;

  while (state.cursor < state.text.length) {
    const ellipsis = parseJsonEllipsis(state);
    if (ellipsis) {
      skipJsonSpaces(state);
      if (state.text[state.cursor] !== "}") {
        state.errors.push({
          expected: "}",
          codeSlice: jsonSlice(
            state,
            state.cursor,
            Math.min(state.cursor + 1, state.text.length),
          ),
        });
        return null;
      }
      state.cursor += 1;
      objectEllipsis = ellipsis;
      return {
        kind: "object",
        codeSlice: jsonSlice(state, start, state.cursor),
        entries,
        ellipsis: objectEllipsis,
      };
    }

    const key = parseJsonString(state);
    if (!key) {
      return null;
    }
    skipJsonSpaces(state);
    if (state.text[state.cursor] !== ":") {
      state.errors.push({
        expected: ":",
        codeSlice: jsonSlice(
          state,
          state.cursor,
          Math.min(state.cursor + 1, state.text.length),
        ),
      });
      return null;
    }
    state.cursor += 1;
    skipJsonSpaces(state);
    const value = parseJsonValue(state);
    if (!value) {
      return null;
    }
    entries.push({ key, value });
    skipJsonSpaces(state);

    if (state.text[state.cursor] === "}") {
      state.cursor += 1;
      return {
        kind: "object",
        codeSlice: jsonSlice(state, start, state.cursor),
        entries,
        ellipsis: objectEllipsis,
      };
    }
    if (state.text[state.cursor] !== ",") {
      state.errors.push({
        expected: "',' or '}'",
        codeSlice: jsonSlice(
          state,
          state.cursor,
          Math.min(state.cursor + 1, state.text.length),
        ),
      });
      return null;
    }
    state.cursor += 1;
    skipJsonSpaces(state);
  }

  state.errors.push({
    expected: "}",
    codeSlice: jsonSlice(state, state.cursor, state.cursor),
  });
  return null;
}

function parseJsonEllipsis(state: JsonParserState): JsonEllipsis | null {
  if (!state.text.startsWith("...", state.cursor)) {
    return null;
  }
  const start = state.cursor;
  state.cursor += 3;
  return {
    kind: "ellipsis",
    codeSlice: jsonSlice(state, start, state.cursor),
  };
}

function parseJsonArray(state: JsonParserState): JsonArray | null {
  const start = state.cursor;
  state.cursor += 1;
  skipJsonSpaces(state);
  const values: JsonValue[] = [];

  if (state.text[state.cursor] === "]") {
    state.cursor += 1;
    return {
      kind: "array",
      codeSlice: jsonSlice(state, start, state.cursor),
      values,
    };
  }

  while (state.cursor < state.text.length) {
    const value = parseJsonValue(state);
    if (!value) {
      return null;
    }
    values.push(value);
    skipJsonSpaces(state);
    if (state.text[state.cursor] === "]") {
      state.cursor += 1;
      return {
        kind: "array",
        codeSlice: jsonSlice(state, start, state.cursor),
        values,
      };
    }
    if (state.text[state.cursor] !== ",") {
      state.errors.push({
        expected: "',' or ']'",
        codeSlice: jsonSlice(
          state,
          state.cursor,
          Math.min(state.cursor + 1, state.text.length),
        ),
      });
      return null;
    }
    state.cursor += 1;
    skipJsonSpaces(state);
  }

  state.errors.push({
    expected: "]",
    codeSlice: jsonSlice(state, state.cursor, state.cursor),
  });
  return null;
}

function parseJsonString(state: JsonParserState): JsonString | null {
  if (state.text[state.cursor] !== '"') {
    state.errors.push({
      expected: "JSON string",
      codeSlice: jsonSlice(
        state,
        state.cursor,
        Math.min(state.cursor + 1, state.text.length),
      ),
    });
    return null;
  }
  const start = state.cursor;
  state.cursor += 1;

  while (state.cursor < state.text.length) {
    const nextSpecial = findNextRegexIndex(
      state.text,
      state.cursor,
      JSON_STRING_TOKEN_RE,
    );
    if (nextSpecial < 0) {
      break;
    }
    state.cursor = nextSpecial;
    if (state.text[state.cursor] === "\\") {
      state.cursor += 2;
      continue;
    }
    if (state.text[state.cursor] === '"') {
      const end = state.cursor + 1;
      const raw = state.text.slice(start, end);
      state.cursor = end;
      return {
        kind: "string",
        value: decodeJsonString(raw),
        codeSlice: jsonSlice(state, start, end),
      };
    }
  }

  state.errors.push({
    expected: "closing quote for JSON string",
    codeSlice: jsonSlice(state, start, state.cursor),
  });
  return null;
}

function parseJsonNumber(state: JsonParserState): JsonNumber | null {
  const rest = state.text.slice(state.cursor);
  const match = rest.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (!match) {
    state.errors.push({
      expected: "JSON number",
      codeSlice: jsonSlice(
        state,
        state.cursor,
        Math.min(state.cursor + 1, state.text.length),
      ),
    });
    return null;
  }
  const start = state.cursor;
  state.cursor += match[0].length;
  return {
    kind: "number",
    value: Number(match[0]),
    codeSlice: jsonSlice(state, start, state.cursor),
  };
}

function parseJsonBoolean(state: JsonParserState): JsonBoolean | null {
  const start = state.cursor;
  if (state.text.startsWith("true", state.cursor)) {
    state.cursor += 4;
    return {
      kind: "boolean",
      value: true,
      codeSlice: jsonSlice(state, start, state.cursor),
    };
  }
  if (state.text.startsWith("false", state.cursor)) {
    state.cursor += 5;
    return {
      kind: "boolean",
      value: false,
      codeSlice: jsonSlice(state, start, state.cursor),
    };
  }
  state.errors.push({
    expected: "'true' or 'false'",
    codeSlice: jsonSlice(
      state,
      state.cursor,
      Math.min(state.cursor + 1, state.text.length),
    ),
  });
  return null;
}

function parseJsonNull(state: JsonParserState): JsonNull | null {
  if (!state.text.startsWith("null", state.cursor)) {
    state.errors.push({
      expected: "'null'",
      codeSlice: jsonSlice(
        state,
        state.cursor,
        Math.min(state.cursor + 1, state.text.length),
      ),
    });
    return null;
  }
  const start = state.cursor;
  state.cursor += 4;
  return {
    kind: "null",
    codeSlice: jsonSlice(state, start, state.cursor),
  };
}

function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw.slice(1, -1);
  }
}

function skipJsonSpaces(state: JsonParserState): void {
  state.cursor = skipWithRegex(state.text, state.cursor, WHITESPACE_RUN_RE);
}

function jsonSlice(
  state: JsonParserState,
  start: number,
  end: number,
): CodeSlice {
  return {
    text: state.text.slice(start, end),
    startPos: state.sourceStartPos + start,
    endPos: state.sourceStartPos + end,
    line: state.line,
  };
}

function parseTagAt(
  text: string,
  pos: number,
): {
  readonly name: "example" | "schema";
  readonly closing: boolean;
  readonly hide: boolean;
  readonly type?: string;
  readonly length: number;
} | null {
  if (!text.startsWith("$<", pos)) {
    return null;
  }
  let cursor = pos + 2;
  cursor = skipWithRegex(text, cursor, SPACE_RUN_RE);

  let closing = false;
  if (text[cursor] === "/") {
    closing = true;
    cursor += 1;
    cursor = skipWithRegex(text, cursor, SPACE_RUN_RE);
  }

  const nameMatch = matchAt(text, cursor, ALPHA_WORD_RE);
  const name = nameMatch?.[0] ?? "";
  if (nameMatch) {
    cursor += nameMatch[0].length;
  }
  if (name !== "example" && name !== "schema") {
    return null;
  }

  cursor = skipWithRegex(text, cursor, SPACE_RUN_RE);

  // Detect optional "hide" attribute (only valid on non-closing schema tags)
  let hide = false;
  if (!closing && name !== "example") {
    if (
      text.startsWith("hide", cursor) &&
      (cursor + 4 >= text.length || !isIdentifierPart(text[cursor + 4]!))
    ) {
      hide = true;
      cursor += 4;
      cursor = skipWithRegex(text, cursor, SPACE_RUN_RE);
    }
  }

  // Detect optional type="..." attribute (only valid on non-closing example tags)
  let type: string | undefined;
  if (!closing && name === "example") {
    if (
      text.startsWith("type", cursor) &&
      (cursor + 4 >= text.length || !isIdentifierPart(text[cursor + 4]!))
    ) {
      cursor += 4;
      cursor = skipWithRegex(text, cursor, SPACE_RUN_RE);
      if (text[cursor] !== "=") {
        return null;
      }
      cursor += 1;
      cursor = skipWithRegex(text, cursor, SPACE_RUN_RE);
      const quote = text[cursor];
      if (quote !== '"' && quote !== "'") {
        return null;
      }
      cursor += 1;
      const valueStart = cursor;
      const quoteEscaped = quote === '"' ? '"' : "'";
      const closeValue = matchAt(
        text,
        cursor,
        new RegExp(`[^${quoteEscaped}]*`, "y"),
      );
      if (!closeValue) {
        return null;
      }
      cursor += closeValue[0].length;
      if (cursor >= text.length) {
        return null;
      }
      type = text.slice(valueStart, cursor);
      cursor += 1;

      cursor = skipWithRegex(text, cursor, SPACE_RUN_RE);
    }
  }

  if (text[cursor] === "/") {
    if (name === "schema") {
      return null;
    }
    cursor += 1;
    cursor = skipWithRegex(text, cursor, SPACE_RUN_RE);
  }

  if (text[cursor] !== ">") {
    return null;
  }
  cursor += 1;

  return {
    name,
    closing,
    hide,
    type,
    length: cursor - pos,
  };
}

function findClosingTag(
  text: string,
  startPos: number,
  tagName: "example" | "schema",
): { readonly start: number; readonly length: number } | null {
  type ScanMode =
    | "normal"
    | "single"
    | "double"
    | "template"
    | "line-comment"
    | "block-comment";
  let mode: ScanMode = "normal";

  let cursor = startPos;
  while (cursor < text.length) {
    if (mode === "normal") {
      const nextTokenIndex = findNextRegexIndex(
        text,
        cursor,
        CLOSING_TAG_TOKEN_RE,
      );
      if (nextTokenIndex < 0) {
        return null;
      }
      cursor = nextTokenIndex;
      const ch = text[cursor]!;
      const next = text[cursor + 1];

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
      if (ch === "$" && next === "<") {
        const closeTagMatch = matchAt(text, cursor, CLOSE_TAG_RE);
        if (closeTagMatch && closeTagMatch[1] === tagName) {
          return {
            start: cursor,
            length: closeTagMatch[0].length,
          };
        }
      }
      cursor += 1;
      continue;
    }

    if (mode === "single") {
      const nextSpecial = findNextRegexIndex(
        text,
        cursor,
        SINGLE_OR_NEWLINE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\n") {
        mode = "normal";
        cursor += 1;
      } else if (text[cursor] === "\\") {
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
        DOUBLE_OR_NEWLINE_SCAN_RE,
      );
      if (nextSpecial < 0) {
        break;
      }
      cursor = nextSpecial;
      if (text[cursor] === "\n") {
        mode = "normal";
        cursor += 1;
      } else if (text[cursor] === "\\") {
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

  const fallbackMatch = text
    .slice(startPos)
    .match(new RegExp(`\\$<\\s*\\/\\s*${tagName}\\s*>`));
  if (!fallbackMatch || fallbackMatch.index === undefined) {
    return null;
  }
  return {
    start: startPos + fallbackMatch.index,
    length: fallbackMatch[0].length,
  };
}

function lineSlice(line: Line): CodeSlice {
  return {
    text: line.text,
    startPos: line.startPos,
    endPos: line.startPos + line.text.length,
    line,
  };
}

function lineSliceFromColumn(line: Line, column: number): CodeSlice {
  return {
    text: line.text.slice(column),
    startPos: line.startPos + column,
    endPos: line.startPos + line.text.length,
    line,
  };
}

function bodySlice(
  state: ParseState,
  body: BodyBuildResult,
  start: number,
  end: number,
): CodeSlice {
  const clampedStart = Math.max(0, Math.min(start, body.text.length));
  const clampedEnd = Math.max(clampedStart, Math.min(end, body.text.length));
  const startPos = mapBodyPosToSource(body, clampedStart);
  const endPos = mapBodyPosToSource(body, clampedEnd);
  return {
    text: body.text.slice(clampedStart, clampedEnd),
    startPos,
    endPos,
    line: findLineByPos(state.lines, startPos),
  };
}

function mapBodyPosToSource(body: BodyBuildResult, bodyPos: number): number {
  if (bodyPos <= 0) {
    const first = body.sourceLineSegments[0];
    return first ? first.sourceLineStart + first.dedentLen : body.endSourcePos;
  }
  if (bodyPos >= body.text.length) {
    return body.endSourcePos;
  }

  const segments = body.sourceLineSegments;
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const segment = segments[mid]!;
    if (bodyPos < segment.bodyStart) {
      hi = mid - 1;
      continue;
    }

    if (bodyPos <= segment.bodyEnd) {
      if (bodyPos < segment.bodyEnd) {
        const offsetInLine = bodyPos - segment.bodyStart;
        return segment.sourceLineStart + segment.dedentLen + offsetInLine;
      }
      // bodyPos hits the synthetic newline after this line.
      return segment.sourceLineStart + segment.sourceLineLength;
    }

    lo = mid + 1;
  }

  return body.endSourcePos;
}

function findLineByPos(lines: readonly Line[], sourcePos: number): Line {
  let candidate = lines[0]!;
  for (const line of lines) {
    if (line.startPos <= sourcePos) {
      candidate = line;
    } else {
      break;
    }
  }
  return candidate;
}

function splitIntoLines(content: string): Line[] {
  const getIndent = (lineText: string): string => {
    const match = lineText.match(/^[ \t]*/);
    return match ? match[0] : "";
  };

  if (content.length === 0) {
    return [
      {
        lineNumber: 0,
        startPos: 0,
        text: "",
        indent: "",
      },
    ];
  }

  const lines: Line[] = [];
  let lineNumber = 0;
  const lineTokenRe = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;
  while ((match = lineTokenRe.exec(content)) !== null) {
    const text = match[1] ?? "";
    const separator = match[2] ?? "";
    const lineStart = match.index;
    lines.push({
      lineNumber,
      startPos: lineStart,
      text,
      indent: getIndent(text),
    });
    if (separator === "") {
      break;
    }
    lineNumber += 1;
  }
  if (content.endsWith("\n") || content.endsWith("\r")) {
    lines.push({
      lineNumber,
      startPos: content.length,
      text: "",
      indent: "",
    });
  }
  return lines;
}

function isEmptyLine(line: Line): boolean {
  return line.text.trim() === "";
}

function isTopLevelCommentLine(line: Line): boolean {
  return line.indent === "" && line.text.startsWith("#");
}

const IDENTIFIER_RE = /[A-Za-z_][A-Za-z0-9_]*/y;
const ALPHA_WORD_RE = /[A-Za-z]+/y;
const SPACE_RUN_RE = /[ \t]*/y;
const WHITESPACE_RUN_RE = /\s*/y;
const KEYWORD_SCAN_TOKEN_RE = /[A-Za-z_'"`{}[\]()/]/g;
const SPLIT_PIPE_TOKEN_RE = /['"`{}[\]()|/]/g;
const SPLIT_SEMICOLON_TOKEN_RE = /['"`{}[\]();/]/g;
const STATEMENT_END_TOKEN_RE = /['"`{}[\]();/]/g;
const BRACE_MATCH_TOKEN_RE = /['"`{}/]/g;
const CLOSING_TAG_TOKEN_RE = /['"`$/]/g;
const SINGLE_QUOTE_SCAN_RE = /[\\']/g;
const SINGLE_OR_NEWLINE_SCAN_RE = /[\\'\n]/g;
const DOUBLE_QUOTE_SCAN_RE = /[\\"]/g;
const DOUBLE_OR_NEWLINE_SCAN_RE = /[\\"\n]/g;
const TEMPLATE_SCAN_RE = /[\\`]/g;
const CLOSE_TAG_RE = /\$<\s*\/\s*(example|schema)\s*>/y;
const JSON_STRING_TOKEN_RE = /[\\"]/g;

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
