import { unwrapJsonValue } from "../json/unwrapper.js";
import { parseAndValidateYaml } from "../json/yaml-parser-validator.js";
import { EMPTY_SCHEMA } from "../schema/empty-schema.js";
import type {
  Constraint,
  SchemaType,
  SyntheticType,
} from "../schema/schema-types.js";
import type { InternalErrors } from "../util/shared-types.js";

export type Config = {
  /** Glob pattern(s) to match template files to be processed. */
  // Usually: 'prompts/**/*.tp'
  readonly include: readonly string[];

  readonly gen?: {
    readonly cpp?: {
      /** Path to the generated .h file. */
      readonly file: string;
      readonly rootNamespace?: string;
    };
    readonly csharp?: {
      /** Path to the generated .cs file. */
      readonly file: string;
      readonly rootNamespace?: string;
    };
    readonly dart?: {
      /** Path to the generated .dart file. */
      readonly file: string;
    };
    readonly kotlin?: {
      /** Path to the generated .kt file. */
      readonly file: string;
      readonly package: string;
    };
    readonly python?: {
      /** Path to the generated .py file. */
      readonly file: string;
    };
    readonly rust?: {
      /** Path to the generated .rs file. */
      readonly file: string;
    };
    readonly swift?: {
      /** Path to the generated .swift file. */
      readonly file: string;
      readonly rootNamespace?: string;
    };
    readonly typescript?: {
      /** Path to the generated .ts file. */
      readonly file: string;
    };
  };

  readonly patch?: {
    readonly base: "patch-base.json";
    readonly overrides: "overrides.json";
  };
};

export type ConfigParseSuccess = {
  readonly kind: "success";
  readonly config: Config;
};

export type ConfigParseResult = ConfigParseSuccess | InternalErrors;

export function parseConfigYaml(
  content: string,
  path: string,
): ConfigParseResult {
  const parseResult = parseAndValidateYaml(content, path, CONFIG);
  if (parseResult.kind === "error") {
    return parseResult;
  }
  const config = unwrapJsonValue(parseResult) as Config;
  return { kind: "success", config };
}

type GenericType<T> = {
  readonly type: SyntheticType;
  readonly phantom?: T;
};

function string(constraint?: Constraint<string>): GenericType<string> {
  return {
    type: {
      kind: "primitive",
      primitive: {
        text: "string",
      },
      constraint,
    },
  };
}

function stringLiteral<const S extends string>(value: S): GenericType<S> {
  return {
    type: {
      kind: "string-literal",
      value,
    },
  };
}

function optional<T>(innerType: GenericType<T>): GenericType<T | undefined> {
  return {
    type: {
      kind: "optional",
      innerType: innerType.type,
    },
  };
}

function array<E>(
  innerType: GenericType<E>,
  constraint?: Constraint<readonly unknown[]>,
): GenericType<readonly E[]> {
  return {
    type: {
      kind: "array",
      elementType: innerType.type,
      constraint,
    },
  };
}

type GenericFields = { readonly [name: string]: GenericType<unknown> };

type Object<Fields extends GenericFields> = {
  readonly [K in keyof Fields]: NonNullable<Fields[K]["phantom"]>;
};

function object<Fields extends GenericFields>(
  fields: Fields,
): GenericType<Object<Fields>> {
  return {
    type: {
      kind: "interface",
      fields: Object.fromEntries(
        Object.entries(fields).map(([name, field]) => [
          name,
          {
            name: {
              text: name,
            },
            type: field.type,
          },
        ]),
      ),
    },
  };
}

function endsWith(suffix: string): Constraint<string> {
  return {
    predicate: (value: string) => value.endsWith(suffix),
    message: `Must end with '${suffix}'`,
  };
}

function matches(regex: RegExp, message: string): Constraint<string> {
  return {
    predicate: (value: string) => regex.test(value),
    message,
  };
}

function notEmpty<T extends string | readonly unknown[]>(): Constraint<T> {
  return {
    predicate: (value: T) => value.length > 0,
    message: "Must not be empty",
  };
}

const CONFIG_TYPE: GenericType<Config> = object({
  include: array(string(notEmpty()), notEmpty()),
  gen: optional(
    object({
      cpp: optional(
        object({
          file: string(endsWith(".h")),
          rootNamespace: optional(
            string(
              matches(/^[A-Za-z_][A-Za-z0-9_]*$/, "must be a valid identifier"),
            ),
          ),
        }),
      ),
      csharp: optional(
        object({
          file: string(endsWith(".cs")),
          rootNamespace: optional(
            string(
              matches(
                /^[A-Z][A-Za-z0-9_]*$/,
                "must be a valid PascalCase identifier",
              ),
            ),
          ),
        }),
      ),
      dart: optional(
        object({
          file: string(endsWith(".dart")),
        }),
      ),
      kotlin: optional(
        object({
          file: string(endsWith(".kt")),
          package: string(
            matches(
              /^([a-z_$][a-z0-9_$]*)(\.[a-z_$][a-z0-9_$]*)*$/,
              "must be a valid snake_case identifier",
            ),
          ),
        }),
      ),
      python: optional(
        object({
          file: string(endsWith(".py")),
        }),
      ),
      rust: optional(
        object({
          file: string(endsWith(".rs")),
        }),
      ),
      swift: optional(
        object({
          file: string(endsWith(".swift")),
          rootNamespace: optional(
            string(
              matches(
                /^[A-Z][A-Za-z0-9_]*$/,
                "must be a valid PascalCase identifier",
              ),
            ),
          ),
        }),
      ),
      typescript: optional(
        object({
          file: string(endsWith(".ts")),
        }),
      ),
    }),
  ),
  patch: optional(
    object({
      base: stringLiteral("patch-base.json"),
      overrides: stringLiteral("overrides.json"),
    }),
  ),
});

export const CONFIG: SchemaType = {
  type: CONFIG_TYPE.type,
  schema: EMPTY_SCHEMA,
};
