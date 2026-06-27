import {
  Example,
  ExampleParseError,
  ExampleParseErrors,
  ExampleSourceSpan,
  JsonArray,
  JsonBoolean,
  JsonEllipsis,
  JsonNull,
  JsonNumber,
  JsonObject,
  JsonObjectEntry,
  JsonString,
  JsonValue,
} from "./example-types.js";

export function parseExample(
  exampleSource: string,
): Example | ExampleParseErrors {
  return new ExampleParser(exampleSource).parse();
}

class ExampleParser {
  private readonly errors: ExampleParseError[] = [];
  private cursor = 0;

  constructor(private readonly text: string) {}

  parse(): Example | ExampleParseErrors {
    this.skipJsonSpaces();

    if (this.cursor >= this.text.length && this.errors.length > 0) {
      return {
        kind: "error",
        errors: this.errors,
      };
    }

    const value = this.parseJsonValue();
    if (!value) {
      return {
        kind: "error",
        errors: this.errors,
      };
    }

    this.skipJsonSpaces();
    if (this.cursor < this.text.length) {
      this.errors.push({
        start: this.cursor,
        end: this.text.length,
        message: "Unexpected trailing content after JSON value",
      });
    }

    if (this.errors.length > 0) {
      return {
        kind: "error",
        errors: this.errors,
      };
    }

    return {
      kind: "success",
      value,
    };
  }

  private parseJsonValue(): JsonValue | null {
    if (this.cursor >= this.text.length) {
      this.pushError(this.cursor, this.cursor, "Expected JSON value");
      return null;
    }

    const ch = this.text[this.cursor]!;
    if (ch === "{") {
      return this.parseJsonObject();
    }
    if (this.text.startsWith("...", this.cursor)) {
      return this.parseJsonEllipsis();
    }
    if (ch === "[") {
      return this.parseJsonArray();
    }
    if (ch === '"') {
      return this.parseJsonString();
    }
    if (ch === "t" || ch === "f") {
      return this.parseJsonBoolean();
    }
    if (ch === "n") {
      return this.parseJsonNull();
    }
    if (ch === "-" || /[0-9]/.test(ch)) {
      return this.parseJsonNumber();
    }

    this.pushError(
      this.cursor,
      Math.min(this.cursor + 1, this.text.length),
      "Invalid JSON value",
    );
    return null;
  }

  private parseJsonObject(): JsonObject {
    const start = this.cursor;
    this.cursor += 1;
    this.skipJsonSpaces();

    const entries: JsonObjectEntry[] = [];
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
      const ellipsis = this.parseJsonEllipsis();
      if (ellipsis) {
        this.skipJsonSpaces();
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
          this.skipJsonSpaces();
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

      this.skipJsonSpaces();
      if (this.text[this.cursor] !== ":") {
        this.pushError(
          this.cursor,
          Math.min(this.cursor + 1, this.text.length),
          "Expected ':'",
        );
      } else {
        this.cursor += 1;
      }

      this.skipJsonSpaces();
      const value = this.parseJsonValue();
      if (!value) {
        this.syncToObjectDelimiter();
      } else {
        entries.push({ key, value });
      }

      this.skipJsonSpaces();

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
        this.skipJsonSpaces();
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
        this.skipJsonSpaces();
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
        this.skipJsonSpaces();
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

  private parseObjectKeyWithRecovery(): JsonString | null {
    const key = this.parseJsonString();
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

  private parseJsonEllipsis(): JsonEllipsis | null {
    if (!this.text.startsWith("...", this.cursor)) {
      return null;
    }

    const start = this.cursor;
    this.cursor += 3;
    return {
      kind: "ellipsis",
      firstToken: this.exampleSlice(start, this.cursor),
    };
  }

  private parseJsonArray(): JsonArray {
    const start = this.cursor;
    this.cursor += 1;
    this.skipJsonSpaces();

    const values: JsonValue[] = [];

    if (this.text[this.cursor] === "]") {
      this.cursor += 1;
      return {
        kind: "array",
        firstToken: this.exampleSlice(start, start + 1),
        values,
      };
    }

    while (this.cursor < this.text.length) {
      const value = this.parseJsonValue();
      if (value) {
        values.push(value);
      } else {
        this.syncToArrayDelimiter();
      }

      this.skipJsonSpaces();
      if (this.text[this.cursor] === "]") {
        this.cursor += 1;
        return {
          kind: "array",
          firstToken: this.exampleSlice(start, start + 1),
          values,
        };
      }

      if (this.text[this.cursor] === ",") {
        this.cursor += 1;
        this.skipJsonSpaces();
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
        this.skipJsonSpaces();
        if (this.text[this.cursor] === "]") {
          this.cursor += 1;
          return {
            kind: "array",
            firstToken: this.exampleSlice(start, start + 1),
            values,
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

      if (this.isValueStartAtCursor()) {
        continue;
      }

      this.syncToArrayDelimiter();
      if (this.text[this.cursor] === ",") {
        this.cursor += 1;
        this.skipJsonSpaces();
        continue;
      }
      if (this.text[this.cursor] === "]") {
        this.cursor += 1;
        return {
          kind: "array",
          firstToken: this.exampleSlice(start, start + 1),
          values,
        };
      }
      break;
    }

    this.pushError(this.cursor, this.cursor, "Expected ']'");
    return {
      kind: "array",
      firstToken: this.exampleSlice(start, start + 1),
      values,
    };
  }

  private parseJsonString(): JsonString | null {
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

  private parseJsonNumber(): JsonNumber | null {
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

  private parseJsonBoolean(): JsonBoolean | null {
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

  private parseJsonNull(): JsonNull | null {
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

  private skipJsonSpaces(): void {
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

  private pushError(start: number, end: number, message: string): void {
    this.errors.push({ start, end, message });
  }

  private exampleSlice(start: number, end: number): ExampleSourceSpan {
    return {
      text: this.text.slice(start, end),
      start,
      end,
    };
  }

  private nextNonWhitespaceChar(): string | undefined {
    let i = this.cursor + 1;
    while (i < this.text.length && /\s/.test(this.text[i]!)) {
      i += 1;
    }
    return this.text[i];
  }

  private isValueStartAtCursor(): boolean {
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

  private isObjectEntryStart(): boolean {
    if (this.cursor >= this.text.length) {
      return false;
    }
    const ch = this.text[this.cursor]!;
    return ch === '"' || /[A-Za-z0-9_$]/.test(ch);
  }

  private syncToObjectDelimiter(): void {
    while (this.cursor < this.text.length) {
      this.skipJsonSpaces();
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

  private syncToArrayDelimiter(): void {
    while (this.cursor < this.text.length) {
      this.skipJsonSpaces();
      if (this.cursor >= this.text.length) {
        return;
      }

      const ch = this.text[this.cursor]!;
      if (ch === "," || ch === "]" || this.isValueStartAtCursor()) {
        return;
      }
      this.cursor += 1;
    }
  }
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
