import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export {
  type PlaygroundProcedures,
  type PlaygroundRouter,
  type PullSourcesRequest,
  type PullSourcesResponse,
} from "./contract.js";
export { createPlayClient, trpc } from "./trpc.js";
export { PlayApp } from "./view/play-app.js";

export function getPlaygroundFrontendDir(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(currentDir, "..");
  const distClientDir = path.join(packageRoot, "dist/client");

  if (!fs.existsSync(path.join(distClientDir, "index.html"))) {
    throw new Error(
      `Playground frontend bundle not found at ${distClientDir}. Run 'npm run build' in packages/playground first.`,
    );
  }

  return distClientDir;
}
