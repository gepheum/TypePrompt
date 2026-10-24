import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export { PlayApp } from "./app.js";
export { playgroundRouterContract, type PlaygroundRouter } from "./contract.js";
export { createPlayClient, trpc } from "./trpc.js";

export async function ensurePlaygroundFrontend(): Promise<string> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(currentDir, "..");
  const distClientDir = path.join(packageRoot, "dist/client");

  if (fs.existsSync(path.join(distClientDir, "index.html"))) {
    return distClientDir;
  }

  if (fs.existsSync(path.join(packageRoot, "index.html"))) {
    try {
      const { build } = await import("vite");
      const viteConfig = path.join(packageRoot, "vite.config.ts");
      await build({
        configFile: fs.existsSync(viteConfig) ? viteConfig : false,
        root: packageRoot,
        build: {
          outDir: distClientDir,
          emptyOutDir: true,
        },
        logLevel: "warn",
      });
      if (fs.existsSync(path.join(distClientDir, "index.html"))) {
        return distClientDir;
      }
    } catch {
      // Fallback to packageRoot if vite build fails or is not available
    }
    return packageRoot;
  }

  return distClientDir;
}
