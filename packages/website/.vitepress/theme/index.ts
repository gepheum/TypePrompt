import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import type { EnhanceAppContext } from "vitepress";
import HeroQuickstart from "./HeroQuickstart.vue";
import HeroTilly from "./HeroTilly.vue";
import VSCodeShowcase from "./VSCodeShowcase.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      "home-hero-actions-after": () => h(HeroQuickstart),
      "home-hero-image": () => h(HeroTilly),
    });
  },
  enhanceApp({ app }: EnhanceAppContext) {
    app.component("VSCodeShowcase", VSCodeShowcase);
  },
};
