import { defineConfig } from "vitepress";
import { fileURLToPath } from "node:url";
import { Lsp } from "@typeprompt/core";

const TOKEN_VARIABLE_MAP: Record<string, string> = {
  "xml-tag": "--shiki-token-tag",
  "xml-attribute": "--shiki-token-attribute",
  "schema-keyword": "--shiki-token-keyword",
  "schema-directive": "--shiki-token-function",
  string: "--shiki-token-string",
  number: "--shiki-token-constant",
  boolean: "--shiki-token-constant",
  comment: "--shiki-token-comment",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTokenSpan(text: string, kind: string): string {
  const variable = TOKEN_VARIABLE_MAP[kind];
  if (!variable) {
    return `<span class="tp-punctuation" style="color:var(--shiki-token-punctuation)">${escapeHtml(text)}</span>`;
  }
  const italic = kind === "comment" ? ";font-style:italic" : "";
  return `<span class="tp-${kind}" style="color:var(${variable})${italic}">${escapeHtml(text)}</span>`;
}

function highlightTypePrompt(code: string): string | null {
  const normalizedCode = code.endsWith("\n") ? code.slice(0, -1) : code;
  const tokens = Lsp.tokenize(normalizedCode);
  if (tokens.length === 0) {
    return null;
  }

  const lines: string[] = [];
  let currentLine = "";

  function appendSegment(text: string, kind?: string) {
    if (!text) return;
    const parts = text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        lines.push(currentLine);
        currentLine = "";
      }
      const part = parts[i];
      if (part.length > 0) {
        if (kind) {
          currentLine += renderTokenSpan(part, kind);
        } else {
          currentLine += `<span class="tp-punctuation" style="color:var(--shiki-token-punctuation)">${escapeHtml(part)}</span>`;
        }
      }
    }
  }

  let lastIndex = 0;
  for (const token of tokens) {
    const start = Math.min(token.span.start, normalizedCode.length);
    const end = Math.min(token.span.end, normalizedCode.length);
    if (start > lastIndex) {
      appendSegment(normalizedCode.slice(lastIndex, start));
    }
    if (end > start) {
      appendSegment(normalizedCode.slice(start, end), token.kind);
    }
    lastIndex = end;
  }
  if (lastIndex < normalizedCode.length) {
    appendSegment(normalizedCode.slice(lastIndex));
  }
  lines.push(currentLine);

  return lines.map((line) => `<span class="line">${line}</span>`).join("\n");
}

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

const docsSidebar = [
  {
    text: "Getting started",
    items: [
      { text: "Introduction", link: "/guide/" },
      { text: "Playground inference", link: "/playground" },
    ],
  },
  {
    text: "Language specification",
    items: [
      { text: "Template syntax", link: "/reference" },
      { text: "Schema language", link: "/schema" },
    ],
  },
  {
    text: "Advanced topics",
    items: [
      { text: "Template overrides", link: "/template-overrides" },
    ],
  },
];

export default defineConfig({
  srcDir: "../../docs",
  title: "TypePrompt",
  description: "End-to-end type safety for LLM prompts.",
  lang: "en-US",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: "https://typeprompt.dev",
  },
  vite: {
    publicDir: fileURLToPath(new URL("../public", import.meta.url)),
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
      {
        text: "Docs",
        link: "/guide/",
        activeMatch: "^/(guide|reference|schema|template-overrides|playground)",
      },
      { text: "Languages", items: languageItems, activeMatch: "^/languages/" },
      { text: "Examples", link: "/examples", activeMatch: "^/examples" },
    ],

    sidebar: {
      "/guide/": docsSidebar,
      "/reference": docsSidebar,
      "/schema": docsSidebar,
      "/template-overrides": docsSidebar,
      "/playground": docsSidebar,
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
      copyright: "Copyright © 2026-present TypePrompt",
    },

    editLink: {
      pattern:
        "https://github.com/gepheum/typeprompt/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },

  markdown: {
    config(md) {
      const defaultFence = md.renderer.rules.fence!;
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const defaultHtml = defaultFence(tokens, idx, options, env, self);
        const token = tokens[idx];
        const lang = token.info.trim().split(/\s+/)[0];
        if (lang === "xml" || lang === "tp" || lang === "typeprompt") {
          const customLines = highlightTypePrompt(token.content);
          if (customLines) {
            const codeStart = defaultHtml.indexOf("<code>");
            const codeEnd = defaultHtml.lastIndexOf("</code>");
            if (codeStart !== -1 && codeEnd !== -1) {
              return (
                defaultHtml.slice(0, codeStart + 6) +
                customLines +
                defaultHtml.slice(codeEnd)
              );
            }
          }
        }
        return defaultHtml;
      };
    },
  },
});
