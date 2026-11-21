<script setup lang="ts">
import { data as posts } from "./posts.data";
</script>

<template>
  <div class="blog-list">
    <a
      v-for="post of posts"
      :key="post.url"
      :href="post.url"
      class="blog-card"
    >
      <div class="blog-meta">
        <time :datetime="new Date(post.date.time).toISOString().slice(0, 10)">
          {{ post.date.string }}
        </time>
        <span v-if="post.author" class="blog-author">· {{ post.author }}</span>
      </div>
      <h2 class="blog-title">{{ post.title }}</h2>
      <p v-if="post.description" class="blog-desc">
        {{ post.description }}
      </p>
      <span class="blog-read-more">
        Read post <span class="arrow">→</span>
      </span>
    </a>
  </div>
</template>

<style scoped>
.blog-list {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.blog-card {
  display: block;
  padding: 1.5rem 1.75rem;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  background-color: var(--vp-c-bg-soft);
  text-decoration: none !important;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.blog-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}

.dark .blog-card:hover {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
}

.blog-meta {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.5rem;
}

.blog-author {
  margin-left: 0.35rem;
}

.blog-title {
  margin: 0 0 0.5rem !important;
  padding: 0 !important;
  border: none !important;
  font-size: 1.35rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--vp-c-text-1);
  transition: color 0.2s ease;
}

.blog-card:hover .blog-title {
  color: var(--vp-c-brand-1);
}

.blog-desc {
  margin: 0 0 1rem !important;
  color: var(--vp-c-text-2);
  line-height: 1.6;
  font-size: 0.95rem;
}

.blog-read-more {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}

.blog-read-more .arrow {
  display: inline-block;
  transition: transform 0.2s ease;
}

.blog-card:hover .blog-read-more .arrow {
  transform: translateX(3px);
}
</style>
