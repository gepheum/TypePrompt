<script setup lang="ts">
import { ref } from 'vue'
import { VPButton } from 'vitepress/theme'

const copied = ref(false)
const command = 'npx typeprompt init'

function copy() {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(command)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}
</script>

<template>
  <div class="actions">
    <div class="action">
      <VPButton
        tag="a"
        size="medium"
        theme="brand"
        text="Get started"
        href="/guide/#getting-started"
      />
    </div>

    <div class="action">
      <VPButton
        tag="a"
        size="medium"
        theme="alt"
        text="GitHub"
        href="https://github.com/gepheum/typeprompt"
        target="_blank"
        rel="noreferrer"
      />
    </div>

    <div class="action">
      <div
        class="hero-quickstart-pill"
        role="button"
        tabindex="0"
        aria-label="Copy npx typeprompt init to clipboard"
        @click="copy"
        @keydown.enter.prevent="copy"
        @keydown.space.prevent="copy"
      >
        <span class="hero-quickstart-prefix">$</span>
        <span class="hero-quickstart-cmd">{{ command }}</span>
        <span class="hero-quickstart-icon" :class="{ copied }">
          <svg
            v-if="!copied"
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
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span v-else class="copied-badge">
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
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span class="copied-text">Copied!</span>
          </span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  margin: -6px;
  padding-top: 24px;
}

@media (min-width: 640px) {
  .actions {
    padding-top: 32px;
  }
}

@media (max-width: 959px) {
  .actions {
    justify-content: center;
  }
}

@media (min-width: 960px) {
  .actions {
    justify-content: flex-start;
  }
}

.action {
  flex-shrink: 0;
  padding: 6px;
}

.hero-quickstart-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  box-sizing: border-box;
  background-color: var(--vp-button-alt-bg);
  border: 1px solid var(--vp-button-alt-border);
  border-radius: 20px;
  padding: 0 16px;
  font-family: var(--vp-font-family-mono);
  font-size: 13.5px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.25s, background-color 0.25s, color 0.25s;
}

.hero-quickstart-pill:hover {
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-button-alt-hover-bg);
}

.hero-quickstart-prefix {
  color: var(--vp-c-text-3);
  font-weight: 500;
}

.hero-quickstart-cmd {
  color: var(--vp-c-text-1);
  font-weight: 500;
}

.hero-quickstart-icon {
  display: inline-flex;
  align-items: center;
  margin-left: 2px;
  color: var(--vp-c-text-3);
  transition: color 0.15s;
}

.hero-quickstart-pill:hover .hero-quickstart-icon {
  color: var(--vp-c-brand-1);
}

.hero-quickstart-icon.copied {
  color: var(--vp-c-brand-1);
}

.copied-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.copied-text {
  font-size: 11.5px;
  font-family: var(--vp-font-family-base);
  font-weight: 600;
}
</style>
