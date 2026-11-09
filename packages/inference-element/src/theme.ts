/**
 * Required theme variables that host applications (such as VS Code) must provide
 * to customize the look and feel of inference-element components.
 */
export const THEME_VARIABLES = [
  "--tp-font-family",
  "--tp-font-mono",
  "--tp-font-size",

  "--tp-bg",
  "--tp-bg-surface",
  "--tp-bg-surface-elevated",
  "--tp-bg-inset",

  "--tp-border",
  "--tp-border-subtle",
  "--tp-border-focus",

  "--tp-text",
  "--tp-text-muted",
  "--tp-text-soft",

  "--tp-button-bg",
  "--tp-button-fg",
  "--tp-button-hover",

  "--tp-dropdown-bg",
  "--tp-dropdown-fg",
  "--tp-dropdown-border",

  "--tp-user-bg",
  "--tp-user-border",
  "--tp-user-label",

  "--tp-assistant-bg",
  "--tp-assistant-border",
  "--tp-assistant-label",

  "--tp-tool-bg",
  "--tp-tool-border",
  "--tp-tool-label",

  "--tp-message-margin",
] as const;

/**
 * A required CSS custom property name accepted by inference-element.
 */
export type ThemeVariable = (typeof THEME_VARIABLES)[number];

/**
 * A dictionary specifying values for every required theme variable.
 */
export type ThemeVariables = Record<ThemeVariable, string>;

/**
 * Optional theme variables that have component-level defaults but can be
 * overridden by hosts (e.g. for light themes or specific callout styling).
 */
export const OPTIONAL_THEME_VARIABLES = [
  "--tp-success-bg",
  "--tp-success-border",
  "--tp-success-text",

  "--tp-pending-bg",
  "--tp-pending-border",
  "--tp-pending-text",

  "--tp-error-bg",
  "--tp-error-border",
  "--tp-error-text",

  "--tp-section-request-bg",
  "--tp-section-request-header",
  "--tp-section-request-border",
  "--tp-section-request-label",

  "--tp-hl-key",
  "--tp-hl-string",
  "--tp-hl-number",
  "--tp-hl-boolean",
  "--tp-hl-comment",
  "--tp-hl-xml-tag",
  "--tp-hl-xml-attribute",
  "--tp-hl-schema-keyword",
] as const;

/**
 * An optional CSS custom property name accepted by inference-element.
 */
export type OptionalThemeVariable = (typeof OPTIONAL_THEME_VARIABLES)[number];

/**
 * All recognized CSS custom properties supported by inference-element.
 */
export const ALL_THEME_VARIABLES = [
  ...THEME_VARIABLES,
  ...OPTIONAL_THEME_VARIABLES,
] as const;

/**
 * Any recognized CSS custom property supported by inference-element.
 */
export type AnyThemeVariable = (typeof ALL_THEME_VARIABLES)[number];

/**
 * A partial dictionary of theme variables (useful for theme variant overrides like light or high-contrast).
 */
export type PartialThemeVariables = Partial<Record<AnyThemeVariable, string>>;

/**
 * Formats a dictionary of theme variables into CSS declarations.
 */
export function formatThemeVariables(
  variables: Partial<Record<string, string>>,
  indent = "      ",
): string {
  return Object.entries(variables)
    .map(([name, value]) => `${indent}${name}: ${value};`)
    .join("\n");
}
