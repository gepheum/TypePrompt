import type { Config } from "@typeprompt/core";
import { expect } from "buckwheat";
import { describe, it } from "mocha";
import * as Paths from "node:path";
import { ExitError } from "../../main/exit-error.js";
import type { AsyncFileReader } from "../../util/io.js";
import { readApiKeys } from "./api-key-reader.js";

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

describe("readApiKeys", () => {
  it("reads default environment variable names when play config is omitted", async () => {
    const apiKeys = await readApiKeys(BASE_CONFIG, "/workspace/project", {
      fileReader: makeFakeAsyncFileReader({}),
      env: {
        OPENAI_API_KEY: "sk-openai-default",
        ANTHROPIC_API_KEY: "sk-ant-default",
        GOOGLE_GENERATIVE_AI_API_KEY: "google-default",
        XAI_API_KEY: "xai-default",
        MISTRAL_API_KEY: "mistral-default",
        AI_GATEWAY_API_KEY: "vck-default",
      },
    });

    expect(apiKeys).toMatch({
      openai: "sk-openai-default",
      anthropic: "sk-ant-default",
      google: "google-default",
      xai: "xai-default",
      mistral: "mistral-default",
      vercelGateway: "vck-default",
    });
  });

  it("falls back to GEMINI_API_KEY when GOOGLE_GENERATIVE_AI_API_KEY is unset and google env var is not configured", async () => {
    const apiKeys = await readApiKeys(BASE_CONFIG, "/workspace/project", {
      fileReader: makeFakeAsyncFileReader({}),
      env: {
        GEMINI_API_KEY: "gemini-fallback-key",
      },
    });

    expect(apiKeys).toMatch({
      google: "gemini-fallback-key",
    });
  });

  it("reads custom environment variable names from play.apiKeyEnvVars", async () => {
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

    const apiKeys = await readApiKeys(config, "/workspace/project", {
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
    });

    expect(apiKeys).toMatch({
      openai: "custom-openai",
      anthropic: "custom-anthropic",
      google: "custom-google",
      xai: "custom-xai",
      mistral: "custom-mistral",
      vercelGateway: "custom-gateway",
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

    const apiKeys = await readApiKeys(config, "/workspace/project", {
      fileReader: makeFakeAsyncFileReader({}),
      env: {
        GOOGLE_GENERATIVE_AI_API_KEY: "default-google",
        GEMINI_API_KEY: "default-gemini",
      },
    });

    expect(apiKeys).toMatch({});
  });

  it("loads variables from default .env in projectDir when play.envFile is omitted", async () => {
    const fileReader = makeFakeAsyncFileReader({
      [Paths.resolve("/workspace/project/.env")]: [
        "# Comment line",
        "OPENAI_API_KEY=dotenv-openai-key",
        'AI_GATEWAY_API_KEY="dotenv-gateway-key"',
      ].join("\n"),
    });

    const apiKeys = await readApiKeys(BASE_CONFIG, "/workspace/project", {
      fileReader,
      env: {},
    });

    expect(apiKeys).toMatch({
      openai: "dotenv-openai-key",
      vercelGateway: "dotenv-gateway-key",
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

    const apiKeys = await readApiKeys(config, "/workspace/packages/prompts", {
      fileReader,
      env: {},
    });

    expect(apiKeys).toMatch({
      google: "monorepo-google-secret",
    });
  });

  it("gives process env precedence over .env file values", async () => {
    const fileReader = makeFakeAsyncFileReader({
      [Paths.resolve("/workspace/project/.env")]: [
        "OPENAI_API_KEY=from-dotenv",
        "ANTHROPIC_API_KEY=from-dotenv-anthropic",
      ].join("\n"),
    });

    const apiKeys = await readApiKeys(BASE_CONFIG, "/workspace/project", {
      fileReader,
      env: {
        OPENAI_API_KEY: "from-process-env",
        ANTHROPIC_API_KEY: "",
      },
    });

    expect(apiKeys).toMatch({
      openai: "from-process-env",
      anthropic: "from-dotenv-anthropic",
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
      await readApiKeys(config, "/workspace/project", {
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
