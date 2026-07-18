import type {
  InternalError,
  InternalErrors,
  SourceSpan,
} from "../util/error-types.js";
import type {
  JsonArray,
  JsonBoolean,
  JsonEllipsis,
  JsonMode,
  JsonNull,
  JsonNumber,
  JsonObject,
  JsonObjectEntry,
  JsonString,
  JsonValue,
} from "./json-types.js";
import {
  decodedToSourceOffset,
  type TextNodeJoin,
} from "../xml/text-node-join.js";

export function parseJson<Mode extends JsonMode = "loose">(
  content: TextNodeJoin,
  mode: Mode = "loose" as Mode,
): JsonValue<Mode> | InternalErrors {
  const parser = new JsonParser(content, mode);
  parser.skipSpaces();

  if (parser.cursor >= content.decoded.length) {
    if (parser.errors.length === 0) {
      parser.pushError(parser.cursor, parser.cursor, "Expected JSON value");
    }
    return { kind: "error", errors: parser.errors };
  }

  const value = parser.parseValue();
  if (!value) {
    return { kind: "error", errors: parser.errors };
  }

  parser.skipSpaces();
  if (parser.cursor < content.decoded.length) {
    parser.pushError(
      parser.cursor,
      content.decoded.length,
      "Unexpected trailing content after JSON value",
    );
  }

  if (parser.errors.length > 0) {
    return { kind: "error", errors: parser.errors };
  }

  return value;
}

class JsonParser<Mode extends JsonMode = "loose"> {
  constructor(
    private readonly content: TextNodeJoin,
    private readonly mode: Mode = "loose" as Mode,
  ) {
    this.text = content.decoded;
  }

  parseValue(): JsonValue<Mode> | null {
    if (this.cursor >= this.text.length) {
      this.pushError(this.cursor, this.cursor, "Expected JSON value");
      return null;
    }

    const ch = this.text[this.cursor]!;
    if (ch === "{") {
      return this.parseObject();
    }
    if (this.text.startsWith("...", this.cursor)) {
      return this.parseEllipsis() as unknown as JsonValue<Mode> | null;
    }
    if (ch === "[") {
      return this.parseArray();
    }
    if (ch === '"') {
      return this.parseString();
    }
    if (ch === "t" || ch === "f") {
      return this.parseBoolean();
    }
    if (ch === "n") {
      return this.parseNull();
    }
    if (ch === "-" || /[0-9]/.test(ch)) {
      return this.parseNumber();
    }

    this.pushError(
      this.cursor,
      Math.min(this.cursor + 1, this.text.length),
      "Invalid JSON value",
    );
    return null;
  }

