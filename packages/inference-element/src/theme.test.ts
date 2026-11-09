import { describe, it } from "mocha";
import assert from "node:assert";
import { commonStyles } from "./common/styles.js";
import {
  ALL_THEME_VARIABLES,
  formatThemeVariables,
  OPTIONAL_THEME_VARIABLES,
  THEME_VARIABLES,
  type ThemeVariables,
} from "./theme.js";

describe("theme contract", () => {
  it("defines 29 required theme variables", () => {
    assert.strictEqual(THEME_VARIABLES.length, 29);
  });

  it("defines 21 optional theme variables", () => {
    assert.strictEqual(OPTIONAL_THEME_VARIABLES.length, 21);
  });

  it("combines required and optional into ALL_THEME_VARIABLES without duplicates", () => {
    assert.strictEqual(
      ALL_THEME_VARIABLES.length,
      THEME_VARIABLES.length + OPTIONAL_THEME_VARIABLES.length,
    );
    const unique = new Set(ALL_THEME_VARIABLES);
    assert.strictEqual(unique.size, ALL_THEME_VARIABLES.length);
  });

  it("references every required theme variable in commonStyles", () => {
    const css = commonStyles.cssText;
    for (const v of THEME_VARIABLES) {
      assert.ok(
        css.includes(v),
        `Expected commonStyles to reference required theme variable: ${v}`,
      );
    }
  });

  it("declares every --tp-* variable present in commonStyles", () => {
    const css = commonStyles.cssText;
    const matches = Array.from(css.matchAll(/--tp-[a-z0-9-]+/g), (m) => m[0]);
    const uniqueVars = Array.from(new Set(matches));
    const declaredVars = new Set<string>(ALL_THEME_VARIABLES);

    for (const v of uniqueVars) {
      assert.ok(
        declaredVars.has(v),
        `Found undeclared --tp-* variable in commonStyles: ${v}`,
      );
    }
  });

  it("formats theme variables into CSS rules with specified indent", () => {
    const sample: Partial<ThemeVariables> = {
      "--tp-bg": "#000000",
      "--tp-text": "#ffffff",
    };
    const formatted = formatThemeVariables(sample, "  ");
    assert.strictEqual(formatted, "  --tp-bg: #000000;\n  --tp-text: #ffffff;");
  });

  it("enforces type-checking on ThemeVariables", () => {
    // Verified at compile time:
    const valid: ThemeVariables = {
      "--tp-font-family": "sans-serif",
      "--tp-font-mono": "monospace",
      "--tp-font-size": "13px",
      "--tp-bg": "#000",
      "--tp-bg-surface": "#111",
      "--tp-bg-surface-elevated": "#222",
      "--tp-bg-inset": "#050505",
      "--tp-border": "#333",
      "--tp-border-subtle": "#222",
      "--tp-border-focus": "#00f",
      "--tp-text": "#fff",
      "--tp-text-muted": "#aaa",
      "--tp-text-soft": "#777",
      "--tp-button-bg": "#0284c7",
      "--tp-button-fg": "#ffffff",
      "--tp-button-hover": "#0369a1",
      "--tp-dropdown-bg": "#000",
      "--tp-dropdown-fg": "#fff",
      "--tp-dropdown-border": "#333",
      "--tp-user-bg": "#111",
      "--tp-user-border": "#222",
      "--tp-user-label": "#999",
      "--tp-assistant-bg": "#123",
      "--tp-assistant-border": "#234",
      "--tp-assistant-label": "#345",
      "--tp-tool-bg": "#312",
      "--tp-tool-border": "#423",
      "--tp-tool-label": "#534",
      "--tp-message-margin": "2rem",
    };
    assert.ok(valid["--tp-bg"]);
  });
});
