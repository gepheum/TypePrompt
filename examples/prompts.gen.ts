// This file is auto-generated. Do not edit it directly.

import * as zod from "zod"

export class PromptMaker {
  private readonly jsonSpec: JsonSpec = jsonSpec;

  makeGetFoo(args: GetFooArgs): JsonPrompt<GetFooResponse.Response> {
    const argsRecord = args as unknown as {readonly [argName: string]: string};
    return {
      prompt: makePromptImpl("GetFoo", argsRecord, this.jsonSpec),
      responseSchema: GetFooResponseZodType,
    };
  }

  makeGetName(): string {
    return makePromptImpl("GetName", {}, this.jsonSpec);
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
  export type Recursive = (
    | "foo"
    | {
      readonly kind: "a";
      readonly r: Recursive;
    }
    | {
      readonly kind: "b";
      readonly a: Recursive;
      readonly b: Recursive;
    }
  );

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
      readonly rec: Recursive;
    };
  }

  export type Response = readonly FullName[];
}

const GetFooRecursiveZodType: zod.ZodType<GetFooResponse.Recursive> = zod.union([zod.literal("foo"), zod.object({
  "kind": zod.literal("a"),
  "r": zod.lazy((): zod.ZodType<GetFooResponse.Recursive> => GetFooRecursiveZodType),
}), zod.object({
  "kind": zod.literal("b"),
  "a": zod.lazy((): zod.ZodType<GetFooResponse.Recursive> => GetFooRecursiveZodType),
  "b": zod.lazy((): zod.ZodType<GetFooResponse.Recursive> => GetFooRecursiveZodType),
})])

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
    "rec": GetFooRecursiveZodType,
  }),
})

export const GetFooResponseZodType: zod.ZodType<GetFooResponse.Response> = zod.array(GetFooFullNameZodType)

type JsonSpec = {readonly [templateKey: string]: {
  readonly name: string;
  readonly variant: string;
  readonly allArgs: readonly string[];
  readonly pieces: readonly (
    | {kind: "text"; text: string}
    | {kind: "arg"; name: string}
  )[];
}};

const jsonSpec: JsonSpec = {
  "GetFoo": {
    name: "GetFoo",
    variant: "",
    allArgs: ["name", "context"],
    pieces: [
      {kind: "text", text: "Hello "},
      {kind: "arg", name: "name"},
      {kind: "text", text: ",\n\nWhat's up "},
      {kind: "arg", name: "name"},
      {kind: "text", text: "?\n\nContext: "},
      {kind: "arg", name: "context"},
      {kind: "text", text: "\n\nMake sure to match this schema:\n"},
      {kind: "text", text: "\n\nFor example:\n"},
      {kind: "text", text: "\n  [\n    {\n      \"firstName\": \"Jane\",\n      \"lastName\": \"Do\",\n      ...\n    },\n    {\n      \"firstName\": \"John\",\n      \"lastName\": \"Do\",\n      ...\n    },\n    {...},\n    ...\n  ]\n"},
      {kind: "text", text: "\n"},
    ],
  },
  "GetName": {
    name: "GetName",
    variant: "",
    allArgs: [],
    pieces: [
      {kind: "text", text: "Hi\n\n"},
    ],
  },
};

function makePromptImpl(
  templateKey: string,
  args: {readonly [argName: string]: string},
  jsonSpec: JsonSpec): string {
  const templateSpec = jsonSpec[templateKey]!;
  return templateSpec.pieces.map((p) => {
    if (p.kind === "text") {
      return p.text;
    } else {
      const arg = args[p.name];
      if (arg === undefined) {
        throw new Error(`Missing arg '${p.name}'`);
      }
      return arg;
    }
  }).join("");
}

