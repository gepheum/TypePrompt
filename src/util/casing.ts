import { InternalError, TextSpan } from "./shared-types.js";

type Error<S extends TextSpan> = {
  readonly span: S;
} & InternalError;

export function checkNameConflicts<S extends TextSpan>(
  names: ReadonlyArray<S>,
): ReadonlyArray<Error<S>> {
  const firstByLowercase = new Map<string, S>();
  const firstDuplicateAlreadyReported = new Set<string>();
  const errors: Error<S>[] = [];

  for (const name of names) {
    const lowercase = name.text.toLowerCase();
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

/**
 * Converts a lowerCamelCase or UpperCamelCase identifier into lower_underscore format.
 * 
 * Correctly handles acronyms (e.g., `parseHTMLDocument` -> `parse_html_document`) and
 * embedded digits (e.g., `IPv4Address` -> `ipv4_address`).
 */
export function camelToSnakeCase(identifier: string): string {
  return identifier
    // Insert underscore between consecutive uppercase letters when followed by lowercase (acronym boundary)
    // Example: "HTMLDocument" -> "HTML_Document"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    // Insert underscore between lowercase letter/digit and uppercase letter (word boundary)
    // Example: "parseHTML" -> "parse_HTML", "v2Api" -> "v2_Api"
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    // Convert the entire result to lowercase
    .toLowerCase();
}
