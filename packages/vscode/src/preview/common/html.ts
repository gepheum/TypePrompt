// -----------------------------------------------------------------------------
// Tagged Template Literal HTML Escaping
// -----------------------------------------------------------------------------

export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function rawHtml(value: string): SafeHtml {
  return new SafeHtml(value);
}

export function html(
  strings: TemplateStringsArray,
  ...values: readonly unknown[]
): SafeHtml {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i]!;
    if (i < values.length) {
      const value = values[i];
      if (value instanceof SafeHtml) {
        result += value.value;
      } else if (Array.isArray(value)) {
        result += value
          .map((v) => (v instanceof SafeHtml ? v.value : escapeHtml(v)))
          .join("");
      } else {
        result += escapeHtml(value);
      }
    }
  }
  return new SafeHtml(result);
}

