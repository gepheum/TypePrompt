// This file is auto-generated. Do not edit it directly.

import * as zod from "zod"

export class PromptMaker {
  makeGetFoo(args: GetFooArgs): JsonPrompt<GetFooResponse.Response> {
    throw new Error("Not implemented");
  }

  makeGetName(): string {
    throw new Error("Not implemented");
  }
}

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

const GetFooFullNameZodType: zod.ZodType<GetFooResponse.FullName> = zod.object({
  "firstName": zod.string(),
  "lastName": zod.string(),
  "foo": zod.object({
    "x": zod.number().optional(),
    "y": zod.boolean().optional(),
    "foos": zod.array(zod.string()),
    "kind": zod.literal("z"),
    "abc": zod.union([zod.literal("a"), zod.literal("b"), zod.literal("c")]),
    "empty": zod.object({}),
  }),
})

export const GetFooResponseZodType: zod.ZodType<GetFooResponse.Response> = zod.array(GetFooFullNameZodType)

