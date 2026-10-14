import { defineConfig } from "vitepress";

const languageItems = [
  { text: "TypeScript", link: "/languages/typescript" },
  { text: "Python", link: "/languages/python" },
  { text: "Kotlin", link: "/languages/kotlin" },
  { text: "Rust", link: "/languages/rust" },
  { text: "C++", link: "/languages/cpp" },
  { text: "Swift", link: "/languages/swift" },
  { text: "Dart", link: "/languages/dart" },
  { text: "C#", link: "/languages/csharp" },
];

const referenceSidebar = [
  {
    text: "Language specification",
    items: [
      { text: "Template syntax", link: "/reference" },
      { text: "Schema language", link: "/schema" },
    ],
  },
];

export default defineConfig({
  title: "TypePrompt",
  description: "End-to-end type safety for LLM prompts.",
  lang: "en-US",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: "https://typeprompt.dev",
  },
  head: [
    ["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
    ["meta", { name: "theme-color", content: "#6d5efc" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "TypePrompt" }],
    [
      "meta",
      {
        property: "og:description",
        content: "End-to-end type safety for LLM prompts.",
      },
    ],
    ["meta", { property: "og:url", content: "https://typeprompt.dev/" }],
    ["meta", { name: "twitter:card", content: "summary" }],
  ],

  themeConfig: {
    logo: { light: "/favicon.svg", dark: "/favicon.svg" },

    nav: [
      { text: "Guide", link: "/guide/", activeMatch: "^/guide/" },
      {
        text: "Reference",
        link: "/reference",
        activeMatch: "^/(reference|schema)",
      },
      { text: "Languages", items: languageItems, activeMatch: "^/languages/" },
      { text: "Examples", link: "/examples", activeMatch: "^/examples" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Getting started",
          items: [{ text: "Introduction", link: "/guide/" }],
        },
        {
          text: "Advanced workflows",
          items: [
            { text: "Template overrides", link: "/guide/template-overrides" },
          ],
        },
      ],
      "/reference": referenceSidebar,
      "/schema": referenceSidebar,
      "/languages/": [
        {
          text: "Supported languages",
          items: languageItems,
        },
      ],
    },

    outline: {
      level: [2, 3],
      label: "On this page",
    },

    search: {
      provider: "local",
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/gepheum/typeprompt" },
    ],

    footer: {
      copyright: "Copyright © 2025-present TypePrompt",
    },

    editLink: {
      pattern:
        "https://github.com/gepheum/typeprompt/edit/main/packages/website/:path",
      text: "Edit this page on GitHub",
    },
  },
});
