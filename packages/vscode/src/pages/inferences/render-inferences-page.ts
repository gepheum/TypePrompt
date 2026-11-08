import type { Inferences } from "@typeprompt/core";
import YAML from "yaml";
import { formatTimestamp } from "../common/formatters.js";
import { html, rawHtml } from "../common/html.js";
import { highlightTp, highlightYaml } from "../common/token-highlighting.js";
import { INFERENCES_PAGE_SCRIPT } from "./inferences-page-script.js";
import { INFERENCES_PAGE_STYLES } from "./inferences-page-styles.js";
import { renderInferenceCard } from "./render-inference-card.js";

// -----------------------------------------------------------------------------
// HTML Page Rendering
// -----------------------------------------------------------------------------

export function renderInferencesPageHtml(
  data: Inferences.InferenceSet<Inferences.Pending>,
): string {
  const modelYaml = YAML.stringify(data.model).trimEnd();
  const displayTemplateId = data.templateId.startsWith("Main:")
    ? data.templateId.slice("Main:".length)
    : data.templateId;

  return html`<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${displayTemplateId} · TypePrompt inferences</title>
        <style>
          ${rawHtml(INFERENCES_PAGE_STYLES)}
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <header>
            <div class="header-top">
              <div class="title-group">
                <h1>
                  <span>${displayTemplateId}</span>
                  <span class="badge-tag">playground</span>
                </h1>
                <div class="timestamp">
                  ${formatTimestamp(data.isoTimestamp)} · ID: ${data.id}
                </div>
              </div>

              <!-- Model YAML block -->
              <div class="model-yaml-card">
                <pre class="model-yaml-body">${highlightYaml(modelYaml)}</pre>
              </div>
            </div>
          </header>

          <!-- Samples Toolbar -->
          <div class="samples-toolbar">
            <div class="samples-count">
              ${data.inferences.length}
              sample${data.inferences.length !== 1 ? "s" : ""}
            </div>
            <div class="toolbar-actions">
              <button
                type="button"
                class="btn-action"
                onclick="toggleAllSamples(true)"
              >
                Expand all
              </button>
              <button
                type="button"
                class="btn-action"
                onclick="toggleAllSamples(false)"
              >
                Collapse all
              </button>
            </div>
          </div>

          <!-- Inferences List -->
          <main class="inferences-section">
            ${data.inferences.map((inf) =>
              renderInferenceCard(inf, data.inferences.length),
            )}
          </main>

          <!-- Source Files Section (at the end with a clear separator) -->
          ${
            Object.keys(data.templateFiles).length > 0
              ? html`
                  <div class="source-files-section">
                    <details>
                      <summary>
                        View source files
                        (${Object.keys(data.templateFiles).length})
                      </summary>
                      <div
                        class="details-body"
                        style="display: flex; flex-direction: column; gap: 0.65rem;"
                      >
                        ${Object.entries(data.templateFiles)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(
                            ([filePath, content]) => html`
                              <details class="source-file-item">
                                <summary class="source-file-header">
                                  <span
                                    style="font-family: var(--font-mono); font-size: 0.82rem; font-weight: 600;"
                                    >${filePath}</span
                                  >
                                </summary>
                                <pre
                                  class="code-view is-active"
                                  style="padding: 0.85rem 1rem; background: var(--bg-inset); margin: 0;"
                                >
${highlightTp(content)}</pre>
                              </details>
                            `,
                          )}
                      </div>
                    </details>
                  </div>
                `
              : ""
          }

          <footer>
            Generated with
            <a href="https://typeprompt.dev" target="_blank" rel="noopener"
              >TypePrompt</a
            >
          </footer>
        </div>

        <script>
          ${rawHtml(INFERENCES_PAGE_SCRIPT)};
        </script>
      </body>
    </html>`.value;
}
