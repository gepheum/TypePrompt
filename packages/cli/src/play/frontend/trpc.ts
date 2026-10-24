import {
  createTRPCClient,
  httpBatchLink,
  type TRPCClient,
} from "@trpc/client";
import type { AppRouter } from "../backend/router.js";

export function createPlayClient(
  url: string = "/trpc",
): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url,
      }),
    ],
  });
}

export const trpc: TRPCClient<AppRouter> = createPlayClient();
