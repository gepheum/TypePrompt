import { css } from "lit";

export const commonStyles = css`
  :host {
    --font-sans: var(
      --vscode-font-family,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      Helvetica,
      Arial,
      sans-serif
    );
    --font-mono: var(
      --vscode-editor-font-family,
      "SF Mono",
      Monaco,
      "Cascadia Code",
      "Liberation Mono",
      Menlo,
      Courier,
      monospace
    );
    --font-size: var(--vscode-font-size, 13px);

    --bg: var(--vscode-editor-background, #0b0f19);
    --bg-surface: var(
      --vscode-sideBar-background,
      var(--vscode-editorWidget-background, #111827)
    );
    --bg-surface-elevated: var(
      --vscode-list-hoverBackground,
      var(--vscode-toolbar-hoverBackground, #1a2234)
    );
    --bg-inset: var(
      --vscode-textCodeBlock-background,
      var(--vscode-editor-background, #070a12)
    );

    --border: var(
      --vscode-panel-border,
      var(--vscode-widget-border, var(--vscode-editorWidget-border, #1f293d))
    );
    --border-subtle: var(
      --vscode-tree-tableColumnsBorder,
      var(--vscode-editorGroup-border, #162032)
    );
    --border-focus: var(--vscode-focusBorder, #38bdf8);

    --text: var(--vscode-editor-foreground, var(--vscode-foreground, #f1f5f9));
    --text-muted: var(--vscode-descriptionForeground, #94a3b8);
    --text-soft: var(--vscode-disabledForeground, #64748b);

    --button-bg: var(--vscode-button-background, #0284c7);
    --button-fg: var(--vscode-button-foreground, #ffffff);
    --button-hover: var(--vscode-button-hoverBackground, #0369a1);

    --dropdown-bg: var(
      --vscode-dropdown-background,
      var(--vscode-input-background, var(--bg-inset))
    );
    --dropdown-fg: var(
      --vscode-dropdown-foreground,
      var(--vscode-input-foreground, var(--text))
    );
    --dropdown-border: var(
      --vscode-dropdown-border,
      var(--vscode-input-border, var(--border))
    );

    --success-bg: rgba(34, 197, 94, 0.15);
    --success-border: rgba(34, 197, 94, 0.4);
    --success-text: #4ade80;

    --pending-bg: rgba(234, 179, 8, 0.15);
    --pending-border: rgba(234, 179, 8, 0.4);
    --pending-text: #facc15;

    --error-bg: rgba(239, 68, 68, 0.15);
    --error-border: rgba(239, 68, 68, 0.4);
    --error-text: #f87171;

    --section-request: #121828;
    --section-request-bg: var(--bg-inset);
    --section-request-header: var(--bg-surface-elevated);
    --section-request-border: var(--border);
    --section-request-label: var(--text-muted);

    --user-bg: #1e293b;
    --user-border: #334155;
    --user-label: var(--text-muted);

    --assistant-bg: #0f2c42;
    --assistant-border: #164e63;
    --assistant-label: #38bdf8;

    --tool-bg: #281a3d;
    --tool-border: #4c1d95;
    --tool-label: #c084fc;

    --hl-key: #7dd3fc;
    --hl-string: #a7f3d0;
    --hl-number: #fde047;
    --hl-boolean: #f472b6;
    --hl-comment: var(--text-soft);
    --hl-xml-tag: #38bdf8;
    --hl-xml-attribute: #c084fc;
    --hl-schema-keyword: #f472b6;

    display: block;
    font-family: var(--font-sans);
    font-size: var(--font-size);
    color: var(--text);
    background: var(--bg);
    box-sizing: border-box;
  }

  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }

  .hl-key {
    color: var(--hl-key);
  }
  .hl-string {
    color: var(--hl-string);
  }
  .hl-number {
    color: var(--hl-number);
  }
  .hl-boolean {
    color: var(--hl-boolean);
  }
  .hl-comment {
    color: var(--hl-comment);
    font-style: italic;
  }
  .hl-xml-tag {
    color: var(--hl-xml-tag);
    font-weight: 600;
  }
  .hl-xml-attribute {
    color: var(--hl-xml-attribute);
  }
  .hl-schema-keyword {
    color: var(--hl-schema-keyword);
    font-weight: 600;
  }

  pre {
    margin: 0;
    font-family: var(--font-mono);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .code-view {
    padding: 0.85rem 1rem;
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: var(--font-mono);
    font-size: 0.84rem;
    line-height: 1.5;
    overflow-x: auto;
  }

  .tool-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--tool-bg);
    border: 1px solid var(--tool-border);
    color: var(--tool-label);
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
    font-size: 0.76rem;
    font-family: var(--font-mono);
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-title.request {
    color: var(--section-request-label);
  }

  .chat-stream {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .chat-bubble-wrap {
    display: flex;
    flex-direction: column;
  }

  .chat-bubble {
    border-radius: 6px;
    padding: 0.75rem 0.95rem;
    font-size: 0.84rem;
    border: 1px solid;
  }

  .chat-bubble-header {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.4rem;
  }

  .chat-bubble-body pre {
    font-family: var(--font-mono);
    font-size: 0.84rem;
  }

  .role-user .chat-bubble {
    background: var(--user-bg);
    border-color: var(--user-border);
  }
  .role-user .chat-bubble-header {
    color: var(--user-label);
  }

  .role-assistant .chat-bubble {
    background: var(--assistant-bg);
    border-color: var(--assistant-border);
  }
  .role-assistant .chat-bubble-header {
    color: var(--assistant-label);
  }

  .role-tool .chat-bubble {
    background: var(--bg-inset);
    border-color: var(--border);
  }

  .sample-note-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 0.65rem 0.9rem;
    margin-bottom: 0.85rem;
  }

  .sample-note-header {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.04em;
    margin-bottom: 0.25rem;
  }

  .sample-note-body {
    font-size: 0.82rem;
    color: var(--text);
  }
`;
