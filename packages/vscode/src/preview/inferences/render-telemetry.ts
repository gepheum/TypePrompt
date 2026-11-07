import type { Inferences } from "@typeprompt/core";
import { formatDuration, formatNumber } from "../common/formatters.js";
import { html, type SafeHtml } from "../common/html.js";

export function renderTelemetryStrip(
  telemetry: Inferences.InferenceTelemetry,
): SafeHtml {
  const { latencyMs, usage } = telemetry;

  return html`
    <div class="telemetry-strip">
      <span class="telemetry-item" title="Latency">
        <span class="telemetry-label">lat</span>
        <strong>${formatDuration(latencyMs)}</strong>
      </span>
      ${
        usage
          ? html`
              <span class="telemetry-item" title="Total Tokens (In / Out)">
                <span class="telemetry-label">tokens</span>
                <strong>${formatNumber(usage.totalTokens)}</strong>
                <span style="color: var(--text-soft)"
                  >(${usage.inputTokens} in / ${usage.outputTokens} out)</span
                >
              </span>
              ${
                usage.reasoningTokens
                  ? html`
                      <span class="telemetry-item" title="Reasoning Tokens">
                        <span class="telemetry-label">reasoning</span>
                        <strong>${formatNumber(usage.reasoningTokens)}</strong>
                      </span>
                    `
                  : ""
              }
            `
          : ""
      }
    </div>
  `;
}

