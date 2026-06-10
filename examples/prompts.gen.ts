// This file is auto-generated. Do not edit it directly.

import * as zod from "zod"

export class PromptMaker {
}

export namespace PromptMaker {
  export namespace GetFoo {
    export interface FullName {
    }

    export type Response = string;

  }

}

export class JsonPrompt<Response> {
  constructor(
    readonly prompt: string,
    readonly responseSchema: zod.ZodType<Response>) {}
}

