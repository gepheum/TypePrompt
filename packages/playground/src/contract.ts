import { initTRPC } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.create();

export const playgroundRouterContract = t.router({
  getTemplates: t.procedure
    .input(
      z
        .object({
          currentTimestampMillis: z.number().optional(),
        })
        .optional(),
    )
    .query(
      (): {
        readonly sourceFiles?: { readonly [path: string]: string };
      } => {
        throw new Error("Contract only");
      },
    ),
});

export type PlaygroundRouter = typeof playgroundRouterContract;
