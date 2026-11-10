import { css } from "lit";

export const commonStyles = css`
  :host {
    --font-sans: var(
      --tp-font-family,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      Helvetica,
      Arial,
      sans-serif
    );
    --font-mono: var(
      --tp-font-mono,
      "SF Mono",
      Monaco,
      "Cascadia Code",
      "Liberation Mono",
      Menlo,
      Courier,
      monospace
    );
    --font-size: var(--tp-font-size, 13px);

    --bg: var(--tp-bg, #0b0f19);
    --bg-surface: var(--tp-bg-surface, #111827);
    --bg-surface-elevated: var(--tp-bg-surface-elevated, #1a2234);
    --bg-inset: var(--tp-bg-inset, #070a12);

    --border: var(--tp-border, #1f293d);
    --border-subtle: var(--tp-border-subtle, #162032);
    --border-focus: var(--tp-border-focus, #38bdf8);

    --text: var(--tp-text, #f1f5f9);
    --text-muted: var(--tp-text-muted, #94a3b8);
    --text-soft: var(--tp-text-soft, #64748b);

    --button-bg: var(--tp-button-bg, #0284c7);
    --button-fg: var(--tp-button-fg, #ffffff);
    --button-hover: var(--tp-button-hover, #0369a1);

    --dropdown-bg: var(--tp-dropdown-bg, var(--bg-inset));
    --dropdown-fg: var(--tp-dropdown-fg, var(--text));
    --dropdown-border: var(--tp-dropdown-border, var(--border));

    --success-bg: var(--tp-success-bg, rgba(34, 197, 94, 0.15));
    --success-border: var(--tp-success-border, rgba(34, 197, 94, 0.4));
    --success-text: var(--tp-success-text, #4ade80);

    --pending-bg: var(--tp-pending-bg, rgba(234, 179, 8, 0.15));
    --pending-border: var(--tp-pending-border, rgba(234, 179, 8, 0.4));
    --pending-text: var(--tp-pending-text, #facc15);

    --error-bg: var(--tp-error-bg, rgba(239, 68, 68, 0.15));
    --error-border: var(--tp-error-border, rgba(239, 68, 68, 0.4));
    --error-text: var(--tp-error-text, #f87171);

    --section-request-bg: var(--tp-section-request-bg, var(--bg-inset));
    --section-request-header: var(
      --tp-section-request-header,
      var(--bg-surface-elevated)
    );
    --section-request-border: var(--tp-section-request-border, var(--border));
    --section-request-label: var(--tp-section-request-label, var(--text-muted));

    --user-bg: var(--tp-user-bg, color-mix(in srgb, var(--text) 5%, var(--bg)));
    --user-border: var(
      --tp-user-border,
      color-mix(in srgb, var(--text) 14%, var(--border))
    );
    --user-label: var(--tp-user-label, var(--text-muted));

    --assistant-bg: var(
      --tp-assistant-bg,
      color-mix(in srgb, var(--border-focus) 8%, var(--bg))
    );
    --assistant-border: var(
      --tp-assistant-border,
      color-mix(in srgb, var(--border-focus) 28%, var(--border))
    );
    --assistant-label: var(--tp-assistant-label, var(--border-focus));

    --tool-bg: var(--tp-tool-bg, color-mix(in srgb, #a855f7 9%, var(--bg)));
    --tool-border: var(
      --tp-tool-border,
      color-mix(in srgb, #a855f7 28%, var(--border))
    );
    --tool-label: var(--tp-tool-label, #c084fc);

    --message-margin: var(--tp-message-margin, 2.5rem);

    --hl-key: var(--tp-hl-key, #7dd3fc);
    --hl-string: var(--tp-hl-string, #a7f3d0);
    --hl-number: var(--tp-hl-number, #fde047);
    --hl-boolean: var(--tp-hl-boolean, #f472b6);
    --hl-comment: var(--tp-hl-comment, var(--text-soft));
    --hl-xml-tag: var(--tp-hl-xml-tag, var(--border-focus));
    --hl-xml-attribute: var(--tp-hl-xml-attribute, #c084fc);
    --hl-schema-keyword: var(--tp-hl-schema-keyword, #f472b6);

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

  .tool-badge.success {
    background: var(--success-bg, rgba(34, 197, 94, 0.15));
    border-color: var(--success-border, rgba(34, 197, 94, 0.4));
    color: var(--success-text, #4ade80);
  }

  .tools-section {
    display: flex;
    flex-direction: column;
  }

  .tools-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tool-card {
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.65rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-family: var(--font-mono);
    margin-right: var(--message-margin, 2.5rem);
    margin-left: 0;
  }

  .tool-card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tool-icon {
    font-size: 0.72rem;
    opacity: 0.8;
  }

  .tool-card-description {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--text-muted);
    white-space: pre-wrap;
    word-break: break-word;
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

  @media (max-width: 480px) {
    :host {
      --message-margin: 1.25rem;
    }
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

  .chat-bubble-wrap.role-user,
  .chat-bubble-wrap.role-tool {
    margin-right: var(--message-margin, 2.5rem);
    margin-left: 0;
  }

  .chat-bubble-wrap.role-assistant {
    margin-left: var(--message-margin, 2.5rem);
    margin-right: 0;
  }

  .system-message-wrap {
    margin-right: var(--message-margin, 2.5rem);
    margin-left: 0;
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

  .chat-bubble-body tp-code {
    background: transparent;
    border: none;
    padding: 0;
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
  .role-tool .chat-bubble-header {
    color: var(--tool-label);
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
