import type { ValidCompilationResult } from "@typeprompt/core";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PlayServerOptions = {
  readonly port?: number;
  readonly project: string;
  readonly getCompilationResult: () => ValidCompilationResult | null;
};

export class PlayServer {
  readonly url: string;

  private constructor(
    readonly server: http.Server,
    readonly port: number,
    readonly project: string,
  ) {
    this.url = `http://localhost:${port}`;
  }

  logLocalhostUrl(): void {
    console.log(`\nPrompt playground running at ${this.url}`);
  }

  async close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  static async start(options: PlayServerOptions): Promise<PlayServer> {
    const port = options.port ?? 3000;
    const frontendDir = await ensureFrontendReady();

    const server = http.createServer((req, res) => {
      handleRequest(req, res, frontendDir);
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "localhost", () => {
        resolve();
      });
    });

    const address = server.address();
    const actualPort =
      typeof address === "object" && address !== null ? address.port : port;

    const playServer = new PlayServer(server, actualPort, options.project);
    if (options.getCompilationResult()) {
      playServer.logLocalhostUrl();
    }

    return playServer;
  }
}

async function ensureFrontendReady(): Promise<string> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const cliRoot = path.resolve(currentDir, "../../..");
  const distFrontend = path.join(cliRoot, "dist/play/frontend");
  const srcFrontend = path.join(cliRoot, "src/play/frontend");

  if (fs.existsSync(path.join(distFrontend, "index.html"))) {
    return distFrontend;
  }

  if (fs.existsSync(path.join(srcFrontend, "index.html"))) {
    try {
      const { build } = await import("vite");
      const viteConfig = path.join(srcFrontend, "vite.config.ts");
      await build({
        configFile: fs.existsSync(viteConfig) ? viteConfig : false,
        root: srcFrontend,
        build: {
          outDir: distFrontend,
          emptyOutDir: true,
        },
        logLevel: "warn",
      });
      if (fs.existsSync(path.join(distFrontend, "index.html"))) {
        return distFrontend;
      }
    } catch {
      // Fallback to srcFrontend if vite build fails or is not available
    }
    return srcFrontend;
  }

  return distFrontend;
}

function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  frontendDir: string,
): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  const host = req.headers.host ?? "localhost";
  const parsedUrl = new URL(req.url ?? "/", `http://${host}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  const normalizedPath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(frontendDir, normalizedPath);

  if (!filePath.startsWith(frontendDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    const fallback = path.join(frontendDir, "index.html");
    if (!path.extname(normalizedPath) && fs.existsSync(fallback)) {
      filePath = fallback;
    } else {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

const MIME_TYPES: { readonly [extension: string]: string } = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};
