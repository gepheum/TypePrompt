<script setup lang="ts">
</script>

<template>
  <div class="vscode-showcase">
    <div class="vscode-image-wrapper">
      <img
        src="/vscode-demo.png"
        alt="TypePrompt interactive prompt playground in Visual Studio Code"
        class="vscode-image"
        loading="lazy"
        width="2962"
        height="1780"
      />
    </div>

    <!-- Footer / Install Link -->
    <div class="vscode-footer">
      <a
        href="https://marketplace.visualstudio.com/items?itemName=gepheum.typeprompt-vscode"
        target="_blank"
        rel="noreferrer"
        class="vscode-marketplace-btn"
      >
        <span>Install for VS Code</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    </div>
  </div>
</template>

<style scoped>
.vscode-showcase {
  margin: 1.5rem 0 3rem;
}

.vscode-image-wrapper {
  display: flex;
  justify-content: center;
}

.vscode-image {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
}

/* Footer / Marketplace Button */
.vscode-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1rem;
}

.vscode-marketplace-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  height: 40px;
  line-height: 38px;
  border-radius: 20px;
  border: 1px solid var(--vp-button-alt-border);
  background-color: var(--vp-button-alt-bg);
  color: var(--vp-button-alt-text);
  font-size: 13.5px;
  font-weight: 500;
  text-decoration: none !important;
  transition: border-color 0.25s, background-color 0.25s, color 0.25s;
}

.vscode-marketplace-btn:hover {
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-button-alt-hover-bg);
  color: var(--vp-c-brand-1);
}
</style>
