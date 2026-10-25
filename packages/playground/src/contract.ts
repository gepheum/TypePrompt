import type { TRPCBuiltRouter, TRPCQueryProcedure } from "@trpc/server";

export type PullSourcesRequest = {
  lastTimestampMillis: number | null;
};

export type PullSourcesResponse = {
  readonly timestampMillis: number;
  readonly sourceFiles: {
    readonly [path: string]: string;
  };
};

export type PlaygroundProcedures = {
  pullSources: TRPCQueryProcedure<{
    input: PullSourcesRequest;
    output: PullSourcesResponse;
    meta: object;
  }>;
};

export type PlaygroundRouter = TRPCBuiltRouter<any, PlaygroundProcedures>;
