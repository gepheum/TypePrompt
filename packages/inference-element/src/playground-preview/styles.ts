import { css } from "lit";

export const playgroundPreviewStyles = css`
  .container {
    max-width: 900px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    position: relative;
  }

  .preview-header {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1.25rem;
  }

  .title-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
    flex: 1 1 auto;
  }

  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    word-break: break-word;
  }

  .subtitle {
    font-size: 0.78rem;
    color: var(--text-soft);
  }

  .header-actions {
    display: flex;
    align-items: center;
    margin-top: 0.25rem;
  }

  .no-api-keys-banner {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    background: rgba(234, 179, 8, 0.1);
    border: 1px solid var(--pending-border);
    border-radius: 8px;
    padding: 0.55rem 0.85rem;
    margin-top: 0.25rem;
    max-width: 100%;
    box-sizing: border-box;
  }

  .no-api-keys-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .no-api-keys-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.84rem;
    min-width: 0;
  }

  .no-api-keys-text {
    color: var(--text);
  }

  .create-secrets-link {
    color: var(--border-focus);
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }

  .create-secrets-link:hover {
    text-decoration: underline;
  }

  .run-inference-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--button-bg);
    color: var(--button-fg);
    border: none;
    border-radius: 6px;
    padding: 0.42rem 0.95rem;
    font-size: 0.84rem;
    font-weight: 600;
    line-height: 1.25;
    font-family: inherit;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: background 0.15s ease;
  }

  .run-inference-button:hover {
    background: var(--button-hover);
  }

  .run-icon {
    font-size: 0.72rem;
  }

  .model-yaml-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.45rem 0.75rem;
    width: 240px;
    max-height: 5.5rem;
    overflow: auto;
    scrollbar-width: thin;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .model-yaml-card tp-code {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    font-size: 0.74rem;
    line-height: 1.35;
  }

  .model-yaml-body {
    font-size: 0.74rem;
    line-height: 1.35;
    margin: 0;
    font-family: var(--font-mono);
  }

  .sticky-header {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg);
    padding: 1rem 1.25rem 0.85rem;
    margin: -1rem -1.25rem 0;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .sample-picker-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-subtle);
  }

  .sample-picker-label {
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .sample-segmented-control {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    max-width: 100%;
  }

  .sample-segment-btn {
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text-muted);
    font-size: 0.82rem;
    font-weight: 500;
    line-height: 1.25;
    font-family: inherit;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    box-sizing: border-box;
    vertical-align: middle;
    transition:
      background 0.1s ease,
      border-color 0.1s ease,
      color 0.1s ease;
  }

  .sample-segment-btn:hover {
    color: var(--text);
    background: var(--bg-surface-elevated);
    border-color: var(--border-focus);
  }

  .sample-segment-btn.active {
    background: var(--bg-surface-elevated);
    color: var(--text);
    border-color: var(--border-focus);
    font-weight: 500;
  }

  .sample-select {
    width: auto;
    max-width: 100%;
    background: var(--dropdown-bg);
    color: var(--dropdown-fg);
    border: 1px solid var(--dropdown-border);
    border-radius: 6px;
    padding: 0.45rem 0.75rem;
    font-size: 0.84rem;
    font-family: inherit;
    outline: none;
    cursor: pointer;
  }

  .sample-select:focus {
    border-color: var(--border-focus);
  }

  .sample-discussion-view {
    background: var(--bg);
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

  .empty-discussion {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--text-muted);
    font-size: 0.85rem;
    background: var(--bg-surface);
    border: 1px dashed var(--border);
    border-radius: 6px;
  }

  .compilation-error-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(11, 15, 25, 0.45);
    z-index: 99999;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 1.5rem;
    pointer-events: none;
  }

  .error-banner {
    pointer-events: auto;
    background: var(--error-bg);
    border: 1px solid var(--error-border);
    color: var(--error-text);
    border-radius: 8px;
    padding: 0.65rem 1.25rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.88rem;
    font-weight: 600;
  }
`;
