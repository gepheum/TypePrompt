import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type UserConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig((): UserConfig => {
  return {
    root: dirname,
    build: {
      outDir: path.resolve(dirname, "dist/client"),
      emptyOutDir: true,
    },
    server: {
      port: 5174,
      proxy: {
        "/trpc": "http://localhost:3000",
      },
    },
  };
});
