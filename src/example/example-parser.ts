import { JsonParser } from "../json/json-parser.js";
import { Example, ExampleParseErrors } from "./example-types.js";

export function parseExample(
  exampleSource: string,
): Example | ExampleParseErrors {
  return new ExampleParser(exampleSource).parse();
}

class ExampleParser {
  private readonly parser: JsonParser;

  constructor(private readonly text: string) {
    this.parser = new JsonParser(text);
  }

  parse(): Example | ExampleParseErrors {
    const identifierMatch = /^\s*(\w+|"(\w+)")\s*$/.exec(this.text);
    if (identifierMatch) {
      const outerStart = identifierMatch[0]!.search(/\S/);
      const isQuoted = identifierMatch[2] !== undefined;
      const identifier = isQuoted ? identifierMatch[2]! : identifierMatch[1]!;
      const start = isQuoted ? outerStart + 1 : outerStart;
      return {
        kind: "success:identifier",
        identifier: {
          text: identifier,
          start,
          end: start + identifier.length,
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
      kind: "success:json",
      json: value,
    };
  }
}
