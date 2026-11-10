import { DEFAULT_NAMESPACE, type Inferences, type Lsp } from "@typeprompt/core";
import {
  formatThemeVariables,
  type PartialThemeVariables,
  type ThemeVariables,
} from "@typeprompt/inference-element";

/**
 * Escapes characters for HTML text and attribute interpolation.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const vscodeThemeVariables: ThemeVariables = {
  "--tp-font-family": "var(--vscode-font-family)",
  "--tp-font-mono": "var(--vscode-editor-font-family)",
  "--tp-font-size": "var(--vscode-font-size)",

  "--tp-bg": "var(--vscode-editor-background)",
  "--tp-bg-surface":
    "var(--vscode-sideBar-background, var(--vscode-editorWidget-background))",
  "--tp-bg-surface-elevated":
    "var(--vscode-list-hoverBackground, var(--vscode-toolbar-hoverBackground))",
  "--tp-bg-inset":
    "var(--vscode-textCodeBlock-background, var(--vscode-editor-background))",

  "--tp-border":
    "var(--vscode-panel-border, var(--vscode-widget-border, var(--vscode-editorWidget-border)))",
  "--tp-border-subtle":
    "var(--vscode-tree-tableColumnsBorder, var(--vscode-editorGroup-border))",
  "--tp-border-focus": "var(--vscode-focusBorder)",

  "--tp-text": "var(--vscode-editor-foreground, var(--vscode-foreground))",
  "--tp-text-muted": "var(--vscode-descriptionForeground)",
  "--tp-text-soft": "var(--vscode-disabledForeground)",

  "--tp-button-bg": "var(--vscode-button-background)",
  "--tp-button-fg": "var(--vscode-button-foreground)",
  "--tp-button-hover": "var(--vscode-button-hoverBackground)",

  "--tp-dropdown-bg":
    "var(--vscode-dropdown-background, var(--vscode-input-background))",
  "--tp-dropdown-fg":
    "var(--vscode-dropdown-foreground, var(--vscode-input-foreground))",
  "--tp-dropdown-border":
    "var(--vscode-dropdown-border, var(--vscode-input-border))",

  "--tp-user-bg":
    "var(--vscode-chat-requestBackground, color-mix(in srgb, var(--vscode-editor-foreground, #ffffff) 5%, var(--vscode-editor-background, #0b0f19)))",
  "--tp-user-border":
    "var(--vscode-chat-requestBorder, color-mix(in srgb, var(--vscode-editor-foreground, #ffffff) 14%, var(--vscode-panel-border, #1f293d)))",
  "--tp-user-label": "var(--vscode-descriptionForeground)",

  "--tp-assistant-bg":
    "color-mix(in srgb, var(--vscode-focusBorder, #38bdf8) 8%, var(--vscode-editor-background, #0b0f19))",
  "--tp-assistant-border":
    "color-mix(in srgb, var(--vscode-focusBorder, #38bdf8) 28%, var(--vscode-panel-border, #1f293d))",
  "--tp-assistant-label": "var(--vscode-focusBorder, #38bdf8)",

  "--tp-tool-bg":
    "color-mix(in srgb, #a855f7 9%, var(--vscode-editor-background, #0b0f19))",
  "--tp-tool-border":
    "color-mix(in srgb, #a855f7 28%, var(--vscode-panel-border, #1f293d))",
  "--tp-tool-label": "#c084fc",

  "--tp-message-margin": "2.5rem",
};

const vscodeLightVariables: PartialThemeVariables = {
  "--tp-user-bg": "var(--vscode-chat-requestBackground, #f1f5f9)",
  "--tp-user-border": "var(--vscode-chat-requestBorder, #cbd5e1)",
  "--tp-user-label": "#475569",

  "--tp-assistant-bg": "#f0f9ff",
  "--tp-assistant-border": "#bae6fd",
  "--tp-assistant-label": "#0284c7",

  "--tp-tool-bg": "#faf5ff",
  "--tp-tool-border": "#e9d5ff",
  "--tp-tool-label": "#7c3aed",

  "--tp-success-bg": "rgba(22, 163, 74, 0.12)",
  "--tp-success-border": "rgba(22, 163, 74, 0.35)",
  "--tp-success-text": "#16a34a",

  "--tp-pending-bg": "rgba(217, 119, 6, 0.12)",
  "--tp-pending-border": "rgba(217, 119, 6, 0.35)",
  "--tp-pending-text": "#d97706",

  "--tp-error-bg": "rgba(220, 38, 38, 0.1)",
  "--tp-error-border": "rgba(220, 38, 38, 0.35)",
  "--tp-error-text": "#dc2626",

  "--tp-hl-key": "#0284c7",
  "--tp-hl-string": "#059669",
  "--tp-hl-number": "#d97706",
  "--tp-hl-boolean": "#db2777",
  "--tp-hl-comment": "#64748b",
  "--tp-hl-xml-tag": "#0284c7",
  "--tp-hl-xml-attribute": "#7c3aed",
  "--tp-hl-schema-keyword": "#db2777",
};

const vscodeHighContrastVariables: PartialThemeVariables = {
  "--tp-border": "var(--vscode-contrastBorder, #ffffff)",
  "--tp-border-subtle": "var(--vscode-contrastBorder, #ffffff)",
  "--tp-border-focus":
    "var(--vscode-focusBorder, var(--vscode-contrastBorder, #ffffff))",
  "--tp-user-border": "var(--vscode-contrastBorder, #ffffff)",
  "--tp-assistant-border": "var(--vscode-contrastBorder, #ffffff)",
  "--tp-tool-border": "var(--vscode-contrastBorder, #ffffff)",
};

const vscodeThemeVariablesCss = formatThemeVariables(vscodeThemeVariables);

const vscodeThemeRules = `
    body.vscode-light {
${formatThemeVariables(vscodeLightVariables)}
    }

    body.vscode-high-contrast,
    body.vscode-high-contrast-light {
${formatThemeVariables(vscodeHighContrastVariables)}
    }
`;

/**
 * Builds the HTML content for the playground preview webview, mounting <playground-preview>
 * and wiring nanoevents to VSCode postMessage.
 */
