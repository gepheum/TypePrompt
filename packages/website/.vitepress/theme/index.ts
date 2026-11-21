import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import type { EnhanceAppContext } from "vitepress";
import BlogIndex from "./BlogIndex.vue";
import BlogPostHeader from "./BlogPostHeader.vue";
import HeroQuickstart from "./HeroQuickstart.vue";
import HeroTilly from "./HeroTilly.vue";
import HomeClosingCta from "./HomeClosingCta.vue";
import VSCodeShowcase from "./VSCodeShowcase.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      "home-hero-actions-after": () => h(HeroQuickstart),
      "home-hero-image": () => h(HeroTilly),
      "doc-before": () => h(BlogPostHeader),
    });
  },
  enhanceApp({ app }: EnhanceAppContext) {
    app.component("BlogIndex", BlogIndex);
    app.component("VSCodeShowcase", VSCodeShowcase);
    app.component("HomeClosingCta", HomeClosingCta);
  },
};
