import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import type { PlaygroundRouter } from "./contract.js";

export function getDefaultTrpcUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const customPort = params.get("port");
    if (customPort) {
      return `http://localhost:${customPort}/trpc`;
    }
    // When running under Vite dev, import.meta.env.DEV is true.
    // Also detect if running on Vite dev port or non-3000 localhost.
    const isDev = Boolean(
      (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ||
      (window.location.hostname === "localhost" &&
        window.location.port !== "3000"),
    );
    if (isDev) {
      return "http://localhost:3000/trpc";
    }
  }
  return "/trpc";
}

export function normalizeTrpcUrl(url: string): string {
  if (url.endsWith("/trpc")) {
    return url;
  }
  return `${url.replace(/\/$/, "")}/trpc`;
}

export function createPlayClient(
  url: string = getDefaultTrpcUrl(),
): TRPCClient<PlaygroundRouter> {
  return createTRPCClient<PlaygroundRouter>({
    links: [
      httpBatchLink({
        url: normalizeTrpcUrl(url),
      }),
    ],
  });
}

export const trpc: TRPCClient<PlaygroundRouter> = createPlayClient();
