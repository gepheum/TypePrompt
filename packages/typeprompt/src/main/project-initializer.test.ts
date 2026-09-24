import { expect } from "buckwheat";
import { afterEach, beforeEach, describe, it } from "mocha";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compile } from "@typeprompt/core/compiler/compiler.js";
import { parseConfigYaml } from "@typeprompt/core/config/config-parser.js";
import {
  DEFAULT_CONFIG_YAML,
  HELLO_WORLD_TEMPLATE,
  initializeProject,
} from "./project-initializer.js";

describe("DEFAULT_CONFIG_YAML", () => {
  it("parses as a valid config", () => {
    const result = parseConfigYaml(DEFAULT_CONFIG_YAML);
    if (result.kind !== "success") {
      throw new Error(result.errors.map((e) => e.message).join("\n"));
    }
  });
});

describe("HELLO_WORLD_TEMPLATE", () => {
  it("compiles without errors", () => {
    const result = compile(
      { "hello-world.xml": HELLO_WORLD_TEMPLATE },
      { cache: null },
    );
    if (result.anyErrors) {
      const messages = Object.values(result.finalErrors)
        .flat()
        .map((e) => e.message)
        .join("\n");
      throw new Error(messages);
    }
  });
});

describe("initializeProject", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "typeprompt-init-test-"));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("generates typeprompt.yml and prompts/hello-world.xml in a temporary directory", () => {
    initializeProject(tempDir);

    const configPath = join(tempDir, "typeprompt.yml");
    const templatePath = join(tempDir, "prompts", "hello-world.xml");

    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(templatePath)).toBe(true);

    // Read typeprompt.yml and uncomment all commented lines under "gen:"
    const rawConfig = readFileSync(configPath, "utf8");
    const lines = rawConfig.split("\n");
    const genIndex = lines.findIndex((line) => line.trim() === "gen:");
    expect(genIndex >= 0).toBe(true);

    const uncommentedLines = lines.map((line, idx) => {
      if (idx > genIndex && line.startsWith("  #")) {
        return line.replace(/^ {2}# ?/, "  ");
      }
      return line;
    });
    const uncommentedConfig = uncommentedLines.join("\n");

    // Validate config with config-parser
    const configResult = parseConfigYaml(uncommentedConfig);
    if (configResult.kind !== "success") {
      throw new Error(
        `Config validation failed:\n${configResult.errors.map((e) => e.message).join("\n")}`,
      );
    }

    expect(configResult.config.include).toBe("prompts/**/*.xml");
    expect(configResult.config.gen).toMatch({
      cpp: { file: "./prompts.gen.h", rootNamespace: "typeprompt" },
      csharp: { file: "./Prompts.generated.cs", rootNamespace: "TypePrompt" },
      dart: { file: "../lib/prompts.g.dart" },
      kotlin: {
        file: "./src/main/kotlin/Prompts_Generated.kt",
        package: "com.example.prompts",
      },
      python: { file: "./prompts_gen.py" },
      rust: { file: "./src/generated/prompts.rs" },
      swift: {
        file: "./Sources/Prompts.Generated.swift",
        rootNamespace: "TypePrompt",
      },
      typescript: { file: "./prompts.gen.ts" },
    });

    // Read and validate the generated template file with compiler.ts
    const templateContent = readFileSync(templatePath, "utf8");
    const compileResult = compile(
      { "prompts/hello-world.xml": templateContent },
      { cache: null },
    );

    if (compileResult.anyErrors) {
      const messages = Object.values(compileResult.finalErrors)
        .flat()
        .map((e) => e.message)
        .join("\n");
      throw new Error(`Template compilation failed:\n${messages}`);
    }

    expect(compileResult.anyErrors).toBe(false);
    expect(compileResult.templates["Main:SayHello"]?.kind).toBe("template");
  });

  it("does not overwrite existing config or template files", () => {
    const configPath = join(tempDir, "typeprompt.yml");
    const promptsDir = join(tempDir, "prompts");
    const templatePath = join(promptsDir, "hello-world.xml");

    writeFileSync(configPath, "custom config", "utf8");

    initializeProject(tempDir);

    expect(readFileSync(configPath, "utf8")).toBe("custom config");
    expect(existsSync(templatePath)).toBe(true);

    writeFileSync(templatePath, "custom template", "utf8");
    initializeProject(tempDir);

    expect(readFileSync(templatePath, "utf8")).toBe("custom template");
  });
});
