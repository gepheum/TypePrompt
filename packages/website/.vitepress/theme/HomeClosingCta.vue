<script setup lang="ts">
import { VPButton } from 'vitepress/theme'
import QuickstartPill from './QuickstartPill.vue'
</script>

<template>
  <section class="closing-cta">
    <div class="closing-title">Ready to try it?</div>
    <div class="closing-text">
      Add type-safe prompts to your project with a single command.
    </div>
    <div class="closing-actions">
      <VPButton
        tag="a"
        size="medium"
        theme="brand"
        text="Get started"
        href="/quick-start"
      />
      <QuickstartPill />
    </div>
  </section>
</template>

<style scoped>
.closing-cta {
  margin-top: 2rem;
  padding: 3rem 1.5rem 0;
  border-top: 1px solid var(--vp-c-divider);
  text-align: center;
}

.closing-title {
  font-size: 28px;
  line-height: 36px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
}

.closing-text {
  margin-top: 0.75rem;
  font-size: 16px;
  line-height: 24px;
  color: var(--vp-c-text-2);
}

.closing-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 1.75rem;
}

/* On narrow screens, stack the button and pill at the same width. */
@media (max-width: 639px) {
  .closing-cta {
    margin-top: 1rem;
    padding-top: 2.5rem;
  }

  .closing-title {
    font-size: 24px;
    line-height: 32px;
  }

  .closing-actions {
    flex-direction: column;
    align-items: stretch;
    max-width: 260px;
    margin-left: auto;
    margin-right: auto;
  }

  .closing-actions > * {
    justify-content: center;
  }
}

/* Inside page content (.vp-doc), links are underlined by default. */
.closing-actions :deep(.VPButton) {
  text-decoration: none;
}
</style>
