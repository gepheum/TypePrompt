import { initTRPC } from "@trpc/server";
import type { ValidCompilationResult } from "@typeprompt/core";
import { z } from "zod";

export type PlayContext = {
  readonly getCompilationResult: () => ValidCompilationResult | null;
};

const t = initTRPC.context<PlayContext>().create();

export const appRouter = t.router({
  getTemplates: t.procedure
    .input(
      z
        .object({
          currentTimestampMillis: z.number().optional(),
        })
        .optional(),
    )
    .query(
      ({
        ctx,
        input,
      }): {
        readonly sourceFiles?: { readonly [path: string]: string };
      } => {
        const compilationResult = ctx.getCompilationResult();
        if (!compilationResult) {
          return {};
        }
        if (
          input?.currentTimestampMillis !== undefined &&
          input.currentTimestampMillis === compilationResult.timestampMillis
        ) {
          return {};
        }
        const sourceFiles = Object.fromEntries(
          Object.values(compilationResult.sourceFiles).map((file) => [
            file.path,
            file.content,
          ]),
        );
        return {
          sourceFiles,
        };
      },
    ),
});

export type AppRouter = typeof appRouter;
