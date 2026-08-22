import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function initializeProject(rootDir: string): void {
  const configPath = join(rootDir, "typeprompt.yml");
  const promptsDir = join(rootDir, "prompts");
  const helloWorldPath = join(promptsDir, "hello_world.tp");

  if (!existsSync(configPath)) {
    writeFileSync(configPath, DEFAULT_CONFIG_TOML, "utf8");
    console.log(`Created ${configPath}`);
  } else {
    console.log(`Config already exists: ${configPath}`);
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

const DEFAULT_CONFIG_TOML = [
  '# TypePrompt configuration. Run "npx typeprompt gen" to generate code.',
  "gen:",
  "  typescript:",
  "    enabled: true",
  "    file: ./prompts.gen.ts",
  "",
].join("\n");

const HELLO_WORLD_TEMPLATE = [
  "HelloWorld:",
  "  Say hello to $name.",
  "  $<schema>",
  "    interface Response {",
  "      message: string;",
  "    }",
  "  $</schema>",
  "  $<example>",
  '    {"message": "Hello"}',
  "  $</example>",
  "",
].join("\n");
