import { unwrapJsonValue } from "../json/unwrapper.js";
import { parseAndValidateYaml } from "../json/yaml-parser-validator.js";
import { EMPTY_SCHEMA } from "../schema/empty-schema.js";
import type { Constraint, SchemaType } from "../schema/schema-types.js";
import { typedInterface, typedOptional, typedString } from "../schema/typed.js";
import type { InternalErrors } from "../util/shared-types.js";

export type SecretsParseResult = {
  readonly kind: "success";
  readonly secrets: Secrets;
};

export type Secrets = {
  readonly apiKeys?: {
    readonly openai?: string;
    readonly anthropic?: string;
    readonly google?: string;
    readonly xai?: string;
    readonly mistral?: string;
    readonly vercelGateway?: string;
  };
};

export function parseSecretsYaml(
  content: string,
  path: string,
): SecretsParseResult | InternalErrors {
  const parseResult = parseAndValidateYaml(content, path, SECRETS);
  if (parseResult.kind === "error") {
    return parseResult;
  }
  const secrets = unwrapJsonValue<Secrets>(parseResult);
  return { kind: "success", secrets };
}

function notEmpty<T extends string | readonly unknown[]>(): Constraint<T> {
  return {
    predicate: (value: T) => value.length > 0,
    message: "Must not be empty",
  };
}

const SECRETS: SchemaType = {
  type: typedInterface({
    apiKeys: typedOptional(
      typedInterface({
        openai: typedOptional(typedString(notEmpty())),
        anthropic: typedOptional(typedString(notEmpty())),
        google: typedOptional(typedString(notEmpty())),
        xai: typedOptional(typedString(notEmpty())),
        mistral: typedOptional(typedString(notEmpty())),
        vercelGateway: typedOptional(typedString(notEmpty())),
      }),
    ),
  }).type,
  schema: EMPTY_SCHEMA,
};
