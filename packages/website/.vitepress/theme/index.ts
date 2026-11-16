import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import HeroQuickstart from "./HeroQuickstart.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      "home-hero-actions-after": () => h(HeroQuickstart),
    });
  },
};
