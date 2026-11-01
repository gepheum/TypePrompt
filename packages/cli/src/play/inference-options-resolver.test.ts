import type { Config } from "@typeprompt/core";
import { expect } from "buckwheat";
import { describe, it } from "mocha";
import * as Paths from "node:path";
import { ExitError } from "../main/exit-error.js";
import type { AsyncFileReader } from "../util/io.js";
import { resolveInferenceOptions } from "./inference-options-resolver.js";

function makeFakeAsyncFileReader(files: {
  readonly [path: string]: string;
}): AsyncFileReader {
  return {
    async readTextFileAsync(path: string): Promise<string | undefined> {
      return files[Paths.resolve(path)];
    },
  };
}

const BASE_CONFIG: Config = {
  include: ["prompts/**/*.tp"],
};

describe("resolveInferenceOptions", () => {
  it("resolves default environment variable names when play config is omitted", async () => {
    const options = await resolveInferenceOptions(
      BASE_CONFIG,
      "/workspace/project",
      {
        fileReader: makeFakeAsyncFileReader({}),
        env: {
          OPENAI_API_KEY: "sk-openai-default",
          ANTHROPIC_API_KEY: "sk-ant-default",
          GOOGLE_GENERATIVE_AI_API_KEY: "google-default",
          XAI_API_KEY: "xai-default",
          MISTRAL_API_KEY: "mistral-default",
          AI_GATEWAY_API_KEY: "vck-default",
        },
      },
    );

    expect(options).toMatch({
      openaiApiKey: "sk-openai-default",
      anthropicApiKey: "sk-ant-default",
      googleApiKey: "google-default",
      xaiApiKey: "xai-default",
      mistralApiKey: "mistral-default",
      vercelGatewayApiKey: "vck-default",
    });
  });

  it("falls back to GEMINI_API_KEY when GOOGLE_GENERATIVE_AI_API_KEY is unset and google env var is not configured", async () => {
    const options = await resolveInferenceOptions(
      BASE_CONFIG,
      "/workspace/project",
      {
        fileReader: makeFakeAsyncFileReader({}),
        env: {
          GEMINI_API_KEY: "gemini-fallback-key",
        },
      },
    );

    expect(options).toMatch({
      googleApiKey: "gemini-fallback-key",
    });
  });

  it("resolves custom environment variable names from play.apiKeyEnvVars", async () => {
    const config: Config = {
      include: ["prompts/**/*.tp"],
      play: {
        apiKeyEnvVars: {
          openai: "MY_OPENAI_KEY",
          anthropic: "MY_ANTHROPIC_KEY",
          google: "MY_GOOGLE_KEY",
          xai: "MY_XAI_KEY",
          mistral: "MY_MISTRAL_KEY",
          vercelGateway: "MY_GATEWAY_KEY",
        },
      },
    };

    const options = await resolveInferenceOptions(
      config,
      "/workspace/project",
      {
        fileReader: makeFakeAsyncFileReader({}),
        env: {
          MY_OPENAI_KEY: "custom-openai",
          MY_ANTHROPIC_KEY: "custom-anthropic",
          MY_GOOGLE_KEY: "custom-google",
          MY_XAI_KEY: "custom-xai",
          MY_MISTRAL_KEY: "custom-mistral",
          MY_GATEWAY_KEY: "custom-gateway",
          OPENAI_API_KEY: "ignored-default-openai",
        },
      },
    );

    expect(options).toMatch({
      openaiApiKey: "custom-openai",
      anthropicApiKey: "custom-anthropic",
      googleApiKey: "custom-google",
      xaiApiKey: "custom-xai",
      mistralApiKey: "custom-mistral",
      vercelGatewayApiKey: "custom-gateway",
    });
  });

  it("does not fall back to default google env vars when play.apiKeyEnvVars.google is explicitly configured", async () => {
    const config: Config = {
      include: ["prompts/**/*.tp"],
      play: {
        apiKeyEnvVars: {
          google: "MY_CUSTOM_GOOGLE_KEY",
        },
      },
    };

    const options = await resolveInferenceOptions(
      config,
      "/workspace/project",
      {
        fileReader: makeFakeAsyncFileReader({}),
        env: {
          GOOGLE_GENERATIVE_AI_API_KEY: "default-google",
          GEMINI_API_KEY: "default-gemini",
        },
      },
    );

    expect(options).toMatch({});
  });

  it("loads variables from default .env in projectDir when play.envFile is omitted", async () => {
    const fileReader = makeFakeAsyncFileReader({
      [Paths.resolve("/workspace/project/.env")]: [
        "# Comment line",
        "OPENAI_API_KEY=dotenv-openai-key",
        'AI_GATEWAY_API_KEY="dotenv-gateway-key"',
      ].join("\n"),
    });

    const options = await resolveInferenceOptions(
      BASE_CONFIG,
      "/workspace/project",
      {
        fileReader,
        env: {},
      },
    );

    expect(options).toMatch({
      openaiApiKey: "dotenv-openai-key",
      vercelGatewayApiKey: "dotenv-gateway-key",
    });
  });

  it("loads variables from configured play.envFile relative to projectDir", async () => {
    const config: Config = {
      include: ["prompts/**/*.tp"],
      play: {
        envFile: "../../.env.local",
        apiKeyEnvVars: {
          google: "MONOREPO_GOOGLE_KEY",
        },
      },
    };

    const fileReader = makeFakeAsyncFileReader({
      [Paths.resolve("/workspace/.env.local")]:
        "MONOREPO_GOOGLE_KEY=monorepo-google-secret\n",
    });

    const options = await resolveInferenceOptions(
      config,
      "/workspace/packages/prompts",
      {
        fileReader,
        env: {},
      },
    );

    expect(options).toMatch({
      googleApiKey: "monorepo-google-secret",
    });
  });

  it("gives process env precedence over .env file values", async () => {
    const fileReader = makeFakeAsyncFileReader({
      [Paths.resolve("/workspace/project/.env")]: [
        "OPENAI_API_KEY=from-dotenv",
        "ANTHROPIC_API_KEY=from-dotenv-anthropic",
      ].join("\n"),
    });

    const options = await resolveInferenceOptions(
      BASE_CONFIG,
      "/workspace/project",
      {
        fileReader,
        env: {
          OPENAI_API_KEY: "from-process-env",
          ANTHROPIC_API_KEY: "",
        },
      },
    );

    expect(options).toMatch({
      openaiApiKey: "from-process-env",
      anthropicApiKey: "from-dotenv-anthropic",
    });
  });

  it("throws ExitError when configured play.envFile does not exist", async () => {
    const config: Config = {
      include: ["prompts/**/*.tp"],
      play: {
        envFile: "../missing.env",
      },
    };

    let caughtError: unknown;
    try {
      await resolveInferenceOptions(config, "/workspace/project", {
        fileReader: makeFakeAsyncFileReader({}),
        env: {},
      });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError instanceof ExitError).toBe(true);
    expect((caughtError as Error).message).toBe(
      `Cannot find ${Paths.resolve("/workspace/missing.env")}`,
    );
  });
});
