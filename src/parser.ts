import type {
  CodeSlice,
  Error,
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
  ResponseExample,
  ResponseSchema,
  ResponseSchemaDeclaration,
  Result,
  Template,
  TemplateFile,
  TemplatePiece,
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
    if (cursor >= text.length || !isIdentifierStart(text[cursor]!)) {
      return null;
    }
    const start = cursor;
    cursor += 1;
    while (cursor < text.length && isIdentifierPart(text[cursor]!)) {
      cursor += 1;
    }
    return {
      text: text.slice(start, cursor),
      startPos: line.startPos + start,
      endPos: line.startPos + cursor,
      line,
    };
  };

  const skipSpaces = (): void => {
    while (cursor < text.length && isSpace(text[cursor]!)) {
      cursor += 1;
    }
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
} {
  const pieces: TemplatePiece[] = [];
  const parameters = new Set<string>();
  let schemaCount = 0;

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
    const ch = text[cursor]!;
    if (ch !== "$") {
      textBuffer += ch;
      cursor += 1;
      continue;
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
        schemaCount += 1;
        if (tag.selfClosing) {
          const startPos = mapBodyPosToSource(body, cursor);
          const endPos = mapBodyPosToSource(body, cursor + tag.length);
          const line = findLineByPos(state.lines, startPos);
          pieces.push({
            kind: "schema",
            text: "",
            schema: {
              codeSlice: {
                text: "",
                startPos,
                endPos,
                line,
              },
              declarations: [],
            },
          });
          cursor += tag.length;
          continue;
        }

        const close = findClosingTag(text, cursor + tag.length, tag.name);
        if (!close) {
          state.errors.push({
            message: `Missing '$</${tag.name}>'`,
            codeSlice: bodySlice(state, body, cursor, text.length),
          });
          const sectionRaw = text.slice(cursor + tag.length);
          pieces.push({
            kind: "schema",
            text: tag.hide ? "" : sectionRaw,
            schema: null,
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
        pieces.push({
          kind: "schema",
          text: tag.hide ? "" : raw,
          schema,
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
          pieces.push({
            kind: "example",
            text: raw,
            example: parseResponseExample(
              state,
              body,
              cursor + tag.length,
              text.length,
              raw,
              tag.type,
            ),
          });
          cursor = text.length;
          continue;
        }

        const raw = text.slice(cursor + tag.length, close.start);
        pieces.push({
          kind: "example",
          text: raw,
          example: parseResponseExample(
            state,
            body,
            cursor + tag.length,
            close.start,
            raw,
            tag.type,
          ),
        });
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
        extraIndent: currentLineExtraIndent(text, cursor),
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
        extraIndent: currentLineExtraIndent(text, cursor),
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

  if (schemaCount !== 1) {
    state.errors.push({
      message: "Template must contain exactly one schema section",
      codeSlice: bodySlice(state, body, 0, text.length),
    });
  }

  return {
    pieces,
    parameters: [...parameters],
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
  sectionEnd: number,
  sectionText: string,
): ResponseSchema | null {
  const startPos = mapBodyPosToSource(body, sectionStart);
  const endPos = mapBodyPosToSource(body, sectionEnd);
  const line = findLineByPos(state.lines, startPos);
  const declarations: ResponseSchemaDeclaration[] = [];

  const declarationRegex = /(interface|type)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let match: RegExpExecArray | null = declarationRegex.exec(sectionText);
  while (match) {
    const keyword = match[1]!;
    const nameText = match[2]!;
    const nameStartInSection = match.index + match[0].lastIndexOf(nameText);
    const nameAbsPos = startPos + nameStartInSection;
    const nameLine = findLineByPos(state.lines, nameAbsPos);
    const nameSlice: CodeSlice = {
      text: nameText,
      startPos: nameAbsPos,
      endPos: nameAbsPos + nameText.length,
      line: nameLine,
    };
    const declSlice: CodeSlice = {
      text: match[0],
      startPos: startPos + match.index,
      endPos: startPos + match.index + match[0].length,
      line: nameLine,
    };

    declarations.push(
      keyword === "interface"
        ? {
            kind: "interface",
            name: nameSlice,
            codeSlice: declSlice,
          }
        : {
            kind: "type",
            name: nameSlice,
            codeSlice: declSlice,
          },
    );

    match = declarationRegex.exec(sectionText);
  }

  return {
    codeSlice: {
      text: sectionText,
      startPos,
      endPos,
      line,
    },
    declarations,
  };
}

function parseResponseExample(
  state: ParseState,
  body: BodyBuildResult,
  sectionStart: number,
  sectionEnd: number,
  sectionText: string,
  type?: string,
): ResponseExample {
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
  skipJsonSpaces(jsonState);
  if (value && jsonState.cursor < jsonState.text.length) {
    state.errors.push({
      message: "Unexpected trailing content after JSON value",
      codeSlice: jsonSlice(jsonState, jsonState.cursor, jsonState.text.length),
    });
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
    const ch = state.text[state.cursor]!;
    if (ch === "\\") {
      state.cursor += 2;
      continue;
    }
    if (ch === '"') {
      const end = state.cursor + 1;
      const raw = state.text.slice(start, end);
      state.cursor = end;
      return {
        kind: "string",
        value: decodeJsonString(raw),
        codeSlice: jsonSlice(state, start, end),
      };
    }
    state.cursor += 1;
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
  while (
    state.cursor < state.text.length &&
    /\s/.test(state.text[state.cursor]!)
  ) {
    state.cursor += 1;
  }
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
  readonly selfClosing: boolean;
  readonly hide: boolean;
  readonly type?: string;
  readonly length: number;
} | null {
  if (!text.startsWith("$<", pos)) {
    return null;
  }
  let cursor = pos + 2;
  while (cursor < text.length && isSpace(text[cursor]!)) {
    cursor += 1;
  }

  let closing = false;
  if (text[cursor] === "/") {
    closing = true;
    cursor += 1;
    while (cursor < text.length && isSpace(text[cursor]!)) {
      cursor += 1;
    }
  }

  let name = "";
  while (cursor < text.length && /[A-Za-z]/.test(text[cursor]!)) {
    name += text[cursor]!;
    cursor += 1;
  }
  if (name !== "example" && name !== "schema") {
    return null;
  }

  while (cursor < text.length && isSpace(text[cursor]!)) {
    cursor += 1;
  }

  // Detect optional "hide" attribute (only valid on non-closing schema tags)
  let hide = false;
  if (!closing && name !== "example") {
    if (
      text.startsWith("hide", cursor) &&
      (cursor + 4 >= text.length || !isIdentifierPart(text[cursor + 4]!))
    ) {
      hide = true;
      cursor += 4;
      while (cursor < text.length && isSpace(text[cursor]!)) {
        cursor += 1;
      }
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
      while (cursor < text.length && isSpace(text[cursor]!)) {
        cursor += 1;
      }
      if (text[cursor] !== "=") {
        return null;
      }
      cursor += 1;
      while (cursor < text.length && isSpace(text[cursor]!)) {
        cursor += 1;
      }
      const quote = text[cursor];
      if (quote !== '"' && quote !== "'") {
        return null;
      }
      cursor += 1;
      const valueStart = cursor;
      while (cursor < text.length && text[cursor] !== quote) {
        cursor += 1;
      }
      if (cursor >= text.length) {
        return null;
      }
      type = text.slice(valueStart, cursor);
      cursor += 1;

      while (cursor < text.length && isSpace(text[cursor]!)) {
        cursor += 1;
      }
    }
  }

  let selfClosing = false;
  if (text[cursor] === "/") {
    selfClosing = true;
    cursor += 1;
    while (cursor < text.length && isSpace(text[cursor]!)) {
      cursor += 1;
    }
  }

  if (text[cursor] !== ">") {
    return null;
  }
  cursor += 1;

  return {
    name,
    closing,
    selfClosing,
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
      if (ch === "$" && next === "<") {
        const tag = parseTagAt(text, cursor);
        if (tag && tag.name === tagName && tag.closing) {
          return {
            start: cursor,
            length: tag.length,
          };
        }
      }
      cursor += 1;
      continue;
    }

    if (mode === "single") {
      if (ch === "\n") {
        mode = "normal";
        cursor += 1;
        continue;
      }
      if (ch === "\\") {
        cursor += 2;
        continue;
      }
      if (ch === "'") {
        mode = "normal";
      }
      cursor += 1;
      continue;
    }

    if (mode === "double") {
      if (ch === "\n") {
        mode = "normal";
        cursor += 1;
        continue;
      }
      if (ch === "\\") {
        cursor += 2;
        continue;
      }
      if (ch === '"') {
        mode = "normal";
      }
      cursor += 1;
      continue;
    }

    if (mode === "template") {
      if (ch === "\\") {
        cursor += 2;
        continue;
      }
      if (ch === "`") {
        mode = "normal";
      }
      cursor += 1;
      continue;
    }

    if (mode === "line-comment") {
      if (ch === "\n") {
        mode = "normal";
      }
      cursor += 1;
      continue;
    }

    if (mode === "block-comment") {
      if (ch === "*" && next === "/") {
        mode = "normal";
        cursor += 2;
        continue;
      }
      cursor += 1;
      continue;
    }
  }
  return null;
}

function currentLineExtraIndent(text: string, cursor: number): string {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  const leading = text.slice(lineStart, cursor).match(/^[ \t]*/);
  return leading ? leading[0] : "";
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
  let cursor = 0;
  while (cursor < content.length) {
    const lineStart = cursor;
    while (
      cursor < content.length &&
      content[cursor] !== "\n" &&
      content[cursor] !== "\r"
    ) {
      cursor += 1;
    }
    const text = content.slice(lineStart, cursor);
    lines.push({
      lineNumber,
      startPos: lineStart,
      text,
      indent: getIndent(text),
    });
    if (cursor >= content.length) {
      break;
    }
    if (content[cursor] === "\r" && content[cursor + 1] === "\n") {
      cursor += 2;
    } else {
      cursor += 1;
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

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t";
}
