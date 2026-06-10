// This file is auto-generated. Do not edit it directly.

import * as zod from "zod"

export class PromptMaker {
}

export namespace PromptMaker {
  export namespace GetFoo {
    export interface FullName     {
      readonly firstName: string;
      readonly lastName: string;
      readonly foo: { readonly x?: number; readonly y?: boolean; readonly foos: readonly string[]; readonly kind: "z"; readonly abc: (
        | "a"
        | "b"
        | "c"

      ); };
    }

    export type Response = readonly FullName[];

  }

}

export class JsonPrompt<Response> {
  constructor(
    readonly prompt: string,
    readonly responseSchema: zod.ZodType<Response>) {}
}

