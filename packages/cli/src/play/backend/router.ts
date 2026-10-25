import {
  initTRPC,
  type inferRouterInputs,
  type inferRouterOutputs,
} from "@trpc/server";
import type { AssertSatisfies, ValidCompilationResult } from "@typeprompt/core";
import type {
  PlaygroundRouter,
  PullSourcesResponse,
} from "@typeprompt/playground";
import { z } from "zod";

export type PlayContext = {
  readonly getCompilationResult: () => ValidCompilationResult;
};

const t = initTRPC.context<PlayContext>().create();

export const appRouter = t.router({
  pullSources: t.procedure
    .input(
      z.object({
        lastTimestampMillis: z.number().nullable(),
      }),
    )
    .query(({ ctx }): PullSourcesResponse => {
      const compilationResult = ctx.getCompilationResult();
      const sourceFiles = Object.fromEntries(
        Object.values(compilationResult.sourceFiles).map((file) => [
          file.path,
          file.content,
        ]),
      );
      return {
        timestampMillis: compilationResult.timestampMillis,
        sourceFiles,
      };
    }),
});

export type AppRouter = typeof appRouter;

// Compile-time guarantee that the backend implementation satisfies the PlaygroundRouter contract
type _AssertOutputs = AssertSatisfies<
  inferRouterOutputs<AppRouter>,
  inferRouterOutputs<PlaygroundRouter>
>;
type _AssertInputs = AssertSatisfies<
  inferRouterInputs<PlaygroundRouter>,
  inferRouterInputs<AppRouter>
>;
