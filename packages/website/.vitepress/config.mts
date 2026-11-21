import { defineConfig, type SiteConfig } from "vitepress";
import fs from "node:fs";
import path from "node:path";
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
      { text: "Introduction", link: "/introduction" },
      { text: "Quick start", link: "/quick-start" },
      { text: "Project structure", link: "/project-structure" },
      { text: "Examples", link: "/examples" },
    ],
  },
  {
    text: "Reference",
    items: [
      { text: "Template syntax", link: "/reference" },
      { text: "Schema language", link: "/schema" },
      { text: "CLI and configuration", link: "/cli" },
    ],
  },
  {
    text: "Prompt iteration",
    items: [
      { text: "Playground inference", link: "/playground" },
      { text: "Template overrides", link: "/template-overrides" },
    ],
  },
  {
    text: "Language guides",
    collapsed: true,
    items: languageItems,
  },
];

const SITE_URL = "https://typeprompt.dev";

function parseFrontmatter(raw: string): {
  description?: string;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n*/);
  if (!match) {
    return { body: raw.trim() };
  }
  const frontmatter = match[1];
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  const description = descMatch?.[1]
    .trim()
    .replace(/^["']|["']$/g, "");
  return {
    description,
    body: raw.slice(match[0].length).trim(),
  };
}

function generateLlmsFiles(siteConfig: SiteConfig): void {
  const indexLines: string[] = [
    "# TypePrompt",
    "",
    "> End-to-end type safety for LLM prompts. Write prompt templates with schemas, tools, and few-shot examples in dedicated `.tp` files and compile them into a type-safe API for TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, and C#.",
    "",
    `Full documentation in a single file: ${SITE_URL}/llms-full.txt`,
  ];

  const fullSections: string[] = [
    "# TypePrompt Documentation",
    "",
    `Source: ${SITE_URL}`,
  ];

  for (const section of docsSidebar) {
    indexLines.push("", `## ${section.text}`, "");
    for (const item of section.items) {
      const relPath = `${item.link.replace(/^\//, "")}.md`;
      const srcPath = path.join(siteConfig.srcDir, relPath);
      const raw = fs.readFileSync(srcPath, "utf8");
      const { description, body } = parseFrontmatter(raw);

      // Emit clean markdown copy for each page so agents can fetch individual docs
      const outMdPath = path.join(siteConfig.outDir, relPath);
      fs.mkdirSync(path.dirname(outMdPath), { recursive: true });
      fs.writeFileSync(outMdPath, `${body}\n`, "utf8");

      const url = `${SITE_URL}/${relPath}`;
      indexLines.push(
        description
          ? `- [${item.text}](${url}): ${description}`
          : `- [${item.text}](${url})`,
      );

      fullSections.push("", "---", "", `<!-- Source: ${url} -->`, "", body);
    }
  }

  fs.writeFileSync(
    path.join(siteConfig.outDir, "llms.txt"),
    `${indexLines.join("\n")}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(siteConfig.outDir, "llms-full.txt"),
    `${fullSections.join("\n")}\n`,
    "utf8",
  );
}

export default defineConfig({
  srcDir: "../../docs",
  title: "TypePrompt",
  description: "End-to-end type safety for LLM prompts.",
  lang: "en-US",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: SITE_URL,
  },
  transformPageData(pageData) {
    if (pageData.relativePath.startsWith("blog/")) {
      pageData.frontmatter.sidebar = false;
      pageData.frontmatter.prev = false;
      pageData.frontmatter.next = false;
      if (pageData.relativePath === "blog/index.md") {
        pageData.frontmatter.aside = false;
        pageData.frontmatter.editLink = false;
        pageData.frontmatter.lastUpdated = false;
      }
    }
  },
  buildEnd: generateLlmsFiles,
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
    [
      "script",
      {
        defer: "",
        src: "https://cloud.umami.is/script.js",
        "data-website-id": "1419b7d6-4be5-48b1-91ec-54b36f347508",
        "data-domains": "typeprompt.dev",
      },
    ],
  ],

  themeConfig: {
    logo: { light: "/favicon.svg", dark: "/favicon.svg" },

    nav: [
      {
        text: "Docs",
        link: "/introduction",
        activeMatch: "^/(introduction|quick-start|project-structure|playground|template-overrides|reference|schema|cli)",
      },
      { text: "Languages", items: languageItems, activeMatch: "^/languages/" },
      { text: "Examples", link: "/examples", activeMatch: "^/examples" },
      { text: "Blog", link: "/blog/", activeMatch: "^/blog/" },
    ],

    // A single sidebar for all docs pages (the home page layout has none).
    sidebar: docsSidebar,

    outline: {
      level: [2, 3],
      label: "On this page",
    },

    search: {
      provider: "local",
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/gepheum/typeprompt" },
      { icon: "x", link: "https://x.com/TypePromptDev" },
    ],

    footer: {
      message: "Made with 🩷 in New York and outer space",
      copyright: "Released under the MIT License · Copyright © 2026 Gepheum Lab",
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
