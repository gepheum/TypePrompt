import {
  CONFIG,
  parseAndValidateYaml,
  type CompilationResult,
  type InternalError,
  type InternalErrors,
  type SchemaType,
  type StrictJsonValue,
} from "@typeprompt/core";
import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import "./editor.js";
import type { Editor } from "./editor.js";

interface SampleTemplate {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly description: string;
  readonly content: string;
  readonly schemaType?: SchemaType;
}

const sampleTemplates: readonly SampleTemplate[] = [
  {
    id: "summarize",
    name: "Summarize Document",
    path: "prompts/SummarizeDocument.tp",
    description:
      "Full prompt template with meta, schemas, system instructions, and examples",
    content: `<template name="SummarizeDocument">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      title: string;
      content: string;
      /** If provided, focus the summary on this topic. */
      focusTopic?: string;
      audience: "executive" | "technical" | "general";
    }

    interface Output {
      summary: string;
      keyPoints: string[];
      readingTimeMinutes: number;
    }
  </schema>

  <system>
    You are an expert document summarizer. Tailor your tone to the specified audience.
  </system>

  <user>
    Please summarize the following document:

    <enclosed tag="Title"><insert val="input.title" /></enclosed>
    <enclosed tag="Document"><insert val="input.content" /></enclosed>
  </user>

  <examples>
    - input:
        title: "Database Cluster Migration"
        content: "Migrated primary cluster to PostgreSQL 16. Query latency dropped 30% and throughput increased by 40%."
        audience: executive
      output:
        summary: "Database upgrade completed with 30% lower latency and 40% higher throughput."
        keyPoints:
          - "Upgraded to PostgreSQL 16"
          - "30% latency reduction"
          - "40% throughput increase"
        readingTimeMinutes: 1
  </examples>
</template>`,
  },
  {
    id: "catmood",
    name: "Cat Mood Decoder",
    path: "prompts/DecodeCatMood.tp",
    description:
      "Template featuring union types, custom prompts, and prompt parameters",
    content: `<template name="DecodeCatMood">
  <meta>
    model: gpt-4o
    temperature: 0.3
  </meta>

  <schema>
    interface Input {
      action: string;
      bowlStatus: "empty" | "half-empty" | "full";
      tailPosition: "twitching" | "upright" | "tucked";
    }

    interface Output {
      demand: "feed-me" | "kneel" | "chaos";
      urgency: "chill" | "crisis";
      humanAction: string;
    }
  </schema>

  <system>
    You are a feline behavioral psychology expert. Analyze the cat's physical cues and bowl status.
  </system>

  <user>
    Observed behavior:
    Action: <insert val="input.action" />
    Bowl: <insert val="input.bowlStatus" />
    Tail: <insert val="input.tailPosition" />
  </user>
</template>`,
  },
  {
    id: "triage",
    name: "Ticket Triage",
    path: "prompts/TriageTicket.tp",
    description: "Template with tools and structured classification",
    content: `<template name="TriageTicket">
  <meta>
    model: claude-3-5-sonnet
    temperature: 0.1
  </meta>

  <schema>
    interface Input {
      subject: string;
      description: string;
      customerTier: "free" | "pro" | "enterprise";
    }

    interface Output {
      category: "bug" | "billing" | "feature-request" | "security";
      priority: "p0" | "p1" | "p2" | "p3";
      suggestedAssigneeGroup: string;
      autoResponseSummary: string;
    }
  </schema>

  <system>
    You are a tier-1 support triage agent. Categorize incoming customer requests promptly.
  </system>

  <user>
    Ticket Subject: <insert val="input.subject" />
    Description: <insert val="input.description" />
    Customer Tier: <insert val="input.customerTier" />
  </user>
</template>`,
  },
  {
    id: "errors",
    name: "Template with Errors (Live Diagnostics Demo)",
    path: "prompts/BrokenExample.tp",
    description:
      "Demonstrates real-time error detection, red squiggles, and quick-fix suggestions",
    content: `<template name="BrokenExample">
  <schema>
    interface Input {
      title: string
      // Missing semicolon above and unrecognized type below:
      count: integer;
    }
    interface Output {
      result: string;
    }
  </schema>

  <system>
    <!-- Unknown element below: typeprompt will flag this error and offer suggestions -->
    <unrecognizedTag />
    <insert val="input.nonExistentField" />
  </system>

  <user>
    Input is: <insert val="input.title" />
  </user>
</template>`,
  },
  {
    id: "config",
    name: "TypePrompt Config (YAML)",
    path: "typeprompt.yaml",
    description:
      "YAML configuration file with schema-aware autocompletion and realtime validation",
    schemaType: CONFIG,
    content: `include:
  - prompts/*.tp

gen:
  typescript:
    file: src/generated/prompts.ts
`,
  },
  {
    id: "config-errors",
    name: "Config with Errors (YAML Diagnostics Demo)",
    path: "typeprompt.yaml",
    description:
      "Demonstrates real-time YAML error detection, unknown properties, and quick-fix suggestions",
    schemaType: CONFIG,
    content: `include:
  - prompts/*.tp

gen:
  typescript:
    file: src/generated/prompts.ts
    # Unknown generator property: triggers live red squiggles & quick-fix suggestions
    destination: dist/prompts.ts

# Unknown top-level property:
invalidProperty: true
`,
  },
];

