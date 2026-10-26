import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

export type StepDefinition = {
  readonly id: number;
  readonly label: string;
  readonly tag: string;
  readonly isAvailable: boolean;
};

export const PIPELINE_STEPS: readonly StepDefinition[] = [
  { id: 1, label: "Template", tag: ".tp", isAvailable: true },
  { id: 2, label: "Input & Dataset", tag: "YAML", isAvailable: false },
  { id: 3, label: "Tool Simulation", tag: "Mock", isAvailable: false },
  { id: 4, label: "Output JSON", tag: "Result", isAvailable: false },
];

@customElement("stepper-nav")
export class StepperNav extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }

    .stepper-nav {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .step-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 999px;
      background: #151c2e;
      border: 1px solid #232c45;
      font-size: 12.5px;
      color: #94a3b8;
      cursor: pointer;
      user-select: none;
      transition: all 0.18s ease;
    }

    .step-pill:not(.disabled):hover {
      border-color: #3b4d7a;
      color: #f8fafc;
      transform: translateY(-1px);
    }

    .step-pill.active {
      background: rgba(99, 102, 241, 0.16);
      border-color: #6366f1;
      color: #c7d2fe;
      font-weight: 600;
      box-shadow: 0 0 16px rgba(99, 102, 241, 0.22);
    }

    .step-pill.disabled {
      opacity: 0.45;
      cursor: not-allowed;
      border-color: #1e2638;
      background: rgba(15, 20, 34, 0.5);
    }

    .step-num {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      color: #cbd5e1;
    }

    .step-pill.active .step-num {
      background: #6366f1;
      color: #ffffff;
      box-shadow: 0 0 8px rgba(99, 102, 241, 0.6);
    }

    .step-label {
      font-size: 12.5px;
    }

    .step-tag {
      font-size: 10.5px;
      font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      color: #94a3b8;
    }

    .step-pill.active .step-tag {
      background: rgba(99, 102, 241, 0.25);
      color: #e0e7ff;
    }

    .step-connector {
      width: 16px;
      height: 1px;
      background: #232c45;
    }
  `;

  @property({ type: Number })
  activeStep = 1;

  private handleStepClick(step: StepDefinition): void {
    if (!step.isAvailable) return;
    this.dispatchEvent(
      new CustomEvent("step-select", {
        detail: { stepId: step.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render(): TemplateResult {
    return html`
      <nav class="stepper-nav" aria-label="Pipeline Flow Steps">
        ${PIPELINE_STEPS.map((step, index) => {
          const isActive = step.id === this.activeStep;
          const isDisabled = !step.isAvailable;
          return html`
            <div
              class="step-pill ${isActive ? "active" : ""} ${isDisabled ? "disabled" : ""}"
              @click=${(): void => this.handleStepClick(step)}
              title=${isDisabled ? "Available in upcoming step" : `Go to Step ${step.id}: ${step.label}`}
            >
              <span class="step-num">${step.id}</span>
              <span class="step-label">${step.label}</span>
              <span class="step-tag">${step.tag}</span>
            </div>
            ${
              index < PIPELINE_STEPS.length - 1
                ? html`<div class="step-connector"></div>`
                : ""
            }
          `;
        })}
      </nav>
    `;
  }
}
