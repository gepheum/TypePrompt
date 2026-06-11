// This file is auto-generated. Do not edit it directly.

import * as zod from "zod"

export class PromptMaker {
  private readonly jsonSpec: JsonSpec;

  // Call with no argument.
  constructor(args?: {internalJsonSpec: unknown}) {
    this.jsonSpec = args === undefined
      ? jsonSpec
      : (args.internalJsonSpec as JsonSpec);
  }

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

const GetFooRecursiveZodType: zod.ZodType<GetFooResponse.Recursive> = zod.union([zod.literal("foo"), zod.object({"kind": zod.literal("a"), "r": zod.lazy((): zod.ZodType<GetFooResponse.Recursive> => GetFooRecursiveZodType)}), zod.object({"kind": zod.literal("b"), "a": zod.lazy((): zod.ZodType<GetFooResponse.Recursive> => GetFooRecursiveZodType), "b": zod.lazy((): zod.ZodType<GetFooResponse.Recursive> => GetFooRecursiveZodType)})])

const GetFooFullNameZodType: zod.ZodType<GetFooResponse.FullName> = zod.object({
  "firstName": zod.string(),
  "lastName": zod.string(),
  "foo": zod.object({"x": zod.number().optional(), "y": zod.boolean().optional(), "foos": zod.array(zod.string()), "kind": zod.literal("z"), "abc": zod.union([zod.literal("a"), zod.literal("b"), zod.literal("c")]), "empty": zod.object({}), "rec": GetFooRecursiveZodType}),
})

export const GetFooResponseZodType: zod.ZodType<GetFooResponse.Response> = zod.array(GetFooFullNameZodType)

type JsonSpec = {readonly [templateKey: string]: {
  readonly name: string;
  readonly variant: string;
  readonly dedentedSourceCode: string;
  readonly allArgs: readonly string[];
  readonly pieces: readonly (
    | {kind: "text"; text: string}
    | {kind: "arg"; name: string}
  )[];
}};

function freezeJsonSpec(jsonSpec: JsonSpec): JsonSpec {
  const freezeValue = (value: unknown): void => {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
      return;
    }
    Object.freeze(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        freezeValue(item);
      }
      return;
    }
    for (const child of Object.values(value as Record<string, unknown>)) {
      freezeValue(child);
    }
  };
  freezeValue(jsonSpec);
  return jsonSpec;
}

const jsonSpec: JsonSpec = freezeJsonSpec({
  "GetFoo": {
    name: "GetFoo",
    variant: "",
    dedentedSourceCode: "Hello $name,\n\nWhat's up $name?\n\nContext: $context\n\nMake sure to match this schema:\n$<schema hide>\n  type Recursive =\n    | \"foo\"\n    | {kind: \"a\"; r: Recursive}\n    | {kind: \"b\"; a: Recursive; b: Recursive};\n\n  interface FullName {\n    firstName: string;\n    lastName: string;\n    foo: {\n      x?: number;\n      y?: boolean;\n      foos: string[];\n      kind: \"z\";\n      abc: \"a\" | \"b\" | \"c\";\n      empty: {};\n      rec: Recursive;\n    };\n  }\n\n  type Response = FullName[];\n$</schema>\n\nFor example:\n$<example>\n  [\n    {\n      \"firstName\": \"Jane\",\n      \"lastName\": \"Do\",\n      ...\n    },\n    {\n      \"firstName\": \"John\",\n      \"lastName\": \"Do\",\n      ...\n    },\n    {...},\n    ...\n  ]\n$</example>\n",
    allArgs: ["name", "context"],
    pieces: [
      {kind: "text", text: "Hello "},
      {kind: "arg", name: "name"},
      {kind: "text", text: ",\n\nWhat's up "},
      {kind: "arg", name: "name"},
      {kind: "text", text: "?\n\nContext: "},
      {kind: "arg", name: "context"},
      {kind: "text", text: "\n\nMake sure to match this schema:\n\n\nFor example:\n\n  [\n    {\n      \"firstName\": \"Jane\",\n      \"lastName\": \"Do\",\n      ...\n    },\n    {\n      \"firstName\": \"John\",\n      \"lastName\": \"Do\",\n      ...\n    },\n    {...},\n    ...\n  ]\n\n"},
    ],
  },
  "GetName": {
    name: "GetName",
    variant: "",
    dedentedSourceCode: "Hi\n\n",
    allArgs: [],
    pieces: [
      {kind: "text", text: "Hi\n\n"},
    ],
  },
});

export const promptOverrider = {
  internalJsonSpec: jsonSpec,
  internalApplyOverrides(overrides: JsonSpec): PromptMaker {
    for (const [templateKey, overrideTemplate] of Object.entries(overrides)) {
      const constantTemplate = jsonSpec[templateKey];
      if (constantTemplate === undefined) {
        throw new Error(`Unknown template key '${templateKey}' in overrides`);
      }
      if (overrideTemplate.allArgs.length !== constantTemplate.allArgs.length) {
        throw new Error(`Override args mismatch for template '${templateKey}'`);
      }
      for (let i = 0; i < overrideTemplate.allArgs.length; i += 1) {
        if (overrideTemplate.allArgs[i] !== constantTemplate.allArgs[i]) {
          throw new Error(`Override args mismatch for template '${templateKey}'`);
        }
      }
    }
    const mergedJsonSpec = freezeJsonSpec({
      ...jsonSpec,
      ...overrides,
    });
    return new PromptMaker({internalJsonSpec: mergedJsonSpec});
  },
};

function makePromptImpl(
  templateKey: string,
  args: {readonly [argName: string]: string},
  jsonSpec: JsonSpec,
): string {
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

