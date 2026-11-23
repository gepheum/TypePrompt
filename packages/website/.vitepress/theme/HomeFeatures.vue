<script setup lang="ts">
import { useData } from "vitepress";
import VPFeatures from "vitepress/dist/client/theme-default/components/VPFeatures.vue";

const { frontmatter } = useData();
</script>

<template>
  <div v-if="frontmatter.features" class="home-features-inline vp-raw">
    <VPFeatures :features="frontmatter.features" />
  </div>
</template>

<style scoped>
.home-features-inline {
  margin: 1.25rem 0 3rem;
}

.home-features-inline :deep(.VPFeatures) {
  padding: 0;
}

.home-features-inline :deep(.VPFeature .title) {
  margin: 0;
  padding: 0;
  border-top: none;
  font-size: 16px;
  line-height: 24px;
  letter-spacing: normal;
}

.home-features-inline :deep(.VPFeature .details) {
  margin: 0;
  padding-top: 8px;
}
</style>
