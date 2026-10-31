import { unwrapJsonValue } from "../json/unwrapper.js";
import { parseAndValidateYaml } from "../json/yaml-parser-validator.js";
import { EMPTY_SCHEMA } from "../schema/empty-schema.js";
import type { Constraint, SchemaType, Typed } from "../schema/schema-types.js";
import {
  typedArray,
  typedInterface,
  typedOptional,
  typedString,
  typedStringLiteral,
} from "../schema/typed.js";
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
  const config = unwrapJsonValue<Config>(parseResult);
  return { kind: "success", config };
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

const CONFIG_TYPE: Typed<Config> = typedInterface({
  include: typedArray(typedString(notEmpty()), notEmpty()),
  gen: typedOptional(
    typedInterface({
      cpp: typedOptional(
        typedInterface({
          file: typedString(endsWith(".h")),
          rootNamespace: typedOptional(
            typedString(
              matches(/^[A-Za-z_][A-Za-z0-9_]*$/, "must be a valid identifier"),
            ),
          ),
        }),
      ),
      csharp: typedOptional(
        typedInterface({
          file: typedString(endsWith(".cs")),
          rootNamespace: typedOptional(
            typedString(
              matches(
                /^[A-Z][A-Za-z0-9_]*$/,
                "must be a valid PascalCase identifier",
              ),
            ),
          ),
        }),
      ),
      dart: typedOptional(
        typedInterface({
          file: typedString(endsWith(".dart")),
        }),
      ),
      kotlin: typedOptional(
        typedInterface({
          file: typedString(endsWith(".kt")),
          package: typedString(
            matches(
              /^([a-z_$][a-z0-9_$]*)(\.[a-z_$][a-z0-9_$]*)*$/,
              "must be a valid snake_case identifier",
            ),
          ),
        }),
      ),
      python: typedOptional(
        typedInterface({
          file: typedString(endsWith(".py")),
        }),
      ),
      rust: typedOptional(
        typedInterface({
          file: typedString(endsWith(".rs")),
        }),
      ),
      swift: typedOptional(
        typedInterface({
          file: typedString(endsWith(".swift")),
          rootNamespace: typedOptional(
            typedString(
              matches(
                /^[A-Z][A-Za-z0-9_]*$/,
                "must be a valid PascalCase identifier",
              ),
            ),
          ),
        }),
      ),
      typescript: typedOptional(
        typedInterface({
          file: typedString(endsWith(".ts")),
        }),
      ),
    }),
  ),
  patch: typedOptional(
    typedInterface({
      base: typedStringLiteral("patch-base.json"),
      overrides: typedStringLiteral("overrides.json"),
    }),
  ),
});

export const CONFIG: SchemaType = {
  type: CONFIG_TYPE.type,
  schema: EMPTY_SCHEMA,
};
