import type { LineMatch } from "../util/line-finder.js";
import type { RenderableError } from "./renderable-error.js";

export function renderErrors(
  errors: readonly RenderableError[],
  severity: "error" | "warning",
): void {
  const MAX_ERRORS = 10;
  for (let i = 0; i < errors.length && i < MAX_ERRORS; ++i) {
    const error = errors[i];
    console.error(formatError(error!, severity));
  }
  if (errors.length <= 0) {
    return;
  }
  // Count the number of distinct files with errors.
  const files = new Set<string>();
  for (const error of errors) {
    files.add(error.path);
  }
  const formatCount = (n: number, thing: string): string =>
    `${n} ${thing}${n <= 1 ? "" : "s"}`;
  const numErrors = formatCount(errors.length, severity);
  const numFiles = formatCount(files.size, "file");
  console.error(`Found ${numErrors} in ${numFiles}\n`);
}

export function formatError(
  error: RenderableError,
  severity: "error" | "warning",
): string {
  const makeRedOrOrange = severity === "error" ? makeRed : makeOrange;
  const { start, end } = error;
  const { line, zeroBasedColNumber } = start;
  const { zeroBasedLineNumber } = line;
  const lineNumberStr = (zeroBasedLineNumber + 1).toString();
  let underlineLength: number;
  if (zeroBasedLineNumber === end.line.zeroBasedLineNumber) {
    underlineLength = Math.max(end.zeroBasedColNumber - zeroBasedColNumber, 1);
  } else {
    // Underline everything from the start column to the end of the line.
    underlineLength = line.line.length - zeroBasedColNumber;
  }
  return [
    formatLocation(error.path, error.start),
    " - ",
    error.message,
    error.hint ? makeLightGray(`\nHint: ${error.hint}`) : "",
    error.rule ? makeLightGray(`\nRule: ${error.rule}`) : "",
    "\n\n",
    makeBlackOnWhite(lineNumberStr),
    ` ${line.line}\n`,
    makeBlackOnWhite(" ".repeat(lineNumberStr.length)),
    " ".repeat(zeroBasedColNumber + 1),
    makeRedOrOrange("~".repeat(underlineLength)),
    "\n",
  ].join("");
}

function formatLocation(path: string, lineMatch: LineMatch): string {
  const { line, zeroBasedColNumber } = lineMatch;
  const { zeroBasedLineNumber } = line;
  return [
    makeCyan(path),
    makeYellow((zeroBasedLineNumber + 1).toString()),
    makeYellow((zeroBasedColNumber + 1).toString()),
  ].join(":");
}

export function makeRed(text: string): string {
  return `\x1b[31m${text}\x1b[0m`;
}

export function makeGreen(text: string): string {
  return `\x1b[32m${text}\x1b[0m`;
}

export function makeOrange(text: string): string {
  return `\x1b[38;5;208m${text}\x1b[0m`;
}

export function makeLightGray(text: string): string {
  return `\x1b[37m${text}\x1b[0m`;
}

function makeCyan(text: string): string {
  return `\x1b[36m${text}\x1b[0m`;
}

function makeYellow(text: string): string {
  return `\x1b[33m${text}\x1b[0m`;
}

function makeBlackOnWhite(text: string): string {
  return `\x1b[47m${text}\x1b[0m`;
}
