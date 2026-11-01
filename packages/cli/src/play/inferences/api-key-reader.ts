import type { Config } from "@typeprompt/core";
import * as Paths from "node:path";
import { parseEnv } from "node:util";
import { ExitError } from "../../main/exit-error.js";
import { REAL_FILE_SYSTEM, type AsyncFileReader } from "../../util/io.js";

export type ApiKeyProvider = keyof NonNullable<
  NonNullable<Config["play"]>["apiKeyEnvVars"]
>;

export type ApiKeys = {
  readonly [P in ApiKeyProvider]?: string;
};

/**
 * Reads {@link ApiKeys} from `process.env` and the configured `play.envFile`
 * (or `.env` in `projectDir` if present), using custom variable names from
 * `config.play.apiKeyEnvVars` when specified.
 */
export async function readApiKeys(
  config: Config,
  projectDir: string,
  params: {
    /**
     * Environment variables map to look up keys from (takes precedence over `.env` file values).
     * @default process.env
     */
    readonly env?: { readonly [key: string]: string | undefined };
    /**
     * File reader used to read the `.env` file.
     * @default REAL_FILE_SYSTEM
     */
    readonly fileReader?: AsyncFileReader;
  } = {},
): Promise<ApiKeys> {
  const env = params.env ?? process.env;
  const fileReader = params.fileReader ?? REAL_FILE_SYSTEM;

  const fileEnv = await loadEnvFile(config, projectDir, fileReader);
  const configuredEnvVars = config.play?.apiKeyEnvVars;

  const result: { [P in ApiKeyProvider]?: string } = {};
  for (const provider of Object.keys(DEFAULT_ENV_VARS) as ApiKeyProvider[]) {
    const configuredVar = configuredEnvVars?.[provider];
    const candidateVars =
      configuredVar !== undefined
        ? [configuredVar]
        : DEFAULT_ENV_VARS[provider];
    const value = resolveFirstNonEmptyEnvVar(candidateVars, env, fileEnv);
    if (value !== undefined) {
      result[provider] = value;
    }
  }
  return result;
}

async function loadEnvFile(
  config: Config,
  projectDir: string,
  fileReader: AsyncFileReader,
): Promise<{ readonly [key: string]: string | undefined }> {
  const configuredEnvFile = config.play?.envFile;
  if (configuredEnvFile !== undefined) {
    const envFilePath = Paths.resolve(projectDir, configuredEnvFile);
    const content = await fileReader.readTextFileAsync(envFilePath);
    if (content === undefined) {
      throw new ExitError(`Cannot find ${envFilePath}`);
    }
    return parseEnv(content);
  }

  const defaultEnvFilePath = Paths.resolve(projectDir, DEFAULT_ENV_FILE);
  const content = await fileReader.readTextFileAsync(defaultEnvFilePath);
  if (content === undefined) {
    return {};
  }
  return parseEnv(content);
}

function getNonEmptyEnvVar(
  name: string,
  env: { readonly [key: string]: string | undefined },
  fileEnv: { readonly [key: string]: string | undefined },
): string | undefined {
  const fromEnv = env[name];
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  const fromFile = fileEnv[name];
  if (fromFile !== undefined && fromFile.length > 0) {
    return fromFile;
  }
  return undefined;
}

function resolveFirstNonEmptyEnvVar(
  names: readonly string[],
  env: { readonly [key: string]: string | undefined },
  fileEnv: { readonly [key: string]: string | undefined },
): string | undefined {
  for (const name of names) {
    const value = getNonEmptyEnvVar(name, env, fileEnv);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

const DEFAULT_ENV_FILE = ".env";

const DEFAULT_ENV_VARS: {
  readonly [P in ApiKeyProvider]: readonly string[];
} = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY"],
  xai: ["XAI_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  vercelGateway: ["AI_GATEWAY_API_KEY"],
};
