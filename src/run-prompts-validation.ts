import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseTemplateFile } from "./parser.js";
import type { Error as ParseError } from "./types.js";
import { validateTemplateFile } from "./validator.js";

main();

function main(): void {
  const promptsPath = resolve(process.cwd(), "examples", "prompts.prompts");
  const content = readFileSync(promptsPath, "utf8");

  const parseResult = parseTemplateFile(content);
  const parserErrors = parseResult.errors.map(formatParserError);
  const validatorErrors = validateTemplateFile(parseResult.value).map(
    (error) => `validator: ${error.message}`,
  );

  for (const error of parserErrors) {
    console.log(error);
  }
  for (const error of validatorErrors) {
    console.log(error);
  }

  if (parserErrors.length === 0 && validatorErrors.length === 0) {
    console.log("No parse/validation errors.");
  }

  if (parserErrors.length > 0 || validatorErrors.length > 0) {
    process.exitCode = 1;
  }
}

function formatParserError(error: ParseError): string {
  const line = error.codeSlice.line.lineNumber + 1;
  const reason = error.message ?? `expected ${error.expected}`;
  return `parser:${line}: ${reason}`;
}