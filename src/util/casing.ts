import { InternalError, TextSpan } from "./shared-types.js";

type Error<S extends TextSpan> = {
  readonly span: S;
} & InternalError;

export function checkNameConflicts<S extends TextSpan>(
  names: readonly S[],
): ReadonlyArray<Error<S>> {
  const firstByLowercase = new Map<string, S>();
  const firstDuplicateAlreadyReported = new Set<string>();
  const errors: Error<S>[] = [];

  for (const name of names) {
    const lowercase = name.text.toLowerCase().replace(/[_\-./]/g, "");
    const first = firstByLowercase.get(lowercase);
    if (first === undefined) {
      firstByLowercase.set(lowercase, name);
      continue;
    }

    if (name.text === first.text) {
      if (!firstDuplicateAlreadyReported.has(lowercase)) {
        errors.push({
          span: first,
          message: `Duplicate identifier '${name.text}'`,
        });
        firstDuplicateAlreadyReported.add(lowercase);
      }
      errors.push({
        span: name,
        message: `Duplicate identifier '${name.text}'`,
      });
      continue;
    }

    errors.push({
      span: name,
      message: `'${name.text}' and '${first.text}' differ only by casing`,
      rule: "Identifiers must be case-insensitively unique",
    });
  }

  return errors;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Splits an identifier into lower-case words, treating separators and camelCase boundaries as breaks. */
function splitIntoWords(identifier: string): string[] {
  return identifier
    .replace(/[_\-./]+/g, " ")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(" ")
    .filter((w) => w.length > 0);
}

/**
 * Converts an identifier into lower_snake_case.
 * Symbols are treated as word breaks and stripped.
 *
 * Examples:
 *   `parseHTMLDocument` -> `parse_html_document`
 *   `foo-bar.baz_qux`  -> `foo_bar_baz_qux`
 */
export function toSnakeCase(identifier: string): string {
  return splitIntoWords(identifier).join("_");
}

/**
 * Converts an identifier into PascalCase.
 * Symbols are treated as word breaks and stripped.
 * ALL_CAPS runs are lowercased before capitalizing, so `parseHTML` -> `ParseHtml`.
 *
 * Examples:
 *   `parseHTMLDocument` -> `ParseHtmlDocument`
 *   `foo-bar.baz_qux`  -> `FooBarBazQux`
 */
export function toPascalCase(identifier: string): string {
  return splitIntoWords(identifier).map(capitalize).join("");
}

/**
 * Converts an identifier into camelCase.
 * Symbols are treated as word breaks and stripped.
 * ALL_CAPS runs are lowercased before capitalizing, so `parseHTML` -> `parseHtml`.
 *
 * Examples:
 *   `parseHTMLDocument` -> `parseHtmlDocument`
 *   `foo-bar.baz_qux`  -> `fooBarBazQux`
 */
export function toCamelCase(identifier: string): string {
  return splitIntoWords(identifier)
    .map((w, i) => (i <= 0 ? w : capitalize(w)))
    .join("");
}
