// Run with: npm run make-static-snippets

// From the 'src' directory.
const SOURCE_FILES = [
  "codegen/typescript/runtime-logic.ts",
] as const;

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "..");
const OUT_FILE = path.join(__dirname, "static-snippets.gen.ts");

const snippets: Record<string, string> = {};

for (const relPath of SOURCE_FILES) {
  const fullPath = path.join(SRC_DIR, relPath);
  const content = fs.readFileSync(fullPath, "utf8");
  const lines = content.split("\n");

  let currentId: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const openMatch = line.match(/\/\/ <static:([^>]+)>/);
    if (openMatch) {
      currentId = openMatch[1]!;
      currentLines = [];
      continue;
    }
    const closeMatch = line.match(/\/\/ <\/static:([^>]+)>/);
    if (closeMatch) {
      if (currentId !== null) {
        snippets[currentId] = currentLines.join("\n");
        currentId = null;
        currentLines = [];
      }
      continue;
    }
    if (currentId !== null) {
      currentLines.push(line);
    }
  }
}

const entries = Object.entries(snippets)
  .map(([id, content]) => `  ${JSON.stringify(id)}: ${JSON.stringify(content)},`)
  .join("\n");

const output = `export const STATIC_SNIPPETS = {\n${entries}\n} as const;\n`;

fs.writeFileSync(OUT_FILE, output, "utf8");
console.log(`Written ${Object.keys(snippets).length} snippet(s) to ${OUT_FILE}`);

