<script setup lang="ts">
import { computed } from "vue";
import { useData } from "vitepress";

const { page, frontmatter } = useData();

const isBlogPost = computed(
  () =>
    page.value.relativePath.startsWith("blog/") &&
    page.value.relativePath !== "blog/index.md",
);

const formattedDate = computed(() => {
  const raw = frontmatter.value.date;
  if (!raw) return null;
  const date =
    raw instanceof Date
      ? raw
      : new Date(String(raw).includes("T") ? raw : `${raw}T12:00:00Z`);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
});
</script>

<template>
  <div v-if="isBlogPost" class="blog-post-header">
    <a href="/blog/" class="blog-back-link">← Back to blog</a>
    <div v-if="formattedDate || frontmatter.author" class="blog-post-meta">
      <time v-if="formattedDate">{{ formattedDate }}</time>
      <span v-if="formattedDate && frontmatter.author"> · </span>
      <span v-if="frontmatter.author">{{ frontmatter.author }}</span>
    </div>
  </div>
</template>

<style scoped>
.blog-post-header {
  margin-bottom: 1.25rem;
}

.blog-back-link {
  display: inline-block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  text-decoration: none;
  margin-bottom: 0.75rem;
  transition: color 0.2s;
}

.blog-back-link:hover {
  color: var(--vp-c-brand-1);
}

.blog-post-meta {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}
</style>
