// This file is auto-generated. Do not edit it directly.

import * as zod from "zod"

export class PromptMaker {
  makeGetTopicalUrlsPrompt(args: PromptMaker.GetTopicalUrls.Input) {

  }
}

export namespace PromptMaker {
  export namespace GetTopicalUrls {
    export interface Input {
      foo: string;
      bar: string;
    }

    export interface Response {

    }
  }
}

export class JsonRequestingPrompt<Response> {
  constructor(
    readonly prompt: string,
    readonly zodType: zod.ZodType<Response>) {}
}

