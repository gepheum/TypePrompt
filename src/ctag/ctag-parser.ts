import { JsonParser } from "../json/json-parser.js";
import type { InternalErrors } from "../util/error-types.js";
import { CTag } from "./ctag-types.js";

export function parseCTag(source: string): CTag | InternalErrors {
  return new CTagParser(source).parse();
}

class CTagParser {
  private readonly parser: JsonParser;

  constructor(private readonly text: string) {
    this.parser = new JsonParser(text);
  }

  parse(): CTag | InternalErrors {
    const identifierMatch = /^\s*(\w+)\s*$/.exec(this.text);
    if (identifierMatch) {
      const outerStart = identifierMatch[0]!.search(/\S/);
      const identifier = identifierMatch[1]!;
      return {
        kind: "identifier",
        identifier: {
          text: identifier,
          start: outerStart,
          end: outerStart + identifier.length,
        },
      };
    }

    this.parser.skipSpaces();

    if (
      this.parser.cursor >= this.text.length &&
      this.parser.errors.length > 0
    ) {
      return {
        kind: "error",
        errors: this.parser.errors,
      };
    }

    const value = this.parser.parseValue();
    if (!value) {
      return {
        kind: "error",
        errors: this.parser.errors,
      };
    }

    this.parser.skipSpaces();
    if (this.parser.cursor < this.text.length) {
      this.parser.pushError(
        this.parser.cursor,
        this.text.length,
        "Unexpected trailing content after JSON value",
      );
    }

    if (this.parser.errors.length > 0) {
      return {
        kind: "error",
        errors: this.parser.errors,
      };
    }

    return {
      kind: "json",
      json: value,
    };
  }
}