export function resolveTemplateIdFromMatch(
  match: { project: Lsp.WireProject; relativePath: string } | null,
): string {
  if (!match) return "";
  const sourceFile =
    match.project.compilationResult.sourceFiles[match.relativePath];
  if (sourceFile?.entity?.kind === "playground") {
    const ns = sourceFile.entity.namespace ?? DEFAULT_NAMESPACE;
    return `${ns}:${sourceFile.entity.forTemplate}`;
  }
  if (sourceFile?.entity?.kind === "template") {
    const ns = sourceFile.entity.namespace ?? DEFAULT_NAMESPACE;
    return `${ns}:${sourceFile.entity.name}`;
  }
  return "";
}

/**
 * Builds the HTML content for the playground preview webview, mounting <tp-playground-preview>
 * and wiring nanoevents to VSCode postMessage.
 */
export function getPlaygroundPreviewHtml(
  scriptUri: string,
  match: { project: Lsp.WireProject; relativePath: string } | null,
  title: string,
): string {
  const templateId = resolveTemplateIdFromMatch(match);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview: ${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: var(--vscode-editor-background, #0b0f19);
      color: var(--vscode-editor-foreground, #f1f5f9);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      height: 100vh;
      overflow-y: auto;
${vscodeThemeVariablesCss}
    }
    ${vscodeThemeRules}
  </style>
</head>
<body>
  <tp-playground-preview id="preview"></tp-playground-preview>

  <script type="module">
    import { playgroundPreviewEvents } from "${scriptUri}";

    const vscode = acquireVsCodeApi();

    playgroundPreviewEvents.on("createSecrets", () => {
      vscode.postMessage({ type: "createSecretsFile" });
    });

    playgroundPreviewEvents.on("runInference", () => {
      vscode.postMessage({ type: "runInference" });
    });

    playgroundPreviewEvents.on("selectSample", (key, index) => {
      vscode.postMessage({ type: "selectSample", key, index });
    });

    const preview = document.getElementById("preview");
    preview.wireProject = ${JSON.stringify(match?.project ?? null)};
    preview.templateId = ${JSON.stringify(templateId)};
  </script>
</body>
</html>`;
}

/**
 * Builds the HTML content for the inference webview, mounting <tp-inference-run>
 * and listening for reactive updates.
 */
export function getInferencePageHtml(
  scriptUri: string,
  initialData: Inferences.InferenceRun<Inferences.Pending>,
  title: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} · TypePrompt Inference</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: var(--vscode-editor-background, #0b0f19);
      color: var(--vscode-editor-foreground, #f1f5f9);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      height: 100vh;
      overflow-y: auto;
${vscodeThemeVariablesCss}
    }
    ${vscodeThemeRules}
  </style>
</head>
<body>
  <tp-inference-run id="inference-run"></tp-inference-run>

  <script type="module">
    import "${scriptUri}";

    const inferenceRun = document.getElementById("inference-run");
    inferenceRun.inferenceRun = ${JSON.stringify(initialData)};

    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "updateInferenceRun") {
        inferenceRun.inferenceRun = event.data.inferenceRun;
      }
    });
  </script>
</body>
</html>`;
}
