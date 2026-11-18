<script setup lang="ts">
import { VPButton } from 'vitepress/theme'
import QuickstartPill from './QuickstartPill.vue'
</script>

<template>
  <div class="actions">
    <div class="action">
      <VPButton
        tag="a"
        size="medium"
        theme="brand"
        text="Get started"
        href="/quick-start"
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
      <QuickstartPill />
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
</style>
