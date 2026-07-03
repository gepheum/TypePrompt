import { ZodType } from "zod";

interface Meta {}

export namespace DefaultNamespace {
  export namespace Wave {
    export type Args = {
      readonly firstName: string;
    }

    export type Response = {
      readonly greeting: string;
    }
  }
}

type PromptSpec<Args, Response> = {
  readonly make: (args: Args) => string;
  readonly meta: Meta;
  readonly responseType: ZodType<Response>;
}

class Prompt {
  readonly default: {
    readonly wave: PromptSpec<DefaultNamespace.Wave.Args, DefaultNamespace.Wave.Response>;
  }
}