@customElement("code-mirror-app")
export class App extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      background: #0d1117;
      color: #c9d1d9;
      font-family:
        -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
        sans-serif;
      overflow: hidden;
      box-sizing: border-box;
    }

    header {
      background: #161b22;
      border-bottom: 1px solid #30363d;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-shrink: 0;
    }

    .logo-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
    }

    .logo-title {
      font-size: 16px;
      font-weight: 700;
      color: #f0f6fc;
      margin: 0;
      letter-spacing: -0.2px;
    }

    .badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .badge-cm {
      background: rgba(88, 166, 255, 0.15);
      color: #58a6ff;
      border: 1px solid rgba(88, 166, 255, 0.3);
    }

    .badge-valid {
      background: rgba(46, 160, 67, 0.15);
      color: #3fb950;
      border: 1px solid rgba(46, 160, 67, 0.3);
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .badge-error {
      background: rgba(248, 81, 73, 0.15);
      color: #f85149;
      border: 1px solid rgba(248, 81, 73, 0.3);
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .controls-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    select,
    button {
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      outline: none;
      transition: all 0.15s ease;
    }

    select:hover,
    button:hover {
      background: #30363d;
      border-color: #8b949e;
    }

    .main-workspace {
      display: flex;
      flex: 1;
      min-height: 0;
      width: 100%;
    }

    .editor-pane {
      flex: 1;
      height: 100%;
      min-width: 0;
      display: flex;
      flex-direction: column;
      border-right: 1px solid #30363d;
    }

    .pane-header {
      background: #161b22;
      border-bottom: 1px solid #21262d;
      padding: 6px 16px;
      font-size: 12px;
      font-weight: 600;
      color: #8b949e;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .file-path {
      font-family: "JetBrains Mono", monospace;
      color: #79c0ff;
    }

    code-mirror-editor {
      flex: 1;
      min-height: 0;
      height: 100%;
    }

    .inspector-pane {
      width: 420px;
      flex-shrink: 0;
      background: #161b22;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .inspector-tabs {
      display: flex;
      border-bottom: 1px solid #30363d;
      background: #0d1117;
    }

    .tab-btn {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 500;
      color: #8b949e;
      cursor: pointer;
    }

    .tab-btn.active {
      color: #f0f6fc;
      border-bottom-color: #f78166;
      background: #161b22;
    }

    .inspector-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .card {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 14px;
    }

    .card-title {
      font-size: 12px;
      font-weight: 600;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 0;
      margin-bottom: 8px;
    }

    .diagnostic-item {
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: background 0.15s ease;
      font-size: 12.5px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .diagnostic-item.error {
      background: rgba(248, 81, 73, 0.1);
      border: 1px solid rgba(248, 81, 73, 0.3);
      color: #ff7b72;
    }

    .diagnostic-item.warning {
      background: rgba(210, 153, 34, 0.1);
      border: 1px solid rgba(210, 153, 34, 0.3);
      color: #d29922;
    }

    .diagnostic-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .diag-msg {
      font-weight: 500;
    }

    .diag-pos {
      font-family: monospace;
      font-size: 11px;
      opacity: 0.8;
    }

    .diag-suggestions {
      margin-top: 4px;
      font-size: 11px;
      color: #58a6ff;
    }

    .feature-list {
      list-style: none;
      padding: 0;
      margin: 0;
      font-size: 12.5px;
      line-height: 1.6;
    }

    .feature-list li {
      margin-bottom: 8px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .kbd {
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 11px;
      font-family: monospace;
      color: #f0f6fc;
    }

    pre {
      margin: 0;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      color: #79c0ff;
      white-space: pre-wrap;
      word-break: break-all;
    }
  `;

  @state()
  private selectedTemplateId = "summarize";

  @state()
  private darkMode = true;

  @state()
  private activeTab: "diagnostics" | "overview" | "features" = "overview";

  @state()
  private compilationResult: CompilationResult | null = null;

  @state()
  private yamlValidationResult: StrictJsonValue | InternalErrors | null = null;

  @state()
  private currentPath = "prompts/SummarizeDocument.tp";

  private get currentTemplate(): SampleTemplate {
    return (
      sampleTemplates.find((t) => t.id === this.selectedTemplateId) ??
      sampleTemplates[0]!
    );
  }

  private get isCurrentYaml(): boolean {
    return (
      Boolean(this.currentTemplate.schemaType) ||
      this.currentPath.endsWith(".yaml") ||
      this.currentPath.endsWith(".yml")
    );
  }

  private handleTemplateSelect(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedTemplateId = select.value;
    const template = this.currentTemplate;
    this.currentPath = template.path;

    if (template.schemaType) {
      this.yamlValidationResult = parseAndValidateYaml(
        template.content,
        template.path,
        template.schemaType,
      );
    } else {
      this.yamlValidationResult = null;
    }

    const editorEl = this.renderRoot.querySelector(
      "code-mirror-editor",
    ) as Editor | null;
    if (editorEl) {
      editorEl.setContent(
        template.content,
        template.path,
        undefined,
        template.schemaType ?? null,
      );
    }
  }

  private handleEditorChange(e: CustomEvent): void {
    const { compilationResult } = e.detail;
    this.compilationResult = compilationResult;
  }

  private handleYamlChange(e: CustomEvent): void {
    const { validationResult } = e.detail;
    this.yamlValidationResult = validationResult;
  }

  private jumpToSpan(start: number): void {
    const editorEl = this.renderRoot.querySelector(
      "code-mirror-editor",
    ) as Editor | null;
    if (editorEl) {
      editorEl.jumpToPosition(start);
    }
  }

  private toggleTheme(): void {
    this.darkMode = !this.darkMode;
  }

  override render(): TemplateResult {
    const template = this.currentTemplate;
    const isYaml = this.isCurrentYaml;

    const errors = this.compilationResult?.finalErrors[this.currentPath] ?? [];
    const warnings = this.compilationResult?.warnings[this.currentPath] ?? [];
    const hasErrors = errors.length > 0;
    const isValid = this.compilationResult && !hasErrors;

    const yamlErrors =
      this.yamlValidationResult &&
      "kind" in this.yamlValidationResult &&
      this.yamlValidationResult.kind === "error"
        ? this.yamlValidationResult.errors
        : [];
    const isYamlValid =
      this.yamlValidationResult !== null &&
      (!("kind" in this.yamlValidationResult) ||
        this.yamlValidationResult.kind !== "error");

    const templates = this.compilationResult
      ? Object.values(this.compilationResult.templates)
      : [];
    const primaryTemplate = templates[0];

    return html`
      <header>
        <div class="logo-group">
          <svg class="logo-icon" viewBox="301 300 423 423">
            <path
              fill="#6C0121"
              d="M368.279 332.144C373.786 331.366 402.359 331.935 479.75 331.989L598.968 331.995L632.743 331.895C639.59 331.857 648.114 331.585 654.838 332.133C661.606 332.744 668.122 334.999 673.818 338.705C697.328 353.846 692.478 378.905 692.58 402.915L692.574 501.07L692.51 604.302L692.481 635.496C692.476 640.371 692.671 648.855 692.222 653.512C691.513 660.539 689.136 667.295 685.289 673.217C678.533 683.531 669.037 688.753 657.194 691.15C651.848 691.731 644.507 691.534 639.014 691.535L611.216 691.545L518.484 691.54L419.106 691.569L388.692 691.611C382.901 691.621 375.027 691.826 369.403 691.288C362.266 690.627 355.416 688.149 349.507 684.092C332.227 672.229 331.935 656.184 331.955 637.414L331.985 610.526L331.996 513.43L331.881 415.806L331.851 386.137C331.851 382.778 331.967 379.259 331.888 375.915C331.356 353.423 345.375 335.896 368.279 332.144Z"
            />
            <path
              fill="#DABFDF"
              d="M369.183 343.597C380.729 342.731 415.011 343.432 503.62 343.45L600.968 343.397C617.906 343.386 634.872 343.178 651.819 343.651C664.005 343.649 677.164 352.196 679.763 364.589C681.736 373.997 681.022 388.461 681.084 398.442L681.044 474.153L681.074 591.087C681.051 610.39 681.119 629.692 680.863 648.993C680.651 664.957 671.73 675.626 656.494 679.443C650.767 680.496 629.371 680.042 622.618 680.033L554.772 680.011L432.25 680.024L393.135 680.05C386.294 680.053 377.517 680.3 370.831 679.875C366.122 679.597 361.569 678.091 357.623 675.507C349.885 670.549 343.747 661.917 343.529 652.592C343.295 642.611 343.399 632.492 343.392 622.5L343.425 546.628L343.414 431.35L343.3 394.159C343.263 382.761 341.442 367.084 347.833 357.536C353.026 349.778 360.111 345.387 369.183 343.597Z"
            />
            <path
              fill="#6C0121"
              d="M379.79 392.654C417.149 391.56 455.151 393.101 490.966 392.87C514.602 392.521 538.242 392.472 561.879 392.723C572.804 392.785 591.608 392.39 601.761 394.333C614.872 396.776 627.001 402.945 636.697 412.102C650.449 425.019 658.48 442.888 659.01 461.747C659.413 481.504 652.626 499.896 638.891 514.025C612.839 540.824 586.114 535.057 552.697 535.788L552.629 582.674C552.655 590.634 552.944 599.236 552.454 607.101C551.289 615.049 542.768 622.929 534.523 622.664C511.859 621.936 514.267 603.602 514.275 588.061L514.269 555.375L514.373 430.194C496.362 429.578 477.691 429.889 459.615 429.822C458.966 469.704 459.518 511.966 459.659 551.982L459.8 586.035C459.839 595.662 461.586 608.898 454.846 616.378C451.247 620.326 446.196 622.64 440.856 622.787C432.118 622.972 423.694 616.128 422.863 607.296C422.25 600.771 422.431 594.152 422.415 587.595L422.377 551.539L422.481 430.061C408.502 429.878 393.884 430.664 379.923 429.936C372.047 429.526 365.201 423.157 363.275 415.423C362.064 410.685 362.892 405.656 365.557 401.556C368.915 396.309 374.016 394.05 379.79 392.654Z"
            />
          </svg>
          <h1 class="logo-title">TypePrompt CodeMirror</h1>
          <span class="badge badge-cm">${isYaml ? "YAML" : "Extension"}</span>
        </div>

        <div class="controls-group">
          ${
            isYaml
              ? isYamlValid
                ? html`<span class="badge badge-valid">✓ Valid Config</span>`
                : yamlErrors.length > 0
                  ? html`<span class="badge badge-error"
                      >✕ ${yamlErrors.length}
                      Error${yamlErrors.length > 1 ? "s" : ""}</span
                    >`
                  : html`<span class="badge">Validating...</span>`
              : isValid
                ? html`<span class="badge badge-valid">✓ Valid Template</span>`
                : hasErrors
                  ? html`<span class="badge badge-error"
                      >✕ ${errors.length}
                      Error${errors.length > 1 ? "s" : ""}</span
                    >`
                  : html`<span class="badge">Compiling...</span>`
          }

          <select
            @change="${this.handleTemplateSelect}"
            aria-label="Select sample file"
          >
            <optgroup label="Prompt Templates (.tp)">
              ${sampleTemplates
                .filter((t) => !t.schemaType)
                .map(
                  (t) => html`
                    <option
                      value="${t.id}"
                      ?selected="${t.id === this.selectedTemplateId}"
                    >
                      ${t.name}
                    </option>
                  `,
                )}
            </optgroup>
            <optgroup label="YAML with Schema (.yaml)">
              ${sampleTemplates
                .filter((t) => Boolean(t.schemaType))
                .map(
                  (t) => html`
                    <option
                      value="${t.id}"
                      ?selected="${t.id === this.selectedTemplateId}"
                    >
                      ${t.name}
                    </option>
                  `,
                )}
            </optgroup>
          </select>

          <button @click="${this.toggleTheme}">
            ${this.darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </header>

      <div class="main-workspace">
        <div class="editor-pane">
          <div class="pane-header">
            <span>${isYaml ? "YAML Config Editor" : "Template Editor"}</span>
            <span class="file-path">${this.currentPath}</span>
          </div>

          <code-mirror-editor
            .content="${template.content}"
            .path="${template.path}"
            .darkMode="${this.darkMode}"
            .schemaType="${template.schemaType ?? null}"
            @typeprompt-change="${this.handleEditorChange}"
            @typeprompt-init="${this.handleEditorChange}"
            @yaml-change="${this.handleYamlChange}"
            @yaml-init="${this.handleYamlChange}"
          ></code-mirror-editor>
        </div>

        <div class="inspector-pane">
          <div class="inspector-tabs">
            <button
              class="tab-btn ${this.activeTab === "overview" ? "active" : ""}"
              @click="${() => (this.activeTab = "overview")}"
            >
              Overview
            </button>
            <button
              class="tab-btn ${this.activeTab === "diagnostics" ? "active" : ""}"
              @click="${() => (this.activeTab = "diagnostics")}"
            >
              Diagnostics
              (${isYaml ? yamlErrors.length : errors.length + warnings.length})
            </button>
            <button
              class="tab-btn ${this.activeTab === "features" ? "active" : ""}"
              @click="${() => (this.activeTab = "features")}"
            >
              Features
            </button>
          </div>

          <div class="inspector-content">
            ${(() => {
              if (isYaml) {
                if (this.activeTab === "overview") {
                  return html`
                    <div class="card">
                      <div class="card-title">YAML Configuration Info</div>
                      <div>
                        <strong>File:</strong> ${this.currentPath}<br />
                        <strong>Schema:</strong> TypePrompt Configuration
                        (<code>CONFIG</code>)<br />
                        <strong>Status:</strong>
                        ${isYamlValid ? "Valid ✓" : "Has Issues ✕"}
                      </div>
                    </div>

                    ${
                      isYamlValid
                        ? html`
                            <div class="card">
                              <div class="card-title">
                                Parsed YAML JSON Structure
                              </div>
                              <pre>
${JSON.stringify(this.yamlValidationResult, null, 2)}</pre>
                            </div>
                          `
                        : ""
                    }

                    <div class="card">
                      <div class="card-title">Quick Try-It Tips</div>
                      <ul class="feature-list">
                        <li>
                          <span>💡</span>
                          <span>
                            Press <span class="kbd">Ctrl</span>+<span
                              class="kbd"
                              >Space</span
                            >
                            on an empty line to see
                            <strong>schema-aware auto-completion</strong> fields
                            (e.g. <code>include</code>, <code>gen</code>,
                            <code>patch</code>).
                          </span>
                        </li>
                        <li>
                          <span>⚡</span>
                          <span>
                            Under <code>gen:</code>, indent and press
                            <span class="kbd">Ctrl</span>+<span class="kbd"
                              >Space</span
                            >
                            to see available generator targets
                            (<code>typescript</code>, <code>python</code>,
                            <code>rust</code>, etc.).
                          </span>
                        </li>
                        <li>
                          <span>🏷️</span>
                          <span>
                            Try introducing an unrecognized property or typo to
                            see
                            <strong>realtime red squiggles</strong> and
                            quick-fix suggestions!
                          </span>
                        </li>
                      </ul>
                    </div>
                  `;
                } else if (this.activeTab === "diagnostics") {
                  return html`
                    ${
                      yamlErrors.length === 0
                        ? html`
                            <div class="card">
                              <p style="color: #3fb950; margin: 0;">
                                ✓ No diagnostics found. YAML config matches
                                schema perfectly!
                              </p>
                            </div>
                          `
                        : ""
                    }
                    ${yamlErrors.map(
                      (err: InternalError) => html`
                        <div
                          class="diagnostic-item error"
                          @click="${() => this.jumpToSpan(err.span.start)}"
                          title="Click to jump to location"
                        >
                          <span class="diag-msg">✕ ${err.message}</span>
                          <span class="diag-pos">
                            Offset: ${err.span.start}..${err.span.end} (Click to
                            jump)
                          </span>
                          ${
                            err.suggestions && err.suggestions.length > 0
                              ? html`
                                  <span class="diag-suggestions">
                                    Suggestions: ${err.suggestions.join(", ")}
                                  </span>
                                `
                              : ""
                          }
                        </div>
                      `,
                    )}
                  `;
                } else {
                  return html`
                    <div class="card">
                      <div class="card-title">YAML CodeMirror Features</div>
                      <ul class="feature-list">
                        <li>
                          <span>🎨</span>
                          <div>
                            <strong>Lezer YAML Language Support</strong><br />
                            Full syntax highlighting, indentation, and folding
                            via CodeMirror's official
                            <code>@codemirror/lang-yaml</code>.
                          </div>
                        </li>
                        <li>
                          <span>⚡</span>
                          <div>
                            <strong>Realtime Schema Validation</strong><br />
                            Validates document structure against the TypePrompt
                            <code>SchemaType</code> on every keystroke with red
                            squiggles, error tooltips, and lint gutter.
                          </div>
                        </li>
                        <li>
                          <span>💡</span>
                          <div>
                            <strong>Schema-Aware Auto-Completion</strong><br />
                            Suggests valid root keys, nested fields, and
                            language generators from the schema. Press
                            <span class="kbd">Ctrl</span>+<span class="kbd"
                              >Space</span
                            >.
                          </div>
                        </li>
                        <li>
                          <span>🔧</span>
                          <div>
                            <strong>Quick-Fix Actions</strong><br />
                            Diagnostic tooltips offer one-click replacements for
                            misspelled or deprecated property names.
                          </div>
                        </li>
                      </ul>
                    </div>
                  `;
                }
              }
              const validTemplateEntity =
                primaryTemplate && "template" in primaryTemplate
                  ? primaryTemplate.template
                  : null;
              if (this.activeTab === "overview") {
                return html`
                  <div class="card">
                    <div class="card-title">Template Metadata</div>
                    <div>
                      <strong>Name:</strong>
                      ${validTemplateEntity?.name.text ?? "None"}<br />
                      <strong>Edition:</strong>
                      ${this.compilationResult?.edition ?? 0}<br />
                      <strong>Status:</strong>
                      ${isValid ? "Valid ✓" : "Has Issues ✕"}
                    </div>
                  </div>

                  ${(() => {
                    const meta =
                      validTemplateEntity?.contents.kind === "no-variants"
                        ? validTemplateEntity.contents.content.meta
                        : validTemplateEntity?.contents.defaultContent.meta;
                    if (!meta) return "";
                    return html`
                      <div class="card">
                        <div class="card-title">Model Settings</div>
                        <pre>${JSON.stringify(meta.value, null, 2)}</pre>
                      </div>
                    `;
                  })()}

                  <div class="card">
                    <div class="card-title">Quick Try-It Tips</div>
                    <ul class="feature-list">
                      <li>
                        <span>💡</span>
                        <span>
                          Type <strong>&lt;</strong> anywhere inside
                          &lt;system&gt; or &lt;user&gt; to see
                          <strong>auto-completion</strong> tags.
                        </span>
                      </li>
                      <li>
                        <span>🏷️</span>
                        <span>
                          Type a tag like <strong>&lt;val</strong> and close it
                          with <strong>&gt;</strong> to see
                          <strong>auto-close</strong> tags in action.
                        </span>
                      </li>
                      <li>
                        <span>⚡</span>
                        <span>
                          Try making a typo in a tag name or schema to see
                          <strong>live red squiggles</strong> with quick-fix
                          actions!
                        </span>
                      </li>
                    </ul>
                  </div>
                `;
              } else if (this.activeTab === "diagnostics") {
                return html`
                  ${
                    errors.length === 0 && warnings.length === 0
                      ? html`
                          <div class="card">
                            <p style="color: #3fb950; margin: 0;">
                              ✓ No diagnostics found. Template passes all static
                              checks!
                            </p>
                          </div>
                        `
                      : ""
                  }
                  ${errors.map(
                    (err) => html`
                      <div
                        class="diagnostic-item error"
                        @click="${() => this.jumpToSpan(err.span.start)}"
                        title="Click to jump to location"
                      >
                        <span class="diag-msg">✕ ${err.message}</span>
                        <span class="diag-pos">
                          Offset: ${err.span.start}..${err.span.end} (Click to
                          jump)
                        </span>
                        ${
                          err.suggestions && err.suggestions.length > 0
                            ? html`
                                <span class="diag-suggestions">
                                  Suggestions: ${err.suggestions.join(", ")}
                                </span>
                              `
                            : ""
                        }
                      </div>
                    `,
                  )}
                  ${warnings.map(
                    (warn) => html`
                      <div
                        class="diagnostic-item warning"
                        @click="${() => this.jumpToSpan(warn.span.start)}"
                        title="Click to jump to location"
                      >
                        <span class="diag-msg">⚠ ${warn.message}</span>
                        <span class="diag-pos">
                          Offset: ${warn.span.start}..${warn.span.end} (Click to
                          jump)
                        </span>
                      </div>
                    `,
                  )}
                `;
              } else {
                return html`
                  <div class="card">
                    <div class="card-title">CodeMirror Features</div>
                    <ul class="feature-list">
                      <li>
                        <span>🎨</span>
                        <div>
                          <strong>Syntactic Coloring</strong><br />
                          Semantic tokens via
                          <code>@typeprompt/core/lsp-util</code> highlight XML
                          tags, attributes, TypeScript schema keywords, strings,
                          booleans, and YAML metadata.
                        </div>
                      </li>
                      <li>
                        <span>⚡</span>
                        <div>
                          <strong>Automatic Validation</strong><br />
                          Static type-checker runs on every change using
                          <code>compile()</code> with red squiggles and hover
                          tooltips for errors.
                        </div>
                      </li>
                      <li>
                        <span>💡</span>
                        <div>
                          <strong>Auto-Completion</strong><br />
                          Context-aware completions for tags, attributes,
                          keywords via <code>getCompletionItems</code>. Press
                          <span class="kbd">Ctrl</span>+<span class="kbd"
                            >Space</span
                          >
                          to trigger.
                        </div>
                      </li>
                      <li>
                        <span>🏷️</span>
                        <div>
                          <strong>XML Auto-Closing Tags</strong><br />
                          Typing <code>&gt;</code> automatically computes and
                          inserts the matching closing tag.
                        </div>
                      </li>
                      <li>
                        <span>🏎️</span>
                        <div>
                          <strong>Immutability Caching</strong><br />
                          Leverages <code>CompilationResult</code> immutability
                          in CodeMirror's <code>StateField</code>: non-doc
                          transactions skip recomputation entirely; edits pass
                          previous result as cache for fast incremental
                          compilation.
                        </div>
                      </li>
                    </ul>
                  </div>
                `;
              }
            })()}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "code-mirror-app": App;
  }
}
