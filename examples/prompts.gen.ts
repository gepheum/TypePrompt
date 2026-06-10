// This file is auto-generated. Do not edit it directly.

import * as zod from "zod"

export interface JsonPrompt<Response> {
  readonly prompt: string;
  readonly responseSchema: zod.ZodType<Response>;
}

export interface GetFooArgs {
  readonly name: string;
  readonly context: string;
}

export namespace GetFooResponse {
  export interface FullName   {
    readonly firstName: string;
    readonly lastName: string;
    readonly foo: {
      readonly x?: number;
      readonly y?: boolean;
      readonly foos: readonly string[];
      readonly kind: "z";
      readonly abc: (
        | "a"
        | "b"
        | "c"
      );
      readonly empty: {};
    };
  }

  export type Response = readonly FullName[];
}

