import type { Inferences } from "@typeprompt/core";
import { html, type TemplateResult } from "lit";
import { formatDuration, formatNumber } from "../common/formatters.js";

export function renderTelemetryStrip(
  telemetry: Inferences.InferenceTelemetry,
): TemplateResult {
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
                <span class="telemetry-detail"
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
