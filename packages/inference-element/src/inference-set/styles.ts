import { css } from "lit";

export const inferenceSetStyles = css`
  .container {
    max-width: 900px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 1.25rem;
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .title-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge-tag {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--bg-surface-elevated);
    border: 1px solid var(--border);
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    color: var(--text-muted);
  }

  .timestamp {
    font-size: 0.78rem;
    color: var(--text-soft);
    font-family: var(--font-mono);
  }

  .model-yaml-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    max-width: 320px;
  }

  .model-yaml-body {
    font-size: 0.74rem;
    line-height: 1.35;
    margin: 0;
    font-family: var(--font-mono);
  }

  .samples-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    padding: 0.55rem 0.85rem;
    border-radius: 6px;
  }

  .samples-count {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .toolbar-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-action {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.75rem;
    padding: 0.25rem 0.55rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-action:hover {
    background: var(--bg-surface-elevated);
    color: var(--text);
  }

  .inferences-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .inference-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }

  .card-header-bar {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    color: inherit;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    gap: 1rem;
  }

  .card-header-bar:hover {
    background: var(--bg-surface-elevated);
  }

  .card-title-group {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  .toggle-arrow {
    font-size: 0.65rem;
    color: var(--text-soft);
    transition: transform 0.18s ease;
    display: inline-block;
  }

  .inference-card.is-expanded .toggle-arrow {
    transform: rotate(90deg);
  }

  .sample-index {
    font-size: 0.78rem;
    font-family: var(--font-mono);
    color: var(--text-soft);
  }

  .sample-name {
    font-weight: 600;
    font-size: 0.88rem;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
    border: 1px solid;
    text-transform: capitalize;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .status-badge.success {
    background: var(--success-bg);
    border-color: var(--success-border);
    color: var(--success-text);
  }

  .status-badge.pending {
    background: var(--pending-bg);
    border-color: var(--pending-border);
    color: var(--pending-text);
  }

  .status-badge.error {
    background: var(--error-bg);
    border-color: var(--error-border);
    color: var(--error-text);
  }

  .telemetry-strip {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    font-size: 0.76rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .telemetry-item {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .telemetry-label {
    color: var(--text-soft);
    font-size: 0.68rem;
    text-transform: uppercase;
  }

  .card-body {
    display: none;
    padding: 1rem;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg);
  }

  .inference-card.is-expanded .card-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .request-details {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    overflow: hidden;
  }

  .request-summary {
    padding: 0.55rem 0.85rem;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
    user-select: none;
  }

  .request-summary:hover {
    background: var(--bg-surface-elevated);
  }

  .details-body {
    padding: 0.85rem;
    border-top: 1px solid var(--border-subtle);
  }

  .reasoning-box {
    background: var(--bg-surface);
    border-left: 3px solid var(--border-focus);
    padding: 0.75rem 1rem;
    border-radius: 0 6px 6px 0;
    font-size: 0.82rem;
    color: var(--text-muted);
    font-style: italic;
    white-space: pre-wrap;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .reasoning-box em {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--border-focus);
    font-style: normal;
    font-weight: 700;
  }

  .section-block {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .section-title.result {
    color: var(--border-focus);
  }

  .output-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .output-card.error {
    border-color: var(--error-border);
    background: rgba(239, 68, 68, 0.05);
  }

  .output-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0.75rem;
    background: var(--bg-surface-elevated);
    border-bottom: 1px solid var(--border);
  }

  .output-tabs {
    display: flex;
    gap: 0.25rem;
  }

  .output-tab-btn {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    font-size: 0.74rem;
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }

  .output-tab-btn.is-active {
    background: var(--bg);
    border-color: var(--border);
    color: var(--text);
  }

  .btn-copy {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.72rem;
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-copy:hover {
    background: var(--bg-surface);
    color: var(--text);
  }

  .btn-copy.copied {
    background: var(--success-bg);
    border-color: var(--success-border);
    color: var(--success-text);
  }

  .output-code-view {
    border: none;
    border-radius: 0;
    margin: 0;
  }

  .pending-output {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 1rem;
    color: var(--pending-text);
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--pending-bg);
    border: 1px dashed var(--pending-border);
    border-radius: 6px;
  }

  .pending-spinner {
    animation: spin 2s linear infinite;
    display: inline-block;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .source-files-section {
    border-top: 1px solid var(--border);
    padding-top: 1.5rem;
    margin-top: 1rem;
  }

  .source-files-section summary {
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-muted);
    user-select: none;
  }

  .source-file-item {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .source-file-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    user-select: none;
  }

  .source-file-item[open] .source-file-header {
    border-bottom: 1px solid var(--border);
  }

  .source-file-item:not([open]) .btn-copy {
    display: none;
  }

  footer {
    text-align: center;
    font-size: 0.75rem;
    color: var(--text-soft);
    padding-top: 2rem;
    border-top: 1px solid var(--border-subtle);
  }

  footer a {
    color: var(--text-muted);
    text-decoration: none;
  }

  footer a:hover {
    text-decoration: underline;
  }

  .empty-state {
    text-align: center;
    padding: 3rem 1.5rem;
    color: var(--text-muted);
    font-size: 0.9rem;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
`;
