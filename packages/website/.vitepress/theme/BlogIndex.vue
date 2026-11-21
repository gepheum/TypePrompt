<script setup lang="ts">
import { data as posts } from "./posts.data";
</script>

<template>
  <div class="blog-list">
    <article v-for="post of posts" :key="post.url" class="blog-card">
      <div class="blog-meta">
        <time :datetime="new Date(post.date.time).toISOString().slice(0, 10)">
          {{ post.date.string }}
        </time>
        <span v-if="post.author" class="blog-author">· {{ post.author }}</span>
      </div>
      <h2 class="blog-title">
        <a :href="post.url">{{ post.title }}</a>
      </h2>
      <p v-if="post.description" class="blog-desc">
        {{ post.description }}
      </p>
      <a :href="post.url" class="blog-read-more">Read post →</a>
    </article>
  </div>
</template>

<style scoped>
.blog-list {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.blog-card {
  padding: 1.5rem 0;
  border-top: 1px solid var(--vp-c-divider);
}

.blog-card:first-child {
  border-top: none;
  padding-top: 0;
}

.blog-meta {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.4rem;
}

.blog-author {
  margin-left: 0.35rem;
}

.blog-title {
  margin: 0 0 0.5rem !important;
  padding: 0 !important;
  border: none !important;
  font-size: 1.4rem;
  line-height: 1.35;
}

.blog-title a {
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: color 0.2s;
}

.blog-title a:hover {
  color: var(--vp-c-brand-1);
}

.blog-desc {
  margin: 0 0 0.75rem;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}

.blog-read-more {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.blog-read-more:hover {
  text-decoration: underline;
}
</style>
