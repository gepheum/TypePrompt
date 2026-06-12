#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { ConfigParseError, parseConfigToml } from "./config-parser.js";
import { parseTemplateFile } from "./parser.js";
import { initializeProject } from "./project-initializer.js";
import { generateCode } from "./ts-code-generator.js";
import type { Error as ParseError, Template } from "./types.js";
import { validateTemplateFile } from "./validator.js";

type Command =
  | { readonly kind: "help" }
  | { readonly kind: "init"; readonly projectPath?: string }
  | { readonly kind: "gen"; readonly projectPath?: string }
  | { readonly kind: "error"; readonly message: string };

function main(): void {
  const command = parseCommandLine(process.argv.slice(2));

  if (command.kind === "error") {
    console.error(command.message);
    console.log();
    renderHelp();
    process.exitCode = 1;
    return;
  }

  if (command.kind === "help") {
    renderHelp();
    return;
  }

  try {
    if (command.kind === "init") {
        initializeProject(resolve(command.projectPath ?? process.cwd()));
      return;
    }

    const _: "gen" = command.kind;
    runGeneration(command.projectPath);
  } catch (error: unknown) {
    if (error instanceof ConfigParseError) {
      for (const message of error.messages) {
        console.error(message);
      }
      process.exitCode = 1;
      return;
    }

    if (error instanceof Error) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

function parseCommandLine(argv: readonly string[]): Command {
  const command = argv[0] ?? "help";

  if (command === "help") {
    return { kind: "help" };
  }

  if (command !== "init" && command !== "gen") {
    return {
      kind: "error",
      message: `Unknown command '${command}'.`,
    };
  }

  let projectPath: string | undefined;

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--project" || arg === "-p") {
      const value = argv[i + 1];
      if (!value) {
        return {
          kind: "error",
          message: `Missing value for ${arg}.`,
        };
      }
      projectPath = value;
      i += 1;
      continue;
    }

    return {
      kind: "error",
      message: `Unknown argument '${arg}'.`,
    };
  }

  if (command === "init") {
    return { kind: "init", projectPath };
  }
  return { kind: "gen", projectPath };
}

function renderHelp(): void {
  console.log("TypePrompt\n");
  console.log("Usage:");
  console.log("  npx typeprompt                 Show this help message");
  console.log("  npx typeprompt help            Show this help message");
  console.log("  npx typeprompt init [-p PATH]  Initialize a new TypePrompt project");
  console.log("  npx typeprompt gen [-p PATH]   Generate TypeScript code");
}

function runGeneration(projectPath?: string): void {
  const configPath = resolveConfigPath(projectPath);
  const configDir = dirname(configPath);

  if (!existsSync(configPath)) {
    throw new Error(`Cannot find ${configPath}`);
  }

  const config = parseConfigToml({
    content: readFileSync(configPath, "utf8"),
    path: configPath,
  });

  if (!config.generatedDotTsPath) {
    throw new Error(
      `${configPath}: missing required field 'generatedDotTsPath' (TypeScript is the only supported target)`,
    );
  }

  const inputDir = resolve(configDir, config.input ?? "prompts");
  if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
    throw new Error(`Input directory does not exist: ${inputDir}`);
  }

  const templateFiles = listTemplateFiles(inputDir);
  if (templateFiles.length === 0) {
    throw new Error(`No .tp files found in ${inputDir}`);
  }

  const templates: Template[] = [];
  const parserErrors: string[] = [];

  for (const filePath of templateFiles) {
    const parseResult = parseTemplateFile(readFileSync(filePath, "utf8"));
    templates.push(...parseResult.value.templates);

    for (const error of parseResult.errors) {
      parserErrors.push(formatParserError(filePath, error));
    }
  }

  const validatorErrors = validateTemplateFile({ templates }).map(
    (error) => `validator: ${error.message}`,
  );

  for (const error of parserErrors) {
    console.error(error);
  }
  for (const error of validatorErrors) {
    console.error(error);
  }

  if (parserErrors.length > 0 || validatorErrors.length > 0) {
    process.exitCode = 1;
    return;
  }

  const generatedPath = resolve(configDir, config.generatedDotTsPath);
  mkdirSync(dirname(generatedPath), { recursive: true });
  writeFileSync(generatedPath, generateCode(templates), "utf8");
  console.log(`Generated TypeScript written to ${generatedPath}`);
}

function resolveConfigPath(projectPath?: string): string {
  if (!projectPath) {
    return resolve(process.cwd(), "typeprompt.toml");
  }

  const resolved = resolve(projectPath);
  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    return join(resolved, "typeprompt.toml");
  }

  return resolved.endsWith(".toml") ? resolved : join(resolved, "typeprompt.toml");
}

function listTemplateFiles(inputDir: string): string[] {
  const files: string[] = [];

  const visit = (dirPath: string): void => {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".tp")) {
        files.push(fullPath);
      }
    }
  };

  visit(inputDir);
  files.sort((a, b) => a.localeCompare(b, "en-US"));
  return files;
}

function formatParserError(filePath: string, error: ParseError): string {
  const line = error.codeSlice.line.lineNumber + 1;
  const reason = error.message ?? `expected ${error.expected}`;
  const rel = relative(process.cwd(), filePath) || filePath;
  return `${rel}:${line}: ${reason}`;
}

main();