  parseObject(): JsonObject<Mode> {
    const start = this.cursor;
    this.cursor += 1;
    this.skipSpaces();

    const entries: JsonObjectEntry<Mode>[] = [];
    const seenKeys = new Set<string>();
    let objectEllipsis: JsonEllipsis | undefined;

    if (this.text[this.cursor] === "}") {
      this.cursor += 1;
      return {
        kind: "object",
        firstToken: this.exampleSlice(start, start + 1),
        entries,
      };
    }

    while (this.cursor < this.text.length) {
      const ellipsis = this.parseEllipsis();
      if (ellipsis) {
        this.skipSpaces();
        if (this.text[this.cursor] !== "}") {
          this.pushError(
            this.cursor,
            Math.min(this.cursor + 1, this.text.length),
            "Expected '}'",
          );
          this.syncToObjectDelimiter();
        }
        if (this.text[this.cursor] === "}") {
          this.cursor += 1;
        }
        objectEllipsis = ellipsis;
        return {
          kind: "object",
          firstToken: this.exampleSlice(start, start + 1),
          entries,
          ellipsis: objectEllipsis,
        };
      }

      const key = this.parseObjectKeyWithRecovery();
      if (!key) {
        this.syncToObjectDelimiter();
        if (this.text[this.cursor] === ",") {
          this.cursor += 1;
          this.skipSpaces();
          continue;
        }
        if (this.text[this.cursor] === "}") {
          this.cursor += 1;
          return {
            kind: "object",
            firstToken: this.exampleSlice(start, start + 1),
            entries,
            ellipsis: objectEllipsis,
          };
        }
        break;
      }

      this.skipSpaces();
      if (this.text[this.cursor] !== ":") {
        this.pushError(
          this.cursor,
          Math.min(this.cursor + 1, this.text.length),
          "Expected ':'",
        );
      } else {
        this.cursor += 1;
      }

      this.skipSpaces();
      const value = this.parseValue();
      if (!value) {
        this.syncToObjectDelimiter();
      } else {
        if (seenKeys.has(key.value)) {
          this.pushError(
            key.firstToken.start,
            key.firstToken.end,
            `Duplicate object key '${key.value}'`,
          );
        } else {
          seenKeys.add(key.value);
        }
        entries.push({ key, value });
      }

      this.skipSpaces();

      if (this.text[this.cursor] === "}") {
        this.cursor += 1;
        return {
          kind: "object",
          firstToken: this.exampleSlice(start, start + 1),
          entries,
          ellipsis: objectEllipsis,
        };
      }

      if (this.text[this.cursor] === ",") {
        this.cursor += 1;
        this.skipSpaces();
        continue;
      }

      if (
        this.text[this.cursor] === ":" &&
        this.nextNonWhitespaceChar() === "}"
      ) {
        this.pushError(
          this.cursor,
          this.cursor + 1,
          "Unexpected ':' before '}'",
        );
        this.cursor += 1;
        this.skipSpaces();
        if (this.text[this.cursor] === "}") {
          this.cursor += 1;
          return {
            kind: "object",
            firstToken: this.exampleSlice(start, start + 1),
            entries,
            ellipsis: objectEllipsis,
          };
        }
      }

      if (this.cursor >= this.text.length) {
        break;
      }

      this.pushError(
        this.cursor,
        Math.min(this.cursor + 1, this.text.length),
        "Expected ',' or '}'",
      );

      if (this.isObjectEntryStart()) {
        continue;
      }

      this.syncToObjectDelimiter();
      if (this.text[this.cursor] === ",") {
        this.cursor += 1;
        this.skipSpaces();
        continue;
      }
      if (this.text[this.cursor] === "}") {
        this.cursor += 1;
        return {
          kind: "object",
          firstToken: this.exampleSlice(start, start + 1),
          entries,
          ellipsis: objectEllipsis,
        };
      }
      break;
    }

    this.pushError(this.cursor, this.cursor, "Expected '}'");
    return {
      kind: "object",
      firstToken: this.exampleSlice(start, start + 1),
      entries,
      ellipsis: objectEllipsis,
    };
  }

  parseObjectKeyWithRecovery(): JsonString | null {
    const key = this.parseString();
    if (key) {
      return key;
    }

    if (this.cursor >= this.text.length) {
      return null;
    }

    const ch = this.text[this.cursor]!;
    if (ch === "}" || ch === ",") {
      return null;
    }

    // Recover common non-quoted key typo and continue parsing following entries.
    const start = this.cursor;
    while (this.cursor < this.text.length) {
      const c = this.text[this.cursor]!;
      if (c === ":" || c === "," || c === "}" || /\s/.test(c)) {
        break;
      }
      this.cursor += 1;
    }

    if (this.cursor === start) {
      return null;
    }

    return {
      kind: "string",
      value: this.text.slice(start, this.cursor),
      firstToken: this.exampleSlice(start, this.cursor),
    };
  }

  parseEllipsis(): JsonEllipsis | null {
    if (!this.text.startsWith("...", this.cursor)) {
      return null;
    }

    const start = this.cursor;
    this.cursor += 3;

    if (this.mode === "strict") {
      this.pushError(
        start,
        this.cursor,
        "Ellipsis is not allowed in strict mode",
      );
      return null;
    }

    return {
      kind: "ellipsis",
      firstToken: this.exampleSlice(start, this.cursor),
    };
  }

