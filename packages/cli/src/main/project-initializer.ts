import { DEFAULT_CONFIG_YAML } from "@typeprompt/core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findConfigInDirectory } from "./config-reader.js";

export async function initializeProject(projectDir: string): Promise<void> {
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir);
    console.log(`Created ${projectDir}`);
  }

  const existingConfig = await findConfigInDirectory(projectDir);

  const promptsDir = join(projectDir, "prompts");
  const helloWorldPath = join(promptsDir, "hello-world.tp");

  if (!existingConfig) {
    const yamlConfigPath = join(projectDir, "typeprompt.yaml");
    writeFileSync(yamlConfigPath, DEFAULT_CONFIG_YAML, "utf8");
    console.log(`Created ${yamlConfigPath}`);
  } else {
    console.log(`Config already exists: ${existingConfig.configPath}`);
  }

  if (!existsSync(promptsDir)) {
    mkdirSync(promptsDir, { recursive: true });
    console.log(`Created ${promptsDir}`);
  }

  if (!existsSync(helloWorldPath)) {
    writeFileSync(helloWorldPath, HELLO_WORLD_TEMPLATE, "utf8");
    console.log(`Created ${helloWorldPath}`);
  } else {
    console.log(`Template already exists: ${helloWorldPath}`);
  }

  console.log("Done. Run: npx typeprompt gen");
}

export const HELLO_WORLD_TEMPLATE = `
<template name="SayHello">
  <schema>
    interface Input {
      /** The name of the person (or planet) to greet. */
      name: string;
      /** The language to greet them in. */
      language: string;
    }

    interface Output {
      /** The greeting. */
      greeting: string;
      /** A fun fact about the language. */
      funFact: string;
    }
  </schema>

  <system>
    You are a warm and knowledgeable greeter. Say hello to the given name
    in the requested language, then share one short fun fact about that language.
  </system>

  <user>
    Say hello to <insert val="input.name" /> in <insert val="input.language" />.
  </user>

  <examples>
    - input:
        name: World
        language: Hawaiian
      output:
        greeting: Aloha, World!
        funFact: Hawaiian has only 13 letters in its alphabet.
  </examples>
</template>
`.trimStart();
