import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import type { PlaygroundRouter } from "./contract.js";

export function createPlayClient(
  url: string = "/trpc",
): TRPCClient<PlaygroundRouter> {
  return createTRPCClient<PlaygroundRouter>({
    links: [
      httpBatchLink({
        url,
      }),
    ],
  });
}

export const trpc: TRPCClient<PlaygroundRouter> = createPlayClient();
