import type { TRPCBuiltRouter, TRPCQueryProcedure } from "@trpc/server";

export type PlaygroundProcedures = {
  getTemplates: TRPCQueryProcedure<{
    input: {
      currentTimestampMillis?: number;
    };
    output: {
      readonly timestampMillis?: number;
      readonly sourceFiles?: {
        readonly [path: string]: string;
      };
    };
    meta: object;
  }>;
};

export type PlaygroundRouter = TRPCBuiltRouter<any, PlaygroundProcedures>;
