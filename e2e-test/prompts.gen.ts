// This file is auto-generated. Do not edit it directly.

import { ZodType } from "zod";

export namespace Meta {
  export type Meta = {
    /** Temperature setting for the template */
    readonly temperature?: number;
    readonly foobar?: Meta_Foobar;
  };

  export type Meta_Foobar =
    | "foo"
    | "bar";
}

/** Types defined in the Default namespace. */
export namespace DefaultTypes {
  export namespace John {
    export type Variant =
      | "Foo";

    export type Args = {
      readonly name: string;
      readonly variant: Variant;
    };

    export type Response = {
      readonly x: number;
      readonly y: number;
    };
  }

  export namespace HelloWorld {
    export type Variant =
      | "Aa"
      | "Bb";

    export type Args = {
      /** Documentation for foo */
      readonly foo: string;
      readonly bar: Input;
      readonly variant: Variant;
    };

    export type Input = {
      readonly x: number;
      readonly y: number;
    };

    /** The input. */
    export type Foo = {
      /** The message to be displayed */
      readonly message: string;
      readonly foo: number;
      readonly bar: number;
    };

    export type Response = Foo[];
  }
}

/** Types defined in the Taxi namespace. */
export namespace TaxiTypes {
  export namespace Fo {
    export type Args = {
      /** Doc */
      readonly input: number[];
    };

    export type Response = string[];
  }
}

export type PromptMaker2 = {
  readonly default: {
    readonly john: PromptSpec<DefaultTypes.John.Args, DefaultTypes.John.Response>;
    readonly helloWorld: PromptSpec<DefaultTypes.HelloWorld.Args, DefaultTypes.HelloWorld.Response>;
  };
  readonly taxi: {
    readonly fo: PromptSpec<TaxiTypes.Fo.Args, TaxiTypes.Fo.Response>;
  };
};

export type PromptSpec<Args, Response> = {
  readonly make: (args: Args) => Response;
  readonly responseType: ZodType<Response>;
  readonly meta: Meta.Meta;
};

export class PromptMaker {
  private readonly jsonSpec: JsonSpec;

  // Call with no argument.
  constructor(args?: {internalJsonSpec: unknown}) {
    this.jsonSpec = args === undefined
      ? jsonSpec
      : (args.internalJsonSpec as JsonSpec);
  }
}

type JsonSpec = {readonly [templateKey: string]: {
  readonly name: string;
  readonly allArgs: readonly string[];
  readonly pieces: readonly (
    | {kind: "text"; text: string}
    | {kind: "arg"; name: string; indent: string | undefined}
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
    const copiedOverrides: Record<string, JsonSpec[string]> = {};
    for (const [templateKey, overrideTemplate] of Object.entries(overrides)) {
      copiedOverrides[templateKey] = {
        name: overrideTemplate.name,
        allArgs: [...overrideTemplate.allArgs],
        pieces: overrideTemplate.pieces.map((piece) => piece.kind === "text"
          ? {kind: "text", text: piece.text}
          : {kind: "arg", name: piece.name, indent: piece.indent}),
      };
    }
    const mergedJsonSpec = freezeJsonSpec({
      ...jsonSpec,
      ...copiedOverrides,
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
    }
    const arg = args[p.name];
    if (arg === undefined) {
      throw new Error(`Missing arg '${p.name}'`);
    }
    if (p.indent === undefined || p.indent === "") {
      return arg;
    }
    return arg.split("\n").join(`\n${p.indent}`);
  }).join("");
}