  parseArray(): JsonArray<Mode> {
    const start = this.cursor;
    this.cursor += 1;
    this.skipSpaces();

    const values: JsonValue<Mode>[] = [];

    if (this.text[this.cursor] === "]") {
      this.cursor += 1;
      return {
        kind: "array",
        firstToken: this.exampleSlice(start, start + 1),
        elements: values,
      };
    }

    while (this.cursor < this.text.length) {
      const value = this.parseValue();
      if (value) {
        values.push(value);
      } else {
        this.syncToArrayDelimiter();
      }

      this.skipSpaces();
      if (this.text[this.cursor] === "]") {
        this.cursor += 1;
        return {
          kind: "array",
          firstToken: this.exampleSlice(start, start + 1),
          elements: values,
        };
      }

      if (this.text[this.cursor] === ",") {
        this.cursor += 1;
        this.skipSpaces();
        continue;
      }

      if (
        this.text[this.cursor] === ":" &&
        this.nextNonWhitespaceChar() === "]"
      ) {
        this.pushError(
          this.cursor,
          this.cursor + 1,
          "Unexpected ':' before ']'",
        );
        this.cursor += 1;
        this.skipSpaces();
        if (this.text[this.cursor] === "]") {
          this.cursor += 1;
          return {
            kind: "array",
            firstToken: this.exampleSlice(start, start + 1),
            elements: values,
          };
        }
      }

      if (this.cursor >= this.text.length) {
        break;
      }

      this.pushError(
        this.cursor,
        Math.min(this.cursor + 1, this.text.length),
        "Expected ',' or ']'",
      );

      if (this.isValueStart()) {
        continue;
      }

      this.syncToArrayDelimiter();
      if (this.text[this.cursor] === ",") {
        this.cursor += 1;
        this.skipSpaces();
        continue;
      }
      if (this.text[this.cursor] === "]") {
        this.cursor += 1;
        return {
          kind: "array",
          firstToken: this.exampleSlice(start, start + 1),
          elements: values,
        };
      }
      break;
    }

    this.pushError(this.cursor, this.cursor, "Expected ']'");
    return {
      kind: "array",
      firstToken: this.exampleSlice(start, start + 1),
      elements: values,
    };
  }

  parseString(): JsonString | null {
    if (this.text[this.cursor] !== '"') {
      this.pushError(
        this.cursor,
        Math.min(this.cursor + 1, this.text.length),
        "Expected JSON string",
      );
      return null;
    }

    const start = this.cursor;
    this.cursor += 1;

    while (this.cursor < this.text.length) {
      const nextSpecial = findNextRegexIndex(
        this.text,
        this.cursor,
        JSON_STRING_TOKEN_RE,
      );
      if (nextSpecial < 0) {
        break;
      }

      this.cursor = nextSpecial;
      if (this.text[this.cursor] === "\\") {
        this.cursor += 2;
        continue;
      }

      if (this.text[this.cursor] === '"') {
        const end = this.cursor + 1;
        const raw = this.text.slice(start, end);
        this.cursor = end;

        const decoded = decodeJsonString(raw);
        if (decoded === null) {
          this.pushError(start, end, "Invalid JSON string escape sequence");
        }

        return {
          kind: "string",
          value: decoded ?? raw.slice(1, -1),
          firstToken: this.exampleSlice(start, end),
        };
      }
    }

    this.pushError(
      start,
      this.cursor,
      "Expected closing quote for JSON string",
    );
    return null;
  }

  parseNumber(): JsonNumber | null {
    const rest = this.text.slice(this.cursor);
    const match = rest.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) {
      this.pushError(
        this.cursor,
        Math.min(this.cursor + 1, this.text.length),
        "Expected JSON number",
      );
      return null;
    }

