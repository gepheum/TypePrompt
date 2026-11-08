import type { Inferences, Lsp } from "@typeprompt/core";

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

/**
 * Builds the HTML content for the playground preview webview, mounting <playground-preview>
 * and wiring nanoevents to VSCode postMessage.
 */
export function getPlaygroundPreviewHtml(
  scriptUri: string,
  match: { project: Lsp.WireProject; relativePath: string } | null,
  title: string,
): string {
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
    }
  </style>
</head>
<body>
  <playground-preview id="preview"></playground-preview>

  <script type="module">
    import { events } from "${scriptUri}";

    const vscode = acquireVsCodeApi();

    events.on("createSecrets", () => {
      vscode.postMessage({ type: "createSecretsFile" });
    });

    events.on("runInferences", () => {
      vscode.postMessage({ type: "runInferences" });
    });

    events.on("selectSample", (key, index) => {
      vscode.postMessage({ type: "selectSample", key, index });
    });

    const preview = document.getElementById("preview");
    preview.wireProject = ${JSON.stringify(match?.project ?? null)};
    preview.relativePath = ${JSON.stringify(match?.relativePath ?? "")};
  </script>
</body>
</html>`;
}

/**
 * Builds the HTML content for the inferences webview, mounting <inference-set>
 * and listening for reactive updates.
 */
export function getInferencesPageHtml(
  scriptUri: string,
  initialData: Inferences.InferenceSet<Inferences.Pending>,
  title: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} · TypePrompt inferences</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: var(--vscode-editor-background, #0b0f19);
      color: var(--vscode-editor-foreground, #f1f5f9);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      height: 100vh;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <inference-set id="inferences"></inference-set>

  <script type="module">
    import "${scriptUri}";

    const inferences = document.getElementById("inferences");
    inferences.inferenceSet = ${JSON.stringify(initialData)};

    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "updateInferenceSet") {
        inferences.inferenceSet = event.data.inferenceSet;
      }
    });
  </script>
</body>
</html>`;
}
