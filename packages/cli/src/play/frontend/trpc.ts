import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../backend/router.js";

export function createPlayClient(url: string = "/trpc") {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url,
      }),
    ],
  });
}

export const trpc = createPlayClient();