    const start = this.cursor;
    this.cursor += match[0].length;
    return {
      kind: "number",
      value: Number(match[0]),
      firstToken: this.exampleSlice(start, this.cursor),
    };
  }

  parseBoolean(): JsonBoolean | null {
    const start = this.cursor;
    if (this.text.startsWith("true", this.cursor)) {
      this.cursor += 4;
      return {
        kind: "boolean",
        value: true,
        firstToken: this.exampleSlice(start, this.cursor),
      };
    }
    if (this.text.startsWith("false", this.cursor)) {
      this.cursor += 5;
      return {
        kind: "boolean",
        value: false,
        firstToken: this.exampleSlice(start, this.cursor),
      };
    }

    this.pushError(
      this.cursor,
      Math.min(this.cursor + 1, this.text.length),
      "Expected 'true' or 'false'",
    );
    return null;
  }

  parseNull(): JsonNull | null {
    if (!this.text.startsWith("null", this.cursor)) {
      this.pushError(
        this.cursor,
        Math.min(this.cursor + 1, this.text.length),
        "Expected 'null'",
      );
      return null;
    }

    const start = this.cursor;
    this.cursor += 4;
    return {
      kind: "null",
      firstToken: this.exampleSlice(start, this.cursor),
    };
  }

  skipSpaces(): void {
    while (true) {
      this.cursor = skipWithRegex(this.text, this.cursor, WHITESPACE_RUN_RE);

      if (this.text.startsWith("//", this.cursor)) {
        this.cursor += 2;
        while (this.cursor < this.text.length) {
          const ch = this.text[this.cursor]!;
          if (ch === "\n" || ch === "\r") {
            break;
          }
          this.cursor += 1;
        }
        continue;
      }

      if (this.text.startsWith("/*", this.cursor)) {
        const blockCommentStart = this.cursor;
        const blockCommentEnd = this.text.indexOf("*/", this.cursor + 2);
        if (blockCommentEnd < 0) {
          this.pushError(
            blockCommentStart,
            this.text.length,
            "Expected closing '*/' for block comment",
          );
          this.cursor = this.text.length;
          return;
        }

        this.cursor = blockCommentEnd + 2;
        continue;
      }

      return;
    }
  }

  pushError(start: number, end: number, message: string): void {
    this.errors.push({
      span: {
        start: decodedToSourceOffset(this.content, start),
        end: decodedToSourceOffset(this.content, end),
      },
      message,
    });
  }

  exampleSlice(start: number, end: number): SourceSpan {
    return {
      text: this.text.slice(start, end),
      start: decodedToSourceOffset(this.content, start),
      end: decodedToSourceOffset(this.content, end),
    };
  }

  nextNonWhitespaceChar(): string | undefined {
    let i = this.cursor + 1;
    while (i < this.text.length && /\s/.test(this.text[i]!)) {
      i += 1;
    }
    return this.text[i];
  }

  isValueStart(): boolean {
    if (this.cursor >= this.text.length) {
      return false;
    }
    const ch = this.text[this.cursor]!;
    return (
      ch === "{" ||
      ch === "[" ||
      ch === '"' ||
      ch === "-" ||
      /[0-9]/.test(ch) ||
      ch === "t" ||
      ch === "f" ||
      ch === "n" ||
      this.text.startsWith("...", this.cursor)
    );
  }

  isObjectEntryStart(): boolean {
    if (this.cursor >= this.text.length) {
      return false;
    }
    const ch = this.text[this.cursor]!;
    return ch === '"' || /[A-Za-z0-9_$]/.test(ch);
  }

  syncToObjectDelimiter(): void {
    while (this.cursor < this.text.length) {
      this.skipSpaces();
      if (this.cursor >= this.text.length) {
        return;
      }

      const ch = this.text[this.cursor]!;
      if (ch === "," || ch === "}" || this.isObjectEntryStart()) {
        return;
      }
      this.cursor += 1;
    }
  }

  syncToArrayDelimiter(): void {
    while (this.cursor < this.text.length) {
      this.skipSpaces();
      if (this.cursor >= this.text.length) {
        return;
      }

      const ch = this.text[this.cursor]!;
      if (ch === "," || ch === "]" || this.isValueStart()) {
        return;
      }
      this.cursor += 1;
    }
  }

  cursor = 0;
  readonly errors: InternalError[] = [];
  readonly text: string;
}

function decodeJsonString(raw: string): string | null {
  try {
    return JSON.parse(raw) as string;
  } catch {
    return null;
  }
}

const WHITESPACE_RUN_RE = /\s*/y;
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
