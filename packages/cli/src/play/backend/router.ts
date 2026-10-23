import { initTRPC } from "@trpc/server";
import {
  makeTemplates,
  type Templates,
  type ValidCompilationResult,
} from "@typeprompt/core";
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
        readonly templates?: Templates;
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
        const templates = makeTemplates(compilationResult);
        return {
          templates,
        };
      },
    ),
});

export type AppRouter = typeof appRouter;
