import type { Config } from "@typeprompt/core";
import * as Paths from "node:path";
import { parseEnv } from "node:util";
import { ExitError } from "../../main/exit-error.js";
import { REAL_FILE_SYSTEM, type AsyncFileReader } from "../../util/io.js";
import type { RunPlaygroundInferencesOptions } from "./inference-runner.js";

/**
 * Resolves {@link RunPlaygroundInferencesOptions} from a TypePrompt {@link Config},
 * loading environment variables from `process.env` and the configured `play.envFile`
 * (or `.env` in `projectDir` if present).
 */
export async function resolveInferenceOptions(
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
): Promise<RunPlaygroundInferencesOptions> {
  const env = params.env ?? process.env;
  const fileReader = params.fileReader ?? REAL_FILE_SYSTEM;

  const fileEnv = await loadEnvFile(config, projectDir, fileReader);
  const envVars = config.play?.apiKeyEnvVars;

  const openaiApiKey = getNonEmptyEnvVar(
    envVars?.openai ?? DEFAULT_OPENAI_ENV_VAR,
    env,
    fileEnv,
  );
  const anthropicApiKey = getNonEmptyEnvVar(
    envVars?.anthropic ?? DEFAULT_ANTHROPIC_ENV_VAR,
    env,
    fileEnv,
  );
  const googleApiKey =
    envVars?.google !== undefined
      ? getNonEmptyEnvVar(envVars.google, env, fileEnv)
      : resolveFirstNonEmptyEnvVar(DEFAULT_GOOGLE_ENV_VARS, env, fileEnv);
  const xaiApiKey = getNonEmptyEnvVar(
    envVars?.xai ?? DEFAULT_XAI_ENV_VAR,
    env,
    fileEnv,
  );
  const mistralApiKey = getNonEmptyEnvVar(
    envVars?.mistral ?? DEFAULT_MISTRAL_ENV_VAR,
    env,
    fileEnv,
  );
  const vercelGatewayApiKey = getNonEmptyEnvVar(
    envVars?.vercelGateway ?? DEFAULT_VERCEL_GATEWAY_ENV_VAR,
    env,
    fileEnv,
  );

  return {
    ...(openaiApiKey !== undefined ? { openaiApiKey } : {}),
    ...(anthropicApiKey !== undefined ? { anthropicApiKey } : {}),
    ...(googleApiKey !== undefined ? { googleApiKey } : {}),
    ...(xaiApiKey !== undefined ? { xaiApiKey } : {}),
    ...(mistralApiKey !== undefined ? { mistralApiKey } : {}),
    ...(vercelGatewayApiKey !== undefined ? { vercelGatewayApiKey } : {}),
  };
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
const DEFAULT_OPENAI_ENV_VAR = "OPENAI_API_KEY";
const DEFAULT_ANTHROPIC_ENV_VAR = "ANTHROPIC_API_KEY";
const DEFAULT_GOOGLE_ENV_VARS = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GEMINI_API_KEY",
] as const;
const DEFAULT_XAI_ENV_VAR = "XAI_API_KEY";
const DEFAULT_MISTRAL_ENV_VAR = "MISTRAL_API_KEY";
const DEFAULT_VERCEL_GATEWAY_ENV_VAR = "AI_GATEWAY_API_KEY";
