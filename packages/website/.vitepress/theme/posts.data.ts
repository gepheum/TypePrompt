import { createContentLoader } from "vitepress";

export interface BlogPost {
  title: string;
  url: string;
  date: {
    time: number;
    string: string;
  };
  description: string;
  author?: string;
}

declare const data: BlogPost[];
export { data };

function formatDate(raw: string | Date): BlogPost["date"] {
  const date =
    raw instanceof Date
      ? raw
      : new Date(raw.includes("T") ? raw : `${raw}T12:00:00Z`);
  return {
    time: +date,
    string: date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

export default createContentLoader("blog/*.md", {
  transform(raw): BlogPost[] {
    return raw
      .filter((page) => page.url !== "/blog/" && page.url !== "/blog")
      .map(({ url, frontmatter }) => ({
        title: frontmatter.title ?? url,
        url,
        date: formatDate(frontmatter.date ?? "2026-01-01"),
        description: frontmatter.description ?? "",
        author: frontmatter.author,
      }))
      .sort((a, b) => b.date.time - a.date.time);
  },
});
